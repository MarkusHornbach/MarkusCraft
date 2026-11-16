// Spatial navigation between the focusable elements of a screen, and the repeat of a held
// direction. No DOM: rectangles in, an index out.
import { PAD_NAV_DELAY_MS, PAD_NAV_REPEAT_MS } from '../game/config';

/** A rectangle in screen pixels, as `getBoundingClientRect` gives it. */
export interface FocusRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export type Direction = 'up' | 'down' | 'left' | 'right';

/** Weight of the distance across the direction against the distance along it. */
const ACROSS_WEIGHT = 3;
/**
 * Among candidates that score the same (e.g. several buttons under a wide one), the one
 * whose centre lies closest across the direction wins.
 */
const TIE_WEIGHT = 0.01;

/**
 * The element to move to from `rects[from]` in `direction`: among the elements whose
 * centre lies beyond the current element's edge in that direction, the one with the
 * smallest `along + 3 × across`. `along` is the distance between the centres in the
 * direction; `across` is 0 if the two rectangles overlap across the direction, otherwise
 * the distance between the centres across it. Equal scores go to the centre closest
 * across the direction, then to the earlier element. Returns −1
 * when nothing lies in that direction (there is no wrap-around).
 */
export function nextFocus(rects: readonly FocusRect[], from: number, direction: Direction): number {
  const current = rects[from];
  if (!current) return -1;
  const vertical = direction === 'up' || direction === 'down';
  const sign = direction === 'down' || direction === 'right' ? 1 : -1;
  const cx = (current.left + current.right) / 2;
  const cy = (current.top + current.bottom) / 2;
  // The edge the candidates' centres must lie beyond.
  const edge = vertical
    ? sign > 0
      ? current.bottom
      : current.top
    : sign > 0
      ? current.right
      : current.left;
  let best = -1;
  let bestScore = Infinity;
  for (let i = 0; i < rects.length; i++) {
    if (i === from) continue;
    const r = rects[i];
    const rx = (r.left + r.right) / 2;
    const ry = (r.top + r.bottom) / 2;
    const centreAlong = vertical ? ry : rx;
    if ((centreAlong - edge) * sign <= 0) continue;
    const along = (centreAlong - (vertical ? cy : cx)) * sign;
    const overlaps = vertical
      ? r.left < current.right && current.left < r.right
      : r.top < current.bottom && current.top < r.bottom;
    const offset = Math.abs(vertical ? rx - cx : ry - cy);
    const score = along + (overlaps ? 0 : ACROSS_WEIGHT * offset) + TIE_WEIGHT * offset;
    if (score < bestScore) {
      bestScore = score;
      best = i;
    }
  }
  return best;
}

/** The rectangle whose centre lies closest to `point`; −1 for an empty list. */
export function nearestFocus(rects: readonly FocusRect[], point: { x: number; y: number }): number {
  let best = -1;
  let bestDistance = Infinity;
  for (let i = 0; i < rects.length; i++) {
    const r = rects[i];
    const d = Math.hypot((r.left + r.right) / 2 - point.x, (r.top + r.bottom) / 2 - point.y);
    if (d < bestDistance) {
      bestDistance = d;
      best = i;
    }
  }
  return best;
}

/**
 * Repeat of a held direction: the first move at once, the next after `delayMs`, then every
 * `repeatMs`. Letting go or changing the direction starts over.
 */
export class NavRepeat {
  private held: Direction | null = null;
  private heldMs = 0;
  private nextMs = 0;

  constructor(
    private readonly delayMs = PAD_NAV_DELAY_MS,
    private readonly repeatMs = PAD_NAV_REPEAT_MS,
  ) {}

  /** The direction held now and the time since the last call; returns a move or null. */
  update(direction: Direction | null, elapsedMs: number): Direction | null {
    if (direction === null) {
      this.held = null;
      return null;
    }
    if (direction !== this.held) {
      this.held = direction;
      this.heldMs = 0;
      this.nextMs = this.delayMs;
      return direction;
    }
    this.heldMs += elapsedMs;
    // The small tolerance keeps sums of frame times from falling just short.
    if (this.heldMs < this.nextMs - 1e-6) return null;
    this.nextMs += this.repeatMs;
    // A long frame does not make up for the moves it skipped.
    if (this.nextMs <= this.heldMs) this.nextMs = this.heldMs + this.repeatMs;
    return direction;
  }

  reset(): void {
    this.held = null;
  }
}
