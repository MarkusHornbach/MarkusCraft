// Seeded random numbers and integer hashes: the only source of randomness in the core.

export type Rng = () => number;

/** mulberry32: small, fast PRNG returning floats in [0, 1). */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Integer in [0, n). */
export function randInt(rng: Rng, n: number): number {
  return Math.floor(rng() * n);
}

/** Avalanche mix of a 32-bit integer (murmur3 finalizer). */
export function hash32(n: number): number {
  let h = n >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/** Hash of a seed and two integer coordinates to an unsigned 32-bit integer. */
export function hash2(seed: number, x: number, z: number): number {
  let h = hash32(seed ^ 0x9e3779b9);
  h = hash32(h ^ Math.imul(x | 0, 0x27d4eb2d));
  h = hash32(h ^ Math.imul(z | 0, 0x165667b1));
  return h;
}

/** Like `hash2`, mapped to a float in [0, 1). */
export function hash2Float(seed: number, x: number, z: number): number {
  return hash2(seed, x, z) / 4294967296;
}

/** Derives an independent sub-seed, e.g. for separate noise layers of one world. */
export function deriveSeed(seed: number, salt: number): number {
  return hash32((seed >>> 0) ^ Math.imul(salt + 1, 0x9e3779b1));
}

/** 32-bit FNV-1a over bytes. `hash` continues a running checksum over several arrays. */
export function fnv1a(bytes: Uint8Array, hash = 0x811c9dc5): number {
  let h = hash;
  for (let i = 0; i < bytes.length; i++) {
    h ^= bytes[i];
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
