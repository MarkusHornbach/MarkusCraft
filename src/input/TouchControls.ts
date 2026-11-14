// TouchControls: touch source for Input. Feeds pointer events of fingers to a TouchTracker.
import {
  TOUCH_SPRINT_THRESHOLD,
  TOUCH_STICK_DEADZONE,
  TOUCH_STICK_RADIUS,
  TOUCH_STICK_ZONE_TOP,
} from '../game/config';
import { type TouchButton, type TouchSink, type TouchTarget, TouchTracker } from './TouchTracker';

const BUTTONS: readonly string[] = ['break', 'place', 'up', 'down', 'fly', 'menu', 'bag'];

export interface TouchControlsOptions {
  /** Element that contains the canvas, the HUD and the touch buttons. */
  root: HTMLElement;
  sink: TouchSink;
  /** Touches are ignored while this returns false (e.g. the menu is open). */
  isActive: () => boolean;
}

/**
 * Finds what a finger landed on: an element with `data-touch="<button>"`, a slot of the
 * block bar, or the free game view. Returns null for anything else (menu, overlays).
 */
function resolveTarget(element: Element): TouchTarget | null {
  const button = element.closest<HTMLElement>('[data-touch]')?.dataset.touch;
  if (button !== undefined && BUTTONS.includes(button)) {
    return { kind: 'button', button: button as TouchButton };
  }
  const slot = element.closest<HTMLElement>('.hotbar-slot')?.dataset.slot;
  if (slot !== undefined) return { kind: 'slot', slot: Number(slot) };
  if (element.closest('.game-canvas, .hud, .touch-hud')) return { kind: 'surface' };
  return null;
}

export class TouchControls {
  readonly tracker: TouchTracker;
  private readonly root: HTMLElement;
  private readonly isActive: () => boolean;
  private readonly listeners = new AbortController();

  constructor(options: TouchControlsOptions) {
    this.root = options.root;
    this.isActive = options.isActive;
    this.tracker = new TouchTracker(options.sink, {
      stickRadius: TOUCH_STICK_RADIUS,
      deadzone: TOUCH_STICK_DEADZONE,
      sprintThreshold: TOUCH_SPRINT_THRESHOLD,
      stickZoneTop: TOUCH_STICK_ZONE_TOP,
    });
    const signal = this.listeners.signal;
    this.root.addEventListener('pointerdown', (e) => this.onDown(e), { signal });
    // A finger keeps reporting to the element it landed on; listening on the window
    // also catches the events when that element was hidden meanwhile.
    window.addEventListener('pointermove', (e) => this.onMove(e), { signal });
    window.addEventListener('pointerup', (e) => this.onUp(e), { signal });
    window.addEventListener('pointercancel', (e) => this.onUp(e), { signal });
    window.addEventListener('blur', () => this.tracker.reset(), { signal });
  }

  /** Removes all listeners and lifts all fingers. */
  dispose(): void {
    this.listeners.abort();
    this.tracker.reset();
  }

  private onDown(e: PointerEvent): void {
    if (e.pointerType !== 'touch' || !this.isActive()) return;
    if (!(e.target instanceof Element)) return;
    const target = resolveTarget(e.target);
    if (!target) return;
    // Keeps the browser from also sending mouse events for this touch.
    e.preventDefault();
    const rect = this.root.getBoundingClientRect();
    this.tracker.down(
      e.pointerId,
      target,
      e.clientX - rect.left,
      e.clientY - rect.top,
      rect.width,
      rect.height,
    );
  }

  private onMove(e: PointerEvent): void {
    if (e.pointerType !== 'touch') return;
    const rect = this.root.getBoundingClientRect();
    this.tracker.move(e.pointerId, e.clientX - rect.left, e.clientY - rect.top);
  }

  private onUp(e: PointerEvent): void {
    if (e.pointerType !== 'touch') return;
    this.tracker.up(e.pointerId);
  }
}
