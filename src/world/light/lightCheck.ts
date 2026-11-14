// Reference implementation of the light rules: slow and obvious. The fast code is tested
// against it, and `verifyLight` uses it to check the stored light of a running game.
import { CHUNK_SIZE, LIGHT_MAX, WORLD_HEIGHT } from '../../game/config';
import { BLOCK_LIGHT, type LightTables, packLight, stepLight } from './lightRules';

const DIRECTIONS: readonly (readonly [number, number, number])[] = [
  [0, -1, 0],
  [0, 1, 0],
  [-1, 0, 0],
  [1, 0, 0],
  [0, 0, -1],
  [0, 0, 1],
];

/**
 * Light of a box of `sizeX` × `sizeZ` columns over the full height, from its blocks
 * (index `x + z * sizeX + y * sizeX * sizeZ`); the result has the same layout, one packed
 * byte per cell. Nothing is known about what lies around the box, so no light comes from
 * there: the result is exact for cells at least 15 cells away from the box's sides.
 */
export function checkLight(
  blocks: Uint8Array,
  sizeX: number,
  sizeZ: number,
  tables: LightTables = BLOCK_LIGHT,
): Uint8Array {
  const layer = sizeX * sizeZ;
  if (blocks.length !== layer * WORLD_HEIGHT) throw new Error('Block data has the wrong size');
  // Above the highest block there is only air: full sky light, and block light at most
  // 14 cells up. Nothing above that needs to be worked out.
  let last = blocks.length - 1;
  while (last >= 0 && blocks[last] === 0) last--;
  const height = Math.min(WORLD_HEIGHT, Math.floor(last / layer) + LIGHT_MAX + 1);
  const result = new Uint8Array(blocks.length).fill(packLight(LIGHT_MAX, 0), height * layer);

  for (const sky of [true, false]) {
    const levels = new Uint8Array(height * layer);
    const queue: number[] = [];
    if (sky) {
      // The cells above the box shine down into its top layer.
      for (let i = (height - 1) * layer; i < height * layer; i++) {
        levels[i] = stepLight(LIGHT_MAX, tables.opacity[blocks[i]], true);
        if (levels[i] > 0) queue.push(i);
      }
    } else {
      for (let i = 0; i < levels.length; i++) {
        levels[i] = tables.emission[blocks[i]];
        if (levels[i] > 0) queue.push(i);
      }
    }
    for (let head = 0; head < queue.length; head++) {
      const cell = queue[head];
      const x = cell % sizeX;
      const z = Math.floor(cell / sizeX) % sizeZ;
      const y = Math.floor(cell / layer);
      for (const [dx, dy, dz] of DIRECTIONS) {
        const nx = x + dx;
        const ny = y + dy;
        const nz = z + dz;
        if (nx < 0 || nx >= sizeX || nz < 0 || nz >= sizeZ || ny < 0 || ny >= height) continue;
        const next = nx + nz * sizeX + ny * layer;
        const arrives = stepLight(levels[cell], tables.opacity[blocks[next]], sky && dy === -1);
        if (arrives > levels[next]) {
          levels[next] = arrives;
          queue.push(next);
        }
      }
    }
    for (let i = 0; i < levels.length; i++) {
      result[i] = sky ? packLight(levels[i], 0) : result[i] | levels[i];
    }
  }
  return result;
}

/**
 * Puts the blocks of `countX` × `countZ` chunks into one box for `checkLight`. `blocksAt`
 * gets the place of a chunk in the group (0, 0 is the first); a missing chunk is air.
 */
export function joinChunks(
  blocksAt: (ix: number, iz: number) => Uint8Array | null,
  countX: number,
  countZ: number,
): Uint8Array {
  const sizeX = countX * CHUNK_SIZE;
  const layer = sizeX * countZ * CHUNK_SIZE;
  const box = new Uint8Array(layer * WORLD_HEIGHT);
  for (let iz = 0; iz < countZ; iz++) {
    for (let ix = 0; ix < countX; ix++) {
      const blocks = blocksAt(ix, iz);
      if (!blocks) continue;
      for (let y = 0; y < WORLD_HEIGHT; y++) {
        for (let lz = 0; lz < CHUNK_SIZE; lz++) {
          const from = lz * CHUNK_SIZE + y * CHUNK_SIZE * CHUNK_SIZE;
          const to = ix * CHUNK_SIZE + (iz * CHUNK_SIZE + lz) * sizeX + y * layer;
          box.set(blocks.subarray(from, from + CHUNK_SIZE), to);
        }
      }
    }
  }
  return box;
}

/**
 * The light `lightChunk` must give for the middle chunk of 3 × 3 chunks, worked out the
 * slow way. Same arguments and same layout of the result as `lightChunk`.
 */
export function checkChunkLight(
  blocksAt: (dx: number, dz: number) => Uint8Array | null,
  tables: LightTables = BLOCK_LIGHT,
): Uint8Array {
  const size = CHUNK_SIZE * 3;
  const box = checkLight(
    joinChunks((ix, iz) => blocksAt(ix - 1, iz - 1), 3, 3),
    size,
    size,
    tables,
  );
  const result = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE * WORLD_HEIGHT);
  for (let y = 0; y < WORLD_HEIGHT; y++) {
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      const from = CHUNK_SIZE + (CHUNK_SIZE + lz) * size + y * size * size;
      result.set(
        box.subarray(from, from + CHUNK_SIZE),
        lz * CHUNK_SIZE + y * CHUNK_SIZE * CHUNK_SIZE,
      );
    }
  }
  return result;
}
