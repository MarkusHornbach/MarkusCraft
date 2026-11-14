// TouchTracker: turns finger events into game input (stick, look drag, buttons). No DOM.
import type { HeldAction, PressAction } from './Input';

export type TouchButton = 'break' | 'place' | 'up' | 'down' | 'fly' | 'menu' | 'bag';

/** What a finger landed on. */
export type TouchTarget =
  { kind: 'button'; button: TouchButton } | { kind: 'slot'; slot: number } | { kind: 'surface' };

/** Where the tracker sends its results; `Input` implements this. */
export interface TouchSink {
  setHeld(action: HeldAction, held: boolean): void;
  setMove(forward: number, strafe: number): void;
  press(action: PressAction): void;
}

export interface TouchTrackerOptions {
  /** Finger travel in pixels for full deflection. */
  stickRadius: number;
  deadzone: number;
  sprintThreshold: number;
  /** The stick starts only below this fraction of the view height (left half). */
  stickZoneTop: number;
}

export interface StickOutput {
  /** -1 (back) … 1 (forward). */
  forward: number;
  /** -1 (left) … 1 (right). */
  strafe: number;
  sprint: boolean;
  /** Knob offset from the stick centre in pixels, limited to the radius. */
  knobX: number;
  knobY: number;
}

/** Stick position for drawing: centre and knob offset in view pixels. */
export interface StickView {
  originX: number;
  originY: number;
  knobX: number;
  knobY: number;
}

/**
 * Maps a finger offset from the stick centre (pixels, y down) to analog movement.
 * Inside the dead zone the output is zero; outside it equals the deflection, so half
 * deflection is half speed.
 */
export function stickOutput(
  dx: number,
  dy: number,
  radius: number,
  deadzone: number,
  sprintThreshold: number,
): StickOutput {
  let x = dx / radius;
  let y = dy / radius;
  const length = Math.hypot(x, y);
  if (length > 1) {
    x /= length;
    y /= length;
  }
  const knobX = x * radius;
  const knobY = y * radius;
  const deflection = Math.min(length, 1);
  if (deflection < deadzone) return { forward: 0, strafe: 0, sprint: false, knobX, knobY };
  // Screen y grows downwards; pushing the stick up means forward. `0 - y` avoids -0.
  return { forward: 0 - y, strafe: x, sprint: deflection > sprintThreshold, knobX, knobY };
}

type Finger =
  | { kind: 'stick'; originX: number; originY: number }
  | { kind: 'look'; lastX: number; lastY: number }
  | { kind: 'button'; button: TouchButton }
  | { kind: 'idle' };

const HELD_BY_BUTTON: Partial<Record<TouchButton, HeldAction>> = {
  break: 'break',
  place: 'place',
  up: 'jump',
  down: 'descend',
};

export class TouchTracker {
  private readonly fingers = new Map<number, Finger>();
  private readonly sink: TouchSink;
  private readonly options: TouchTrackerOptions;
  private lookX = 0;
  private lookY = 0;
  private sprinting = false;
  private stickView: StickView | null = null;

  constructor(sink: TouchSink, options: TouchTrackerOptions) {
    this.sink = sink;
    this.options = options;
  }

  /** The stick while a finger holds it, for the on-screen display. */
  get stick(): StickView | null {
    return this.stickView;
  }

  /** A finger went down at (x, y) in a view of the given size. */
  down(id: number, target: TouchTarget, x: number, y: number, width: number, height: number): void {
    if (this.fingers.has(id)) this.up(id);
    if (target.kind === 'button') {
      this.fingers.set(id, { kind: 'button', button: target.button });
      this.pressButton(target.button);
    } else if (target.kind === 'slot') {
      this.fingers.set(id, { kind: 'idle' });
      this.sink.press({ type: 'selectSlot', slot: target.slot });
    } else if (x < width / 2) {
      // Left half: the stick, once, and only in the lower part where the thumb rests.
      if (y >= height * this.options.stickZoneTop && !this.has('stick')) {
        this.fingers.set(id, { kind: 'stick', originX: x, originY: y });
        this.stickView = { originX: x, originY: y, knobX: 0, knobY: 0 };
      } else {
        this.fingers.set(id, { kind: 'idle' });
      }
    } else if (!this.has('look')) {
      this.fingers.set(id, { kind: 'look', lastX: x, lastY: y });
    } else {
      // A second finger on the look area does nothing (no pinch gestures).
      this.fingers.set(id, { kind: 'idle' });
    }
  }

  move(id: number, x: number, y: number): void {
    const finger = this.fingers.get(id);
    if (!finger) return;
    if (finger.kind === 'look') {
      this.lookX += x - finger.lastX;
      this.lookY += y - finger.lastY;
      finger.lastX = x;
      finger.lastY = y;
    } else if (finger.kind === 'stick') {
      const o = this.options;
      const out = stickOutput(
        x - finger.originX,
        y - finger.originY,
        o.stickRadius,
        o.deadzone,
        o.sprintThreshold,
      );
      this.stickView = {
        originX: finger.originX,
        originY: finger.originY,
        knobX: out.knobX,
        knobY: out.knobY,
      };
      this.sink.setMove(out.forward, out.strafe);
      this.setSprint(out.sprint);
    }
  }

  up(id: number): void {
    const finger = this.fingers.get(id);
    if (!finger) return;
    this.fingers.delete(id);
    if (finger.kind === 'stick') {
      this.stickView = null;
      this.sink.setMove(0, 0);
      this.setSprint(false);
    } else if (finger.kind === 'button') {
      const held = HELD_BY_BUTTON[finger.button];
      // Another finger may still rest on the same button.
      if (held && !this.holdsButton(finger.button)) this.sink.setHeld(held, false);
    }
  }

  /** Lifts all fingers (the game paused or the controls were removed). */
  reset(): void {
    for (const id of [...this.fingers.keys()]) this.up(id);
    this.lookX = 0;
    this.lookY = 0;
  }

  /** Returns the look drag in pixels accumulated since the last call and clears it. */
  consumeLook(): { dx: number; dy: number } {
    const delta = { dx: this.lookX, dy: this.lookY };
    this.lookX = 0;
    this.lookY = 0;
    return delta;
  }

  private pressButton(button: TouchButton): void {
    const held = HELD_BY_BUTTON[button];
    if (held) this.sink.setHeld(held, true);
    if (button === 'break' || button === 'place') this.sink.press({ type: button });
    else if (button === 'fly') this.sink.press({ type: 'toggleFly' });
    else if (button === 'menu') this.sink.press({ type: 'menu' });
    else if (button === 'bag') this.sink.press({ type: 'inventory' });
  }

  private setSprint(sprint: boolean): void {
    if (sprint === this.sprinting) return;
    this.sprinting = sprint;
    this.sink.setHeld('sprint', sprint);
  }

  private has(kind: Finger['kind']): boolean {
    for (const finger of this.fingers.values()) if (finger.kind === kind) return true;
    return false;
  }

  private holdsButton(button: TouchButton): boolean {
    for (const finger of this.fingers.values()) {
      if (finger.kind === 'button' && finger.button === button) return true;
    }
    return false;
  }
}
