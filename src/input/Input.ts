// Input: one abstraction over keyboard, mouse and pointer lock. Exposes state ("is
// move-forward held", "look delta since last frame") and reports discrete presses.
import { HOTBAR_SLOTS } from '../game/config';

export type HeldAction =
  'forward' | 'back' | 'left' | 'right' | 'jump' | 'sprint' | 'descend' | 'break' | 'place';

export type PressAction =
  | { type: 'toggleFly' }
  | { type: 'toggleDebug' }
  | { type: 'break' }
  | { type: 'place' }
  | { type: 'selectSlot'; slot: number }
  | { type: 'cycleSlot'; direction: 1 | -1 };

const KEY_HELD: Record<string, HeldAction> = {
  KeyW: 'forward',
  KeyS: 'back',
  KeyA: 'left',
  KeyD: 'right',
  Space: 'jump',
  ShiftLeft: 'sprint',
  ShiftRight: 'sprint',
  KeyC: 'descend',
};

const MOUSE_HELD: Record<number, 'break' | 'place'> = { 0: 'break', 2: 'place' };

export interface InputOptions {
  /** Element that receives mouse buttons and owns the pointer lock. */
  element: HTMLElement;
  /** Input is ignored while this returns false (e.g. the pause screen is open). */
  isActive: () => boolean;
  onPress: (action: PressAction) => void;
}

export class Input {
  private readonly held = new Set<HeldAction>();
  private lookX = 0;
  private lookY = 0;
  private readonly element: HTMLElement;
  private readonly isActive: () => boolean;
  private readonly onPress: (action: PressAction) => void;

  constructor(options: InputOptions) {
    this.element = options.element;
    this.isActive = options.isActive;
    this.onPress = options.onPress;

    window.addEventListener('keydown', (e) => this.onKeyDown(e));
    window.addEventListener('keyup', (e) => this.onKeyUp(e));
    window.addEventListener('blur', () => this.reset());
    this.element.addEventListener('mousedown', (e) => this.onMouseDown(e));
    window.addEventListener('mouseup', (e) => this.onMouseUp(e));
    // Right click places blocks; the browser menu would get in the way.
    this.element.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('mousemove', (e) => this.onMouseMove(e));
    this.element.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });
  }

  isHeld(action: HeldAction): boolean {
    return this.held.has(action);
  }

  /** Forgets all held keys and pending look movement (used when the game pauses). */
  reset(): void {
    this.held.clear();
    this.lookX = 0;
    this.lookY = 0;
  }

  /** Adds a look delta in pixels, as if the mouse had moved. */
  addLook(dx: number, dy: number): void {
    this.lookX += dx;
    this.lookY += dy;
  }

  /** Returns the look delta accumulated since the last call and clears it. */
  consumeLook(): { dx: number; dy: number } {
    const delta = { dx: this.lookX, dy: this.lookY };
    this.lookX = 0;
    this.lookY = 0;
    return delta;
  }

  get pointerLocked(): boolean {
    return document.pointerLockElement === this.element;
  }

  private onKeyDown(e: KeyboardEvent): void {
    if (!this.isActive()) return;
    // F3 would open the browser's search bar, Space would scroll.
    if (e.code === 'F3' || e.code === 'Space') e.preventDefault();
    const heldAction = KEY_HELD[e.code];
    if (heldAction) {
      this.held.add(heldAction);
      return;
    }
    if (e.repeat) return;
    if (e.code === 'KeyF') this.onPress({ type: 'toggleFly' });
    else if (e.code === 'F3') this.onPress({ type: 'toggleDebug' });
    else if (/^Digit[1-9]$/.test(e.code)) {
      const slot = Number(e.code.slice(5));
      if (slot <= HOTBAR_SLOTS) this.onPress({ type: 'selectSlot', slot });
    }
  }

  private onKeyUp(e: KeyboardEvent): void {
    const heldAction = KEY_HELD[e.code];
    if (heldAction) this.held.delete(heldAction);
  }

  private onMouseDown(e: MouseEvent): void {
    if (!this.isActive()) return;
    const action = MOUSE_HELD[e.button];
    if (!action) return;
    e.preventDefault();
    this.held.add(action);
    this.onPress({ type: action });
  }

  private onMouseUp(e: MouseEvent): void {
    const action = MOUSE_HELD[e.button];
    if (action) this.held.delete(action);
  }

  private onMouseMove(e: MouseEvent): void {
    if (!this.isActive() || !this.pointerLocked) return;
    this.lookX += e.movementX;
    this.lookY += e.movementY;
  }

  private onWheel(e: WheelEvent): void {
    if (!this.isActive() || e.deltaY === 0) return;
    e.preventDefault();
    this.onPress({ type: 'cycleSlot', direction: e.deltaY > 0 ? 1 : -1 });
  }
}
