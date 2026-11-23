// Recorded terrain checksum, shared by the unit test (Node) and the browser test.

/**
 * `terrainChecksum(1337, 1)`: FNV-1a over the 3 × 3 chunks around the origin of seed 1337
 * with generator version 1. It must never change: saved worlds rely on this terrain.
 */
export const TERRAIN_CHECKSUM_1337_V1 = 884517734;

/**
 * `terrainChecksum(1337, { version: 2, options })` for every combination of the world
 * options (Phase 7 AC4.1), keyed `terrain/trees`. They must never change either.
 */
export const TERRAIN_CHECKSUMS_1337_V2: Readonly<Record<string, number>> = {
  'flat/none': 540694511,
  'flat/few': 2447464811,
  'flat/normal': 3526065988,
  'flat/many': 1702540350,
  'balanced/none': 1974487664,
  'balanced/few': 2045947540,
  'balanced/normal': 3796052107,
  'balanced/many': 2952111101,
  'hilly/none': 1869422224,
  'hilly/few': 2709546558,
  'hilly/normal': 3992534389,
  'hilly/many': 1986712728,
};
