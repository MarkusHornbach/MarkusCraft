// Light of one chunk from scratch, from the blocks of its 3 × 3 chunks. Pure and fast.
import { CHUNK_SIZE, CHUNK_VOLUME, LIGHT_MAX, WORLD_HEIGHT } from '../../game/config';
import { fnv1a } from '../../util/rng';
import { BLOCK_LIGHT, type ChunkLookup, LIGHT_OPEN_SKY, type LightTables } from './lightRules';

// Light travels at most 15 cells and a chunk is 16 wide: the 3 × 3 chunks are all a
// chunk's light can depend on. Cells of that volume are addressed as X | Z << 6 | y << 12
// with X, Z ∈ 0..47 (the centre chunk is 16..31), so a queue entry unpacks with shifts.
const WIDTH = CHUNK_SIZE * 3;
const Z_SHIFT = 6;
const Y_SHIFT = 12;
const LAYER = CHUNK_SIZE * CHUNK_SIZE;

// Scratch memory, reused between calls. `work` is all zero outside a call.
const work = new Uint8Array((WORLD_HEIGHT + 1) << Y_SHIFT);
/** Per column: the lowest y from which everything up to the sky is clear (0..128). */
const heights = new Uint8Array(WIDTH * WIDTH);
const tops = new Int32Array(9);
const grid: Uint8Array[] = [];
const AIR_CHUNK = new Uint8Array(CHUNK_VOLUME);
let queue = new Int32Array(1 << 15);
let tail = 0;
let opacity: Uint8Array = BLOCK_LIGHT.opacity;

function push(cell: number): void {
  if (tail === queue.length) {
    const bigger = new Int32Array(queue.length * 2);
    bigger.set(queue);
    queue = bigger;
  }
  queue[tail++] = cell;
}

/** Light of `level` tries to enter cell (X, y, Z); `sky` cells of open columns are full. */
function enter(X: number, y: number, Z: number, level: number, sky: boolean): void {
  if (X < 0 || X >= WIDTH || Z < 0 || Z >= WIDTH || y < 0 || y >= WORLD_HEIGHT) return;
  if (sky && y >= heights[X + Z * WIDTH]) return;
  const block = grid[(X >> 4) + (Z >> 4) * 3][(X & 15) | ((Z & 15) << 4) | (y << 8)];
  const arrives = level - 1 - opacity[block];
  if (arrives <= 0) return;
  const cell = X | (Z << Z_SHIFT) | (y << Y_SHIFT);
  if (arrives <= work[cell]) return;
  work[cell] = arrives;
  push(cell);
}

/** Spreads the queued light until nothing changes. */
function flood(sky: boolean): void {
  for (let head = 0; head < tail; head++) {
    const cell = queue[head];
    const X = cell & 63;
    const Z = (cell >> Z_SHIFT) & 63;
    const y = cell >> Y_SHIFT;
    const level = sky && y >= heights[X + Z * WIDTH] ? LIGHT_MAX : work[cell];
    if (level <= 1) continue;
    enter(X, y - 1, Z, level, sky);
    enter(X - 1, y, Z, level, sky);
    enter(X + 1, y, Z, level, sky);
    enter(X, y, Z - 1, level, sky);
    enter(X, y, Z + 1, level, sky);
    enter(X, y + 1, Z, level, sky);
  }
}

/** Writes the levels the flood left for the centre chunk into `result` and clears them. */
function collect(result: Uint8Array, shift: number): void {
  for (let i = 0; i < tail; i++) {
    const cell = queue[i];
    const level = work[cell];
    if (level === 0) continue;
    work[cell] = 0;
    const X = cell & 63;
    const Z = (cell >> Z_SHIFT) & 63;
    if (X >> 4 !== 1 || Z >> 4 !== 1) continue;
    result[(X & 15) | ((Z & 15) << 4) | ((cell >> Y_SHIFT) << 8)] |= level << shift;
  }
  tail = 0;
}

/**
 * Light of the chunk `blocksAt(0, 0)`, one packed byte per cell (see `packLight`), in the
 * layout of the block data. A chunk that is missing counts as air. The result is the one
 * solution of the light rules; it does not depend on anything beyond the nine chunks.
 */
export function lightChunk(blocksAt: ChunkLookup, tables: LightTables = BLOCK_LIGHT): Uint8Array {
  opacity = tables.opacity;
  const emission = tables.emission;
  for (let gz = 0; gz < 3; gz++) {
    for (let gx = 0; gx < 3; gx++) grid[gx + gz * 3] = blocksAt(gx - 1, gz - 1) ?? AIR_CHUNK;
  }

  // Open columns: everything above the highest block that is not clear has full sky light.
  for (let g = 0; g < 9; g++) {
    const blocks = grid[g];
    let last = CHUNK_VOLUME - 1;
    while (last >= 0 && blocks[last] === 0) last--;
    const top = last >> 8;
    tops[g] = top;
    const X0 = (g % 3) * CHUNK_SIZE;
    const Z0 = Math.floor(g / 3) * CHUNK_SIZE;
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        let y = top;
        let i = lx + lz * CHUNK_SIZE + y * LAYER;
        while (y >= 0 && opacity[blocks[i]] === 0) {
          y--;
          i -= LAYER;
        }
        heights[X0 + lx + (Z0 + lz) * WIDTH] = y + 1;
      }
    }
  }

  const result = new Uint8Array(CHUNK_VOLUME);
  let highest = 0;
  for (let lz = 0; lz < CHUNK_SIZE; lz++) {
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      const h = heights[CHUNK_SIZE + lx + (CHUNK_SIZE + lz) * WIDTH];
      if (h > highest) highest = h;
    }
  }
  result.fill(LIGHT_OPEN_SKY, highest * LAYER);
  for (let lz = 0; lz < CHUNK_SIZE; lz++) {
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      const h = heights[CHUNK_SIZE + lx + (CHUNK_SIZE + lz) * WIDTH];
      for (let y = h; y < highest; y++) result[lx + lz * CHUNK_SIZE + y * LAYER] = LIGHT_OPEN_SKY;
    }
  }

  // Sky light spreads only from where an open column touches a cell that is not open:
  // the cell under it, and columns next to it that are closed higher up.
  for (let Z = 0; Z < WIDTH; Z++) {
    for (let X = 0; X < WIDTH; X++) {
      const h = heights[X + Z * WIDTH];
      let to = h;
      if (X > 0) to = Math.max(to, heights[X - 1 + Z * WIDTH] - 1);
      if (X < WIDTH - 1) to = Math.max(to, heights[X + 1 + Z * WIDTH] - 1);
      if (Z > 0) to = Math.max(to, heights[X + (Z - 1) * WIDTH] - 1);
      if (Z < WIDTH - 1) to = Math.max(to, heights[X + (Z + 1) * WIDTH] - 1);
      for (let y = h; y <= to; y++) push(X | (Z << Z_SHIFT) | (y << Y_SHIFT));
    }
  }
  flood(true);
  collect(result, 4);

  // Block light: every emitting block is a source, also an opaque one.
  let anyEmitter = false;
  for (let id = 0; id < 256; id++) if (emission[id] !== 0) anyEmitter = true;
  if (anyEmitter) {
    for (let g = 0; g < 9; g++) {
      const blocks = grid[g];
      const end = (tops[g] + 1) * LAYER;
      const X0 = (g % 3) * CHUNK_SIZE;
      const Z0 = Math.floor(g / 3) * CHUNK_SIZE;
      for (let i = 0; i < end; i++) {
        const level = emission[blocks[i]];
        if (level === 0) continue;
        const cell = (X0 + (i & 15)) | ((Z0 + ((i >> 4) & 15)) << Z_SHIFT) | ((i >> 8) << Y_SHIFT);
        work[cell] = level;
        push(cell);
      }
    }
    flood(false);
    collect(result, 0);
  }
  return result;
}

/**
 * 32-bit FNV-1a checksum over the light of the 3 × 3 chunks around the origin, given a
 * function that returns the light of a chunk. Two devices with the same value light the
 * same blocks the same way.
 */
export function lightChecksumOf(lightOf: (cx: number, cz: number) => Uint8Array): number {
  let hash: number | undefined;
  for (let cz = -1; cz <= 1; cz++) {
    for (let cx = -1; cx <= 1; cx++) hash = fnv1a(lightOf(cx, cz), hash);
  }
  return hash ?? 0;
}
