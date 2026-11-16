// GamepadSource: the controller as an input source. Polls the browser's gamepads once per
// rendered frame, chooses the pad, runs the PadMapper and feeds Input while the game is
// played; everything else (menus) gets the frame through `onFrame`.
import type { HeldAction, Input } from './Input';
import { PAD_ACTIVATE_THRESHOLD, PAD_BUTTON_DOWN } from '../game/config';
import { PAD_BUTTONS, type PadFrame, PadMapper } from './padMapping';

/** Where the controller's input goes: the game itself, or whatever covers it. */
export type PadTarget = 'play' | 'other';

export interface GamepadSourceOptions {
  input: Input;
  target: () => PadTarget;
  /** Every frame of the pad in use, after Input got its part (if the target is `play`). */
  onFrame: (frame: PadFrame, target: PadTarget, elapsedMs: number) => void;
  /** The pad was used: a press, or a stick pushed beyond the activation threshold. */
  onUse: () => void;
  /** A supported pad was reported. */
  onConnect: () => void;
  /** The pad in use went away; everything it held has been released. */
  onDisconnect: () => void;
  /** A button was pressed on a pad whose mapping is not `standard`. */
  onUnsupported: () => void;
  /** Replaces `navigator.getGamepads` (unit tests); the browser's by default. */
  getPads?: () => ArrayLike<Gamepad | null>;
}

/** What `getState().pad` reports. */
export interface PadState {
  connected: number;
  active: boolean;
  polls: number;
  unsupported: boolean;
}

function browserPads(): ArrayLike<Gamepad | null> {
  try {
    return typeof navigator.getGamepads === 'function' ? navigator.getGamepads() : [];
  } catch {
    // A page in a frame without the permission throws.
    return [];
  }
}

/** Value of a button; some browsers report digital buttons by `pressed` only. */
function buttonValue(button: GamepadButton | undefined): number {
  if (!button) return 0;
  return button.value > 0 ? button.value : button.pressed ? 1 : 0;
}

function anyInput(pad: Gamepad): boolean {
  for (let i = 0; i < pad.buttons.length; i++) {
    if (buttonValue(pad.buttons[i]) >= PAD_BUTTON_DOWN) return true;
  }
  const a = pad.axes;
  for (let i = 0; i + 1 < a.length; i += 2) {
    if (Math.hypot(a[i], a[i + 1]) > PAD_ACTIVATE_THRESHOLD) return true;
  }
  return false;
}

export class GamepadSource {
  private readonly options: GamepadSourceOptions;
  private readonly getPads: () => ArrayLike<Gamepad | null>;
  private readonly mapper = new PadMapper();
  /** Index of the pad in use, or −1. */
  private chosen = -1;
  /** Supported pads that were reported, by index (for the "connected" notice). */
  private readonly known = new Set<number>();
  /** Unsupported pads by index: whether a button was down at the last poll. */
  private readonly foreign = new Map<number, boolean | null>();
  private readonly buttons: number[] = new Array<number>(PAD_BUTTONS).fill(0);
  private readonly axes: number[] = [0, 0, 0, 0];
  private readonly snapshot = { buttons: this.buttons, axes: this.axes };
  /** What was handed to Input, so only changes are sent and all of it can be released. */
  private readonly sentHeld = new Set<HeldAction>();
  private sentForward = 0;
  private sentStrafe = 0;
  private connectedCount = 0;
  private pollCount = 0;
  private unsupportedSeen = false;
  private lastTarget: PadTarget = 'play';

  constructor(options: GamepadSourceOptions) {
    this.options = options;
    this.getPads = options.getPads ?? browserPads;
  }

  setLook(sensitivity: number, invertY: boolean): void {
    this.mapper.setLook(sensitivity, invertY);
  }

  /** Whether a pad is in use (chosen and connected). */
  get inUse(): boolean {
    return this.chosen >= 0;
  }

  state(active: boolean): PadState {
    return {
      connected: this.connectedCount,
      active,
      polls: this.pollCount,
      unsupported: this.unsupportedSeen,
    };
  }

  /** One poll; `elapsedMs` is the time since the last rendered frame. */
  poll(elapsedMs: number): void {
    this.pollCount++;
    const pads = this.getPads();
    let connected = 0;
    let usable: Gamepad | null = null;
    let current: Gamepad | null = null;
    const seen = new Set<number>();
    for (let i = 0; i < pads.length; i++) {
      const pad = pads[i];
      if (!pad || !pad.connected) continue;
      connected++;
      seen.add(pad.index);
      if (pad.mapping !== 'standard') {
        this.watchForeign(pad);
        continue;
      }
      if (!this.known.has(pad.index)) {
        this.known.add(pad.index);
        this.options.onConnect();
      }
      if (pad.index === this.chosen) current = pad;
      else if (!usable && anyInput(pad)) usable = pad;
    }
    this.connectedCount = connected;
    for (const index of [...this.known]) if (!seen.has(index)) this.known.delete(index);
    for (const index of [...this.foreign.keys()]) if (!seen.has(index)) this.foreign.delete(index);

    if (this.chosen >= 0 && !current) {
      this.chosen = -1;
      this.release();
      this.mapper.reset();
      this.options.onDisconnect();
    }
    if (this.chosen < 0 && usable) {
      // The first pad on which something is pressed becomes the pad; that press is the
      // first snapshot and does nothing.
      this.chosen = usable.index;
      current = usable;
      this.mapper.reset();
    }
    if (!current) return;

    const target = this.options.target();
    // A button held across a change of target (a menu opened, play began) does nothing there.
    if (target !== this.lastTarget) this.mapper.blockHeld();
    this.lastTarget = target;
    this.read(current);
    const frame = this.mapper.update(this.snapshot, elapsedMs);
    if (frame.used) this.options.onUse();
    if (target === 'play') this.feed(frame, elapsedMs);
    else this.release();
    this.options.onFrame(frame, target, elapsedMs);
  }

  /** Lets go of everything the pad holds in Input (movement, break, place, sprint, …). */
  release(): void {
    const input = this.options.input;
    for (const action of this.sentHeld) input.setHeld(action, false);
    this.sentHeld.clear();
    if (this.sentForward !== 0 || this.sentStrafe !== 0) input.setMove(0, 0);
    this.sentForward = 0;
    this.sentStrafe = 0;
  }

  private read(pad: Gamepad): void {
    for (let i = 0; i < PAD_BUTTONS; i++) this.buttons[i] = buttonValue(pad.buttons[i]);
    for (let i = 0; i < 4; i++) this.axes[i] = pad.axes[i] ?? 0;
  }

  /** Input gets only changes, so keys and fingers that hold the same actions keep them. */
  private feed(frame: PadFrame, elapsedMs: number): void {
    const input = this.options.input;
    for (const action of this.sentHeld) {
      if (!frame.held.has(action)) {
        input.setHeld(action, false);
        this.sentHeld.delete(action);
      }
    }
    for (const action of frame.held) {
      if (!this.sentHeld.has(action)) {
        input.setHeld(action, true);
        this.sentHeld.add(action);
      }
    }
    if (frame.forward !== this.sentForward || frame.strafe !== this.sentStrafe) {
      input.setMove(frame.forward, frame.strafe);
      this.sentForward = frame.forward;
      this.sentStrafe = frame.strafe;
    }
    for (const press of frame.presses) input.press(press);
    if (frame.lookX !== 0 || frame.lookY !== 0) {
      const seconds = Math.max(0, Math.min(elapsedMs, 250)) / 1000;
      // Turning right lowers the yaw; looking up raises the pitch.
      input.addTurn(-frame.lookX * seconds, frame.lookY * seconds);
    }
  }

  /** The first press on a pad of another mapping is reported once per connection. */
  private watchForeign(pad: Gamepad): void {
    let down = false;
    for (let i = 0; i < pad.buttons.length; i++) {
      if (buttonValue(pad.buttons[i]) >= PAD_BUTTON_DOWN) down = true;
    }
    const before = this.foreign.get(pad.index);
    // null: already reported. undefined: first snapshot, whose press woke the pad.
    if (before === null) return;
    if (before === false && down) {
      this.foreign.set(pad.index, null);
      this.unsupportedSeen = true;
      this.options.onUnsupported();
      return;
    }
    this.foreign.set(pad.index, down);
  }
}
