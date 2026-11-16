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

/** Weight of the distance along the direction against the one across it (squared). */
const ALONG_WEIGHT = 13;
/**
 * Among candidates that score the same (e.g. several buttons under a wide one), the one
 * whose centre lies closest across the direction wins.
 */
const TIE_WEIGHT = 0.01;

/**
 * The element to move to from `rects[from]` in `direction`, as the focus finders of common
 * TV and phone interfaces choose it. Candidates are the elements whose centre lies beyond
 * the current element's edge in that direction.
 *
 * - Among those that overlap the current element across the direction (its "beam") the
 *   one with the smallest `along + 3 × across` wins: `along` is the distance between the
 *   centres, `across` is 0 for them (plan 5.6).
 * - The others compete by `13 × gap along² + gap across²`, the gaps between the
 *   rectangles: the nearest element in the direction wins over one that is merely less
 *   far to the side.
 * - The beam's best wins over the others' best when moving sideways, or when it starts
 *   before the other one ends; otherwise the lower of the two second scores wins.
 *
 * Equal scores go to the centre closest across the direction, then to the earlier element.
 * Returns −1 when nothing lies in that direction (there is no wrap-around).
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
  /** Distance from the edge to a rectangle's near (or far) side, along the direction. */
  const gapTo = (r: FocusRect, far: boolean): number => {
    const side = vertical
      ? sign > 0 === far
        ? r.bottom
        : r.top
      : sign > 0 === far
        ? r.right
        : r.left;
    return (side - edge) * sign;
  };
  const gapAcross = (r: FocusRect): number =>
    Math.max(
      0,
      vertical
        ? Math.max(r.left - current.right, current.left - r.right)
        : Math.max(r.top - current.bottom, current.top - r.bottom),
    );
  const offsetOf = (r: FocusRect): number =>
    Math.abs(vertical ? (r.left + r.right) / 2 - cx : (r.top + r.bottom) / 2 - cy);
  const weighted = (r: FocusRect): number => {
    const along = Math.max(0, gapTo(r, false));
    const across = gapAcross(r);
    return ALONG_WEIGHT * along * along + across * across + TIE_WEIGHT * offsetOf(r);
  };

  let beam = -1;
  let beamScore = Infinity;
  let other = -1;
  let otherScore = Infinity;
  for (let i = 0; i < rects.length; i++) {
    if (i === from) continue;
    const r = rects[i];
    const centreAlong = vertical ? (r.top + r.bottom) / 2 : (r.left + r.right) / 2;
    if ((centreAlong - edge) * sign <= 0) continue;
    const overlaps = vertical
      ? r.left < current.right && current.left < r.right
      : r.top < current.bottom && current.top < r.bottom;
    if (overlaps) {
      const along = (centreAlong - (vertical ? cy : cx)) * sign;
      const score = along + TIE_WEIGHT * offsetOf(r);
      if (score < beamScore) {
        beamScore = score;
        beam = i;
      }
    } else {
      const score = weighted(r);
      if (score < otherScore) {
        otherScore = score;
        other = i;
      }
    }
  }
  if (beam < 0 || other < 0) return beam >= 0 ? beam : other;
  const b = rects[beam];
  const o = rects[other];
  const otherInFront = gapTo(o, false) >= 0;
  if (!vertical || !otherInFront || gapTo(b, false) < gapTo(o, true)) return beam;
  return weighted(b) <= weighted(o) ? beam : other;
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
