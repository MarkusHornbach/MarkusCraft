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

/**
 * `terrainChecksum(1337, { version: 3, options })` for every combination (Phase 8 part
 * B2a AC1.1), pinned once the cave density was tuned. They must never change. "flat/many"
 * and "balanced/many" equal version 2's: their spawn (and so the spawn shaft) lies far from
 * the origin and no tunnel touches its 3 × 3 chunks.
 */
export const TERRAIN_CHECKSUMS_1337_V3: Readonly<Record<string, number>> = {
  'flat/none': 1187198291,
  'flat/few': 2311718407,
  'flat/normal': 3116820216,
  'flat/many': 1702540350,
  'balanced/none': 3601326056,
  'balanced/few': 2671568332,
  'balanced/normal': 1711089731,
  'balanced/many': 2952111101,
  'hilly/none': 3597418401,
  'hilly/few': 620035875,
  'hilly/normal': 4167167292,
  'hilly/many': 1429350040,
};

/**
 * Generator 4 (Phase 8 part B3b AC1.3): `terrainChecksumAt(1337, { version: 4, options },
 * cx, cz)` over the 3 × 3 chunks around the chunk that holds the spawn shaft's chest
 * (`spawnChestChunk`), for every combination. They must never change, and none equals
 * generator 3's over the same chunks.
 */
export const TERRAIN_CHECKSUMS_1337_V4: Readonly<Record<string, number>> = {
  'flat/none': 1467969657,
  'flat/few': 3059417204,
  'flat/normal': 504657657,
  'flat/many': 4176848579,
  'balanced/none': 3023167536,
  'balanced/few': 3588130753,
  'balanced/normal': 3511865272,
  'balanced/many': 2371674030,
  'hilly/none': 960775768,
  'hilly/few': 3314468240,
  'hilly/normal': 2832059690,
  'hilly/many': 4158460090,
};

/**
 * `lootChecksum1337()` (`src/testing/lootChecksum.ts`, Phase 8 part B3b AC2.1): the derived
 * contents of every loot chest of seed 1337 (balanced, few) whose shaft lies within ±1 024
 * of the origin, then the spawn chest of each preset. Frozen: a change to the loot tables
 * or their draw is a new generator version.
 */
export const LOOT_CHECKSUM_1337_V4 = 2380617216;
