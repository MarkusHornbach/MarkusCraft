// Terrain generation: a pure function from (seed, chunk coordinates) to block data.
import { CHUNK_SIZE, CHUNK_VOLUME, SEA_LEVEL, WORLD_HEIGHT } from '../../game/config';
import { smoothstep } from '../../util/math';
import { createNoise2D, fbm2D, type Noise2D } from '../../util/noise';
import { deriveSeed } from '../../util/rng';
import { Block } from '../blocks';
import { TREE_CANOPY_RADIUS, hasLeaf, isTreeOrigin, trunkHeight as treeTrunkHeight } from './trees';

/** Columns whose surface is this close to sea level are sand (beaches, shallow beds). */
export const BEACH_ABOVE = 2;
export const BEACH_BELOW = 3;
export const DIRT_DEPTH = 3;
export const MIN_SURFACE = 22;
export const MAX_SURFACE = 106;

const CONTINENT_SCALE = 1 / 360;
const DETAIL_SCALE = 1 / 110;
const LAYER = CHUNK_SIZE * CHUNK_SIZE;

/** Terrain for one world seed. Holds only seed-derived noise tables, no world state. */
export class Terrain {
  readonly seed: number;
  private readonly continent: Noise2D;
  private readonly detail: Noise2D;

  constructor(seed: number) {
    this.seed = seed >>> 0;
    this.continent = createNoise2D(deriveSeed(this.seed, 1));
    this.detail = createNoise2D(deriveSeed(this.seed, 2));
  }

  /** Y of the topmost ground block (not counting water or trees) in column (x, z). */
  heightAt(x: number, z: number): number {
    // Low-frequency "continent" value decides between basins, plains and hill country.
    const c = fbm2D(this.continent, x * CONTINENT_SCALE, z * CONTINENT_SCALE, 3);
    const d = fbm2D(this.detail, x * DETAIL_SCALE, z * DETAIL_SCALE, 5);
    const base = SEA_LEVEL + 3 + c * 26;
    // Plains stay gentle; the amplitude grows where the continent value is high.
    const amplitude = 5 + 40 * smoothstep(0.05, 0.75, c);
    // Hills only rise (ridged upward), so plains do not get pits of the same depth.
    const hills = amplitude * (d * 0.6 + Math.abs(d) * 0.4);
    const h = Math.round(base + hills);
    return h < MIN_SURFACE ? MIN_SURFACE : h > MAX_SURFACE ? MAX_SURFACE : h;
  }

  /** True if the ground surface of the column is below the water surface. */
  isUnderWater(x: number, z: number): boolean {
    return this.heightAt(x, z) < SEA_LEVEL;
  }

  /** Trunk height of the tree rooted in column (x, z), or 0 if there is none. */
  treeAt(x: number, z: number): number {
    if (!isTreeOrigin(this.seed, x, z)) return 0;
    // Trees need grass: above the beach band.
    if (this.heightAt(x, z) <= SEA_LEVEL + BEACH_ABOVE) return 0;
    return treeTrunkHeight(this.seed, x, z);
  }

  generateChunk(cx: number, cz: number): Uint8Array {
    const blocks = new Uint8Array(CHUNK_VOLUME);
    const x0 = cx * CHUNK_SIZE;
    const z0 = cz * CHUNK_SIZE;

    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const h = this.heightAt(x0 + lx, z0 + lz);
        const column = lx + lz * CHUNK_SIZE;
        const beach = h >= SEA_LEVEL - BEACH_BELOW && h <= SEA_LEVEL + BEACH_ABOVE;
        const soil = beach ? Block.SAND : Block.DIRT;
        const top = beach ? Block.SAND : h < SEA_LEVEL ? Block.DIRT : Block.GRASS;
        blocks[column] = Block.BEDROCK;
        const stoneTop = h - DIRT_DEPTH - 1;
        for (let y = 1; y <= stoneTop; y++) blocks[column + y * LAYER] = Block.STONE;
        for (let y = Math.max(1, stoneTop + 1); y < h; y++) blocks[column + y * LAYER] = soil;
        blocks[column + h * LAYER] = top;
        for (let y = h + 1; y <= SEA_LEVEL; y++) blocks[column + y * LAYER] = Block.WATER;
      }
    }

    this.placeTrees(blocks, x0, z0);
    return blocks;
  }

  /**
   * Adds every tree whose trunk or canopy touches this chunk. Origins up to the canopy
   * radius outside the border are evaluated, so both sides of a border agree.
   */
  private placeTrees(blocks: Uint8Array, x0: number, z0: number): void {
    const r = TREE_CANOPY_RADIUS;
    for (let oz = z0 - r; oz < z0 + CHUNK_SIZE + r; oz++) {
      for (let ox = x0 - r; ox < x0 + CHUNK_SIZE + r; ox++) {
        if (!isTreeOrigin(this.seed, ox, oz)) continue;
        const trunk = this.treeAt(ox, oz);
        if (trunk === 0) continue;
        const ground = this.heightAt(ox, oz);
        const topLog = ground + trunk;

        // Leaves first; they only fill air, so terrain and other trunks stay intact.
        for (let dy = -2; dy <= 1; dy++) {
          const y = topLog + dy;
          if (y >= WORLD_HEIGHT) continue;
          for (let dz = -r; dz <= r; dz++) {
            const lz = oz + dz - z0;
            if (lz < 0 || lz >= CHUNK_SIZE) continue;
            for (let dx = -r; dx <= r; dx++) {
              const lx = ox + dx - x0;
              if (lx < 0 || lx >= CHUNK_SIZE) continue;
              if (!hasLeaf(this.seed, ox, oz, dx, dy, dz)) continue;
              const i = lx + lz * CHUNK_SIZE + y * LAYER;
              if (blocks[i] === Block.AIR) blocks[i] = Block.LEAVES;
            }
          }
        }

        // Logs win over leaves, which makes the result independent of tree order.
        const lx = ox - x0;
        const lz = oz - z0;
        if (lx >= 0 && lx < CHUNK_SIZE && lz >= 0 && lz < CHUNK_SIZE) {
          for (let y = ground + 1; y <= topLog && y < WORLD_HEIGHT; y++) {
            blocks[lx + lz * CHUNK_SIZE + y * LAYER] = Block.LOG;
          }
        }
      }
    }
  }
}

let cached: Terrain | null = null;

/** Returns the (cached) terrain of a seed; building the noise tables once per seed. */
export function getTerrain(seed: number): Terrain {
  if (!cached || cached.seed !== seed >>> 0) cached = new Terrain(seed);
  return cached;
}

/** Pure chunk generator: depends only on its arguments. */
export function generateChunk(seed: number, cx: number, cz: number): Uint8Array {
  return getTerrain(seed).generateChunk(cx, cz);
}
