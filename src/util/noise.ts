// Own 2D simplex noise with a seeded permutation, plus a fractal (fBm) helper.
import { mulberry32 } from './rng';

export type Noise2D = (x: number, y: number) => number;

const F2 = 0.5 * (Math.sqrt(3) - 1);
const G2 = (3 - Math.sqrt(3)) / 6;
/** Scales the raw simplex sum (unit-length gradients) so the output spans about [-1, 1]. */
const SCALE = 99;

// 12 gradient directions, evenly spread enough for 2D.
const GRAD_X = new Float32Array(12);
const GRAD_Y = new Float32Array(12);
for (let i = 0; i < 12; i++) {
  const a = (i / 12) * Math.PI * 2;
  GRAD_X[i] = Math.cos(a);
  GRAD_Y[i] = Math.sin(a);
}

/** Creates a 2D simplex noise function for a seed. Output lies in [-1, 1]. */
export function createNoise2D(seed: number): Noise2D {
  const rng = mulberry32(seed);
  const perm = new Uint8Array(512);
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = p[i];
    p[i] = p[j];
    p[j] = tmp;
  }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];

  return (x: number, y: number): number => {
    const s = (x + y) * F2;
    const i = Math.floor(x + s);
    const j = Math.floor(y + s);
    const t = (i + j) * G2;
    const x0 = x - (i - t);
    const y0 = y - (j - t);
    const i1 = x0 > y0 ? 1 : 0;
    const j1 = 1 - i1;
    const x1 = x0 - i1 + G2;
    const y1 = y0 - j1 + G2;
    const x2 = x0 - 1 + 2 * G2;
    const y2 = y0 - 1 + 2 * G2;
    const ii = i & 255;
    const jj = j & 255;

    let n = 0;
    let a = 0.5 - x0 * x0 - y0 * y0;
    if (a > 0) {
      const g = perm[ii + perm[jj]] % 12;
      a *= a;
      n += a * a * (GRAD_X[g] * x0 + GRAD_Y[g] * y0);
    }
    a = 0.5 - x1 * x1 - y1 * y1;
    if (a > 0) {
      const g = perm[ii + i1 + perm[jj + j1]] % 12;
      a *= a;
      n += a * a * (GRAD_X[g] * x1 + GRAD_Y[g] * y1);
    }
    a = 0.5 - x2 * x2 - y2 * y2;
    if (a > 0) {
      const g = perm[ii + 1 + perm[jj + 1]] % 12;
      a *= a;
      n += a * a * (GRAD_X[g] * x2 + GRAD_Y[g] * y2);
    }
    const v = n * SCALE;
    return v < -1 ? -1 : v > 1 ? 1 : v;
  };
}

/**
 * Fractal Brownian motion: sums `octaves` layers of noise, each with doubled frequency
 * (`lacunarity`) and reduced amplitude (`gain`). Normalised back to [-1, 1].
 */
export function fbm2D(
  noise: Noise2D,
  x: number,
  y: number,
  octaves: number,
  lacunarity = 2,
  gain = 0.5,
): number {
  let sum = 0;
  let amplitude = 1;
  let total = 0;
  let fx = x;
  let fy = y;
  for (let o = 0; o < octaves; o++) {
    // Offset each octave so their lattices do not line up at the origin.
    sum += amplitude * noise(fx + o * 17.31, fy - o * 9.73);
    total += amplitude;
    amplitude *= gain;
    fx *= lacunarity;
    fy *= lacunarity;
  }
  return sum / total;
}
