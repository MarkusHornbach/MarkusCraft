// Small math helpers shared by the pure core.

export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Hermite interpolation: 0 at `edge0`, 1 at `edge1`, smooth in between. */
export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

/** Modulo that is always non-negative for a positive divisor. */
export function mod(n: number, m: number): number {
  return ((n % m) + m) % m;
}

/** Floor division, correct for negative numbers (used for chunk coordinates). */
export function floorDiv(n: number, d: number): number {
  return Math.floor(n / d);
}
