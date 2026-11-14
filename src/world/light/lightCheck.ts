// Reference implementation of the light rules: slow and obvious. The fast code is tested
// against it, and `verifyLight` uses it to check the stored light of a running game.
import { CHUNK_SIZE, LIGHT_MAX, WORLD_HEIGHT } from '../../game/config';
import { BLOCK_LIGHT, type LightTables, packLight, stepLight } from './lightRules';

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
  // Above the highest block there is only air: full sky light there, and block light at
  // most 14 cells up. Nothing above that needs to be worked out.
  let last = blocks.length - 1;
  while (last >= 0 && blocks[last] === 0) last--;
  const top = Math.floor(last / layer);
  const result = new Uint8Array(blocks.length);
  for (const sky of [true, false]) {
    const height = Math.min(WORLD_HEIGHT, top + (sky ? 2 : LIGHT_MAX));
    if (sky) result.fill(packLight(LIGHT_MAX, 0), height * layer);
    const levels = flood(blocks, sizeX, sizeZ, height, tables, sky);
    for (let i = 0; i < levels.length; i++) result[i] |= sky ? packLight(levels[i], 0) : levels[i];
  }
  return result;
}

/** One kind of light for the lowest `height` layers of a box, by the rules and nothing else. */
function flood(
  blocks: Uint8Array,
  sizeX: number,
  sizeZ: number,
  height: number,
  tables: LightTables,
  sky: boolean,
): Uint8Array {
  const layer = sizeX * sizeZ;
  // The box gets a wall of one cell on every side, so each cell has six neighbours. The
  // wall is opaque: nothing enters it. Only its top is open sky, which shines down.
  const wideX = sizeX + 2;
  const wideLayer = wideX * (sizeZ + 2);
  const cells = wideLayer * (height + 2);
  const opacity = new Uint8Array(cells).fill(LIGHT_MAX);
  const emission = new Uint8Array(cells);
  const wide = (x: number, y: number, z: number): number =>
    x + 1 + (z + 1) * wideX + (y + 1) * wideLayer;
  for (let y = 0; y < height; y++) {
    for (let z = 0; z < sizeZ; z++) {
      for (let x = 0; x < sizeX; x++) {
        const id = blocks[x + z * sizeX + y * layer];
        opacity[wide(x, y, z)] = tables.opacity[id];
        emission[wide(x, y, z)] = tables.emission[id];
      }
    }
  }
  // The six neighbours as steps through the array; the first one goes straight down.
  const steps = [-wideLayer, wideLayer, -1, 1, -wideX, wideX];
  {
    const levels = new Uint8Array(cells);
    // A work list of cells whose light rose and may raise their neighbours'.
    let queue = new Int32Array(cells);
    let count = 0;
    const add = (cell: number): void => {
      if (count === queue.length) {
        const bigger = new Int32Array(queue.length * 2);
        bigger.set(queue);
        queue = bigger;
      }
      queue[count++] = cell;
    };
    if (sky) {
      for (let z = 0; z < sizeZ; z++) {
        for (let x = 0; x < sizeX; x++) {
          levels[wide(x, height, z)] = LIGHT_MAX;
          add(wide(x, height, z));
        }
      }
    } else {
      for (let cell = 0; cell < cells; cell++) {
        levels[cell] = emission[cell];
        if (levels[cell] > 0) add(cell);
      }
    }
    for (let head = 0; head < count; head++) {
      const cell = queue[head];
      for (let direction = 0; direction < 6; direction++) {
        const next = cell + steps[direction];
        if (next < 0 || next >= cells) continue;
        const arrives = stepLight(levels[cell], opacity[next], sky && direction === 0);
        if (arrives > levels[next]) {
          levels[next] = arrives;
          add(next);
        }
      }
    }
    const result = new Uint8Array(height * layer);
    for (let y = 0; y < height; y++) {
      for (let z = 0; z < sizeZ; z++) {
        for (let x = 0; x < sizeX; x++) result[x + z * sizeX + y * layer] = levels[wide(x, y, z)];
      }
    }
    return result;
  }
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
