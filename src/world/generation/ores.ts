// Ore veins and clay patches: pure functions of the seed and world coordinates.
//
// Space is divided into cells. A hash of the cell decides whether it holds a vein (or a
// patch), where its origin lies and how it grows. A chunk evaluates every cell whose vein
// could reach into it, so veins cross chunk borders and never depend on generation order.
import { CHUNK_SIZE, COAL_MAX_Y, COAL_MIN_Y, IRON_MAX_Y, IRON_MIN_Y } from '../../game/config';
import { hash2, hash2Float, hash32 } from '../../util/rng';
import { Block } from '../blocks';

/** Edge length of an ore cell in blocks. */
export const ORE_CELL = 6;
/** A vein stays within this many blocks of its origin on every axis. */
export const VEIN_REACH = 2;
export const VEIN_MIN_BLOCKS = 3;
export const VEIN_MAX_BLOCKS = 10;

export interface OreKind {
  block: number;
  minY: number;
  maxY: number;
  /** Chance that a cell holds a vein. */
  chance: number;
  salt: number;
}

// The chances are tuned so that coal replaces about 1.2 % and iron about 0.6 % of the
// stone in their height ranges (measured by the unit tests over five seeds).
export const ORE_KINDS: readonly OreKind[] = [
  { block: Block.COAL_ORE, minY: COAL_MIN_Y, maxY: COAL_MAX_Y, chance: 0.4, salt: 0xc0a1 },
  { block: Block.IRON_ORE, minY: IRON_MIN_Y, maxY: IRON_MAX_Y, chance: 0.2, salt: 0x1e07 },
];

const LAYER = CHUNK_SIZE * CHUNK_SIZE;
const BOX = VEIN_REACH * 2 + 1;
const BOX_CELLS = BOX * BOX * BOX;
const BOX_CENTRE = (BOX_CELLS - 1) / 2;
// Tables for the walk of a vein through the box around its origin. They replace
// branches on random data, which processors predict badly.
/** Offset of each box cell from the origin. */
const BOX_X = new Int8Array(BOX_CELLS);
const BOX_Y = new Int8Array(BOX_CELLS);
const BOX_Z = new Int8Array(BOX_CELLS);
/** Cell reached from cell `v` in direction `d` (index `v * 6 + d`); the walls hold it back. */
const BOX_STEP = new Uint8Array(BOX_CELLS * 6);
for (let v = 0; v < BOX_CELLS; v++) {
  const bx = v % BOX;
  const bz = Math.floor(v / BOX) % BOX;
  const by = Math.floor(v / (BOX * BOX));
  BOX_X[v] = bx - VEIN_REACH;
  BOX_Y[v] = by - VEIN_REACH;
  BOX_Z[v] = bz - VEIN_REACH;
  const moves = [
    [1, 0, 0],
    [-1, 0, 0],
    [0, 1, 0],
    [0, -1, 0],
    [0, 0, 1],
    [0, 0, -1],
  ];
  moves.forEach(([mx, my, mz], d) => {
    const nx = bx + mx;
    const ny = by + my;
    const nz = bz + mz;
    const inside = nx >= 0 && nx < BOX && ny >= 0 && ny < BOX && nz >= 0 && nz < BOX;
    BOX_STEP[v * 6 + d] = inside ? nx + nz * BOX + ny * BOX * BOX : v;
  });
}
/** Per box cell: the number of the last vein that occupied it. */
const stamps = new Uint16Array(BOX_CELLS);
let generation = 0;
const STEP = 0x9e3779b9;

function placeKind(
  kind: OreKind,
  seed: number,
  blocks: Uint8Array,
  x0: number,
  z0: number,
  maxHeight: number,
): void {
  const kindSeed = hash32(seed ^ kind.salt);
  const cellX0 = Math.floor((x0 - VEIN_REACH) / ORE_CELL);
  const cellX1 = Math.floor((x0 + CHUNK_SIZE - 1 + VEIN_REACH) / ORE_CELL);
  const cellZ0 = Math.floor((z0 - VEIN_REACH) / ORE_CELL);
  const cellZ1 = Math.floor((z0 + CHUNK_SIZE - 1 + VEIN_REACH) / ORE_CELL);
  const cellY0 = Math.floor((kind.minY - VEIN_REACH) / ORE_CELL);
  // Veins that lie completely above the highest column of the chunk are skipped.
  const top = Math.min(kind.maxY, maxHeight);
  const cellY1 = Math.floor((top + VEIN_REACH) / ORE_CELL);
  // Hashes are compared and reduced as 31-bit integers, which engines keep fast.
  const threshold = Math.floor(kind.chance * 0x80000000);

  for (let cellZ = cellZ0; cellZ <= cellZ1; cellZ++) {
    for (let cellX = cellX0; cellX <= cellX1; cellX++) {
      const columnHash = hash2(kindSeed, cellX, cellZ);
      for (let cellY = cellY0; cellY <= cellY1; cellY++) {
        let s = hash32(columnHash ^ Math.imul(cellY, 0x2545f491));
        if (s >>> 1 >= threshold) continue;
        // The bits of one hash give the origin and the size of the vein.
        const ox = cellX * ORE_CELL + ((s >>> 1) % ORE_CELL);
        const oy = cellY * ORE_CELL + ((s >>> 9) % ORE_CELL);
        const oz = cellZ * ORE_CELL + ((s >>> 17) % ORE_CELL);
        const size = VEIN_MIN_BLOCKS + ((s >>> 25) % (VEIN_MAX_BLOCKS - VEIN_MIN_BLOCKS + 1));
        if (oy - VEIN_REACH > top) continue;
        // The vein stays in the box around its origin: skip it if the box misses the chunk.
        const bx = ox - x0;
        const bz = oz - z0;
        if (bx < -VEIN_REACH || bx >= CHUNK_SIZE + VEIN_REACH) continue;
        if (bz < -VEIN_REACH || bz >= CHUNK_SIZE + VEIN_REACH) continue;

        // Random walk inside the box around the origin; every new cell joins the vein,
        // so the vein is one connected group of exactly `size` blocks. The walk is
        // driven by a linear congruential generator (integer arithmetic only).
        generation = (generation + 1) & 0xffff;
        if (generation === 0) {
          stamps.fill(0);
          generation = 1;
        }
        let v = BOX_CENTRE;
        let placed = 0;
        for (;;) {
          if (stamps[v] !== generation) {
            stamps[v] = generation;
            const lx = bx + BOX_X[v];
            const lz = bz + BOX_Z[v];
            const y = oy + BOX_Y[v];
            if (
              lx >= 0 &&
              lx < CHUNK_SIZE &&
              lz >= 0 &&
              lz < CHUNK_SIZE &&
              y >= kind.minY &&
              y <= kind.maxY
            ) {
              const i = lx + lz * CHUNK_SIZE + y * LAYER;
              if (blocks[i] === Block.STONE) blocks[i] = kind.block;
            }
            if (++placed === size) break;
          }
          s = (Math.imul(s, 1664525) + 1013904223) | 0;
          // The high bits of such a generator are the good ones.
          v = BOX_STEP[v * 6 + ((s >>> 20) % 6)];
        }
      }
    }
  }
}

/**
 * Replaces stone by the ore veins that touch the chunk at block origin (x0, z0).
 * `maxHeight` is the highest ground column of the chunk (no stone lies above it).
 */
export function placeOres(
  seed: number,
  blocks: Uint8Array,
  x0: number,
  z0: number,
  maxHeight: number,
): void {
  for (const kind of ORE_KINDS) placeKind(kind, seed, blocks, x0, z0, maxHeight);
}

/** Edge length of a clay cell in columns. */
export const CLAY_CELL = 12;
export const CLAY_MIN_RADIUS = 2;
export const CLAY_MAX_RADIUS = 4.5;
/** Chance that a cell holds a patch; tuned for about 8 % of the underwater columns. */
export const CLAY_CHANCE = 0.42;
const CLAY_REACH = Math.ceil(CLAY_MAX_RADIUS * 1.15);
const SALT_CLAY = 0xc1a7;

/**
 * Marks the clay columns of the chunk at (x0, z0). `columns` holds one flag per column
 * (index `lx + lz * 16`): the caller sets 1 where clay is possible (a lake bed under deep
 * enough water) and this function raises it to `CLAY_COLUMN` where a patch lies.
 */
export const CLAY_COLUMN = 2;
export function markClayColumns(seed: number, x0: number, z0: number, columns: Uint8Array): void {
  const claySeed = hash32(seed ^ SALT_CLAY);
  const cellX0 = Math.floor((x0 - CLAY_REACH) / CLAY_CELL);
  const cellX1 = Math.floor((x0 + CHUNK_SIZE - 1 + CLAY_REACH) / CLAY_CELL);
  const cellZ0 = Math.floor((z0 - CLAY_REACH) / CLAY_CELL);
  const cellZ1 = Math.floor((z0 + CHUNK_SIZE - 1 + CLAY_REACH) / CLAY_CELL);
  for (let cellZ = cellZ0; cellZ <= cellZ1; cellZ++) {
    for (let cellX = cellX0; cellX <= cellX1; cellX++) {
      let s = hash2(claySeed, cellX, cellZ);
      if (s >= CLAY_CHANCE * 4294967296) continue;
      s = hash32(s + STEP);
      const ox = cellX * CLAY_CELL + ((s >>> 1) % CLAY_CELL);
      s = hash32(s + STEP);
      const oz = cellZ * CLAY_CELL + ((s >>> 1) % CLAY_CELL);
      s = hash32(s + STEP);
      const radius = CLAY_MIN_RADIUS + (s / 4294967296) * (CLAY_MAX_RADIUS - CLAY_MIN_RADIUS);
      const r2 = radius * radius;
      const xa = Math.max(x0, ox - CLAY_REACH);
      const xb = Math.min(x0 + CHUNK_SIZE - 1, ox + CLAY_REACH);
      const za = Math.max(z0, oz - CLAY_REACH);
      const zb = Math.min(z0 + CHUNK_SIZE - 1, oz + CLAY_REACH);
      for (let z = za; z <= zb; z++) {
        for (let x = xa; x <= xb; x++) {
          const column = x - x0 + (z - z0) * CHUNK_SIZE;
          if (columns[column] !== 1) continue;
          const d2 = (x - ox) * (x - ox) + (z - oz) * (z - oz);
          if (d2 > r2 * 1.3) continue;
          // A ragged edge: columns near the rim belong to the patch by a per-column hash.
          if (d2 > r2 * (0.7 + 0.6 * hash2Float(claySeed, x, z))) continue;
          columns[column] = CLAY_COLUMN;
        }
      }
    }
  }
}
