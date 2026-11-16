// PadMapper: turns one snapshot of a controller (button values, stick axes) into game input:
// movement, look rate, held actions, presses and menu navigation. No DOM.
import {
  PAD_ACTIVATE_THRESHOLD,
  PAD_BUTTON_DOWN,
  PAD_BUTTON_UP,
  PAD_DEADZONE,
  PAD_LOOK_EXPONENT,
  PAD_LOOK_MAX_RAD_PER_S,
  PAD_MAX_ELAPSED_MS,
  PAD_NAV_THRESHOLD,
  PAD_RAMP_DELAY_MS,
  PAD_RAMP_FACTOR,
  PAD_RAMP_MS,
  PAD_RAMP_THRESHOLD,
} from '../game/config';
import { type Direction, NavRepeat } from './focusMove';
import type { HeldAction, PressAction } from './Input';

/** Button indices of the standard mapping. */
export const PadButton = {
  A: 0,
  B: 1,
  X: 2,
  Y: 3,
  LB: 4,
  RB: 5,
  LT: 6,
  RT: 7,
  SELECT: 8,
  START: 9,
  LS: 10,
  RS: 11,
  UP: 12,
  DOWN: 13,
  LEFT: 14,
  RIGHT: 15,
} as const;

/** Buttons of the standard mapping (16; a 17th "home" button is ignored). */
export const PAD_BUTTONS = 16;

/** What a button does in play: an action held while it is down, and/or one press. */
export interface PadBinding {
  button: number;
  held?: HeldAction;
  press?: PressAction;
}

/**
 * The mapping in play (plan 5.3). The left stick click is not here: it latches `sprint`
 * until the stick returns into its dead zone.
 */
export const PAD_PLAY_MAPPING: readonly PadBinding[] = [
  { button: PadButton.A, held: 'jump' },
  { button: PadButton.B, held: 'descend' },
  { button: PadButton.X, press: { type: 'toggleFly' } },
  { button: PadButton.Y, press: { type: 'inventory' } },
  { button: PadButton.LB, press: { type: 'cycleSlot', direction: -1 } },
  { button: PadButton.RB, press: { type: 'cycleSlot', direction: 1 } },
  { button: PadButton.LT, held: 'place', press: { type: 'place' } },
  { button: PadButton.RT, held: 'break', press: { type: 'break' } },
  { button: PadButton.START, press: { type: 'menu' } },
  { button: PadButton.LEFT, press: { type: 'cycleSlot', direction: -1 } },
  { button: PadButton.RIGHT, press: { type: 'cycleSlot', direction: 1 } },
];

/** One reading of a controller: button values 0..1 and stick axes −1..1 (y down). */
export interface PadSnapshot {
  buttons: ArrayLike<number>;
  axes: ArrayLike<number>;
}

/**
 * What one poll yields. The object and its arrays are reused by the next `update`: read
 * it before calling again.
 */
export interface PadFrame {
  /** Left stick after the dead zone: −1 (back) … 1 (forward), −1 (left) … 1 (right). */
  forward: number;
  strafe: number;
  /** Look rate in radians per second: x > 0 turns right, y > 0 looks up. */
  lookX: number;
  lookY: number;
  /** The held actions of the mapping (and `sprint`), down now. */
  held: Set<HeldAction>;
  /** Presses of the mapping in this poll, in button order. */
  presses: PressAction[];
  /** Button indices that went down / up in this poll. */
  pressed: number[];
  released: number[];
  /** A move of the menu focus in this poll (D-pad or left stick, with repeat), or null. */
  nav: Direction | null;
  /** Right stick vertically after the dead zone, −1 (up) … 1 (down): menu scrolling. */
  scroll: number;
  /** A button was pressed, or a stick pushed beyond the activation threshold. */
  used: boolean;
}

/** Applies the radial dead zone: zero inside, the rest rescaled to 0..1, direction kept. */
export function applyDeadzone(x: number, y: number, deadzone: number): { x: number; y: number } {
  const length = Math.hypot(x, y);
  if (length <= deadzone) return { x: 0, y: 0 };
  const scaled = Math.min(1, (length - deadzone) / (1 - deadzone));
  return { x: (x / length) * scaled, y: (y / length) * scaled };
}

export class PadMapper {
  private readonly mapping: readonly PadBinding[];
  private readonly down: boolean[] = [];
  /** Down in the first snapshot after a reset: reports nothing until released once. */
  private readonly blocked: boolean[] = [];
  private fresh = true;
  private sprint = false;
  private leftOutside = false;
  private rampMs = 0;
  private rampHeld = false;
  private sensitivity = 1;
  private invertY = false;
  private readonly nav = new NavRepeat();
  private readonly frame: PadFrame = {
    forward: 0,
    strafe: 0,
    lookX: 0,
    lookY: 0,
    held: new Set(),
    presses: [],
    pressed: [],
    released: [],
    nav: null,
    scroll: 0,
    used: false,
  };

  constructor(mapping: readonly PadBinding[] = PAD_PLAY_MAPPING) {
    this.mapping = mapping;
  }

  /** Controller sensitivity (a multiplier) and whether stick up looks down. */
  setLook(sensitivity: number, invertY: boolean): void {
    this.sensitivity = sensitivity;
    this.invertY = invertY;
  }

  /** Forgets everything: the next snapshot is a first one (a new or reconnected pad). */
  reset(): void {
    this.fresh = true;
    this.sprint = false;
    this.leftOutside = false;
    this.rampMs = 0;
    this.rampHeld = false;
    this.nav.reset();
    this.down.length = 0;
    this.blocked.length = 0;
  }

  /** Whether a button is down and counts (not blocked since the first snapshot). */
  isDown(button: number): boolean {
    return this.down[button] === true && this.blocked[button] !== true;
  }

  update(snapshot: PadSnapshot, elapsedMs: number): PadFrame {
    const dt = Math.max(0, Math.min(elapsedMs, PAD_MAX_ELAPSED_MS));
    const f = this.frame;
    f.presses.length = 0;
    f.pressed.length = 0;
    f.released.length = 0;
    f.held.clear();
    f.used = false;

    const buttons = snapshot.buttons;
    for (let i = 0; i < PAD_BUTTONS; i++) {
      const value = i < buttons.length ? buttons[i] : 0;
      const was = this.down[i] === true;
      // Hysteresis: a button goes down at 0.5 and up again below 0.35.
      const now = was ? value >= PAD_BUTTON_UP : value >= PAD_BUTTON_DOWN;
      this.down[i] = now;
      if (this.fresh) {
        // The press that woke the pad (or was down at a reset) does nothing.
        this.blocked[i] = now;
        continue;
      }
      if (this.blocked[i]) {
        if (!now) this.blocked[i] = false;
        continue;
      }
      if (now && !was) f.pressed.push(i);
      else if (!now && was) f.released.push(i);
    }
    this.fresh = false;
    if (f.pressed.length > 0) f.used = true;

    for (const binding of this.mapping) {
      if (binding.held && this.isDown(binding.button)) f.held.add(binding.held);
      if (binding.press && f.pressed.includes(binding.button)) f.presses.push(binding.press);
    }

    const axes = snapshot.axes;
    const lx = axes.length > 0 ? axes[0] : 0;
    const ly = axes.length > 1 ? axes[1] : 0;
    const rx = axes.length > 2 ? axes[2] : 0;
    const ry = axes.length > 3 ? axes[3] : 0;
    if (
      Math.hypot(lx, ly) > PAD_ACTIVATE_THRESHOLD ||
      Math.hypot(rx, ry) > PAD_ACTIVATE_THRESHOLD
    ) {
      f.used = true;
    }

    const left = applyDeadzone(lx, ly, PAD_DEADZONE);
    // Stick y grows downwards; pushing the stick up means forward. `0 - y` avoids -0.
    f.forward = 0 - left.y;
    f.strafe = left.x;
    // The stick click sprints until the stick returns into its dead zone.
    const outside = left.x !== 0 || left.y !== 0;
    if (f.pressed.includes(PadButton.LS)) this.sprint = true;
    else if (this.leftOutside && !outside) this.sprint = false;
    this.leftOutside = outside;
    if (this.sprint) f.held.add('sprint');

    const right = applyDeadzone(rx, ry, PAD_DEADZONE);
    const magnitude = Math.hypot(right.x, right.y);
    if (magnitude === 0) {
      f.lookX = 0;
      f.lookY = 0;
    } else {
      const rate =
        Math.pow(magnitude, PAD_LOOK_EXPONENT) * PAD_LOOK_MAX_RAD_PER_S * this.sensitivity;
      f.lookX = (right.x / magnitude) * rate;
      const up = (0 - right.y / magnitude) * rate;
      f.lookY = this.invertY ? 0 - up : up;
    }
    // The ramp: held fully sideways, turning speeds up so a full turn is quick.
    const ramping = Math.abs(right.x) > PAD_RAMP_THRESHOLD;
    this.rampMs = ramping && this.rampHeld ? this.rampMs + dt : 0;
    this.rampHeld = ramping;
    if (ramping && this.rampMs > PAD_RAMP_DELAY_MS) {
      const share = Math.min(1, (this.rampMs - PAD_RAMP_DELAY_MS) / PAD_RAMP_MS);
      f.lookX *= 1 + (PAD_RAMP_FACTOR - 1) * share;
    }

    f.scroll = right.y;
    f.nav = this.nav.update(this.navDirection(lx, ly), dt);
    return f;
  }

  /** The direction the D-pad (first) or the left stick points to, or null. */
  private navDirection(x: number, y: number): Direction | null {
    if (this.isDown(PadButton.UP)) return 'up';
    if (this.isDown(PadButton.DOWN)) return 'down';
    if (this.isDown(PadButton.LEFT)) return 'left';
    if (this.isDown(PadButton.RIGHT)) return 'right';
    if (Math.max(Math.abs(x), Math.abs(y)) < PAD_NAV_THRESHOLD) return null;
    if (Math.abs(x) > Math.abs(y)) return x > 0 ? 'right' : 'left';
    return y > 0 ? 'down' : 'up';
  }
}
