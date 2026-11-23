// Generator version 2 (Phase 7 part A): the terrain shapes and tree levels of the world options.
import {
  CHUNK_SIZE,
  CHUNK_VOLUME,
  CLAY_DEPTH,
  CLAY_MIN_WATER_DEPTH,
  ROCK_HEIGHT,
  ROCK_HEIGHT_SHIFT,
  ROCK_SLOPE,
  SEA_LEVEL,
  WORLD_HEIGHT,
} from '../../game/config';
import { smoothstep } from '../../util/math';
import { createNoise2D, fbm2D, type Noise2D } from '../../util/noise';
import { deriveSeed, hash2Float } from '../../util/rng';
import { Block } from '../blocks';
import { chunkKey } from '../chunk';
import { CLAY_COLUMN, markClayColumns, placeOres } from './ores';
import {
  BEACH_ABOVE,
  BEACH_BELOW,
  CONTINENT_SCALE,
  DETAIL_SCALE,
  DIRT_DEPTH,
  MAX_SURFACE,
  MIN_SURFACE,
  ROCK_JITTER,
  ROCK_SCALE,
  SALT_ROCK,
} from './terrainRules';
import { TREE_CANOPY_RADIUS, hasLeaf, isTreeOrigin, trunkHeight } from './trees';
import type { TerrainShape, WorldOptions } from './worldOptions';

/**
 * The height curve of a shape: `base = SEA_LEVEL + 3 + c · slope` (slope `landSlope`
 * above c = 0, version 1's 26 below it, so the basins and the water stay as they are),
 * `amplitude = ampBase + ampHill · smoothstep(ampFrom, ampTo, c)`.
 */
export interface ShapeCurve {
  landSlope: number;
  ampBase: number;
  ampHill: number;
  ampFrom: number;
  ampTo: number;
}

/** Slope of the base curve below c = 0, as in version 1. Never change it (water share). */
const WATER_SLOPE = 26;

export const SHAPE_CURVES: Record<TerrainShape, ShapeCurve> = {
  // Version 1's curve exactly: `hilly` gives version 1's heights for every column.
  hilly: { landSlope: 26, ampBase: 5, ampHill: 40, ampFrom: 0.05, ampTo: 0.75 },
  balanced: { landSlope: 20, ampBase: 3, ampHill: 28, ampFrom: 0.3, ampTo: 0.9 },
  flat: { landSlope: 10, ampBase: 2, ampHill: 4, ampFrom: 0.3, ampTo: 1 },
};

const LAYER = CHUNK_SIZE * CHUNK_SIZE;
/** Heights of a chunk's columns plus a rim of one column, for the slope rule. */
const GRID = CHUNK_SIZE + 2;
const HEIGHT_CACHE_CHUNKS = 512;
const ROCK_COLUMN = 3;

/** Terrain of one seed and one set of world options. Holds no world state. */
export class TerrainV2 {
  readonly seed: number;
  readonly options: WorldOptions;
  /** The spawn search looks for wood near the start point (any level but `none`). */
  readonly wantsWood: boolean;
  private readonly curve: ShapeCurve;
  private readonly continent: Noise2D;
  private readonly detail: Noise2D;
  private readonly rock: Noise2D;
  // Scratch buffers of `generateChunk`, reused between calls.
  private readonly heights = new Uint8Array(GRID * GRID);
  /** Per column: `ROCK_COLUMN`, 1 where clay is possible, `CLAY_COLUMN` or 0. */
  private readonly flags = new Uint8Array(LAYER);
  /** Column heights of recently generated chunks. A cache only: it never changes results. */
  private readonly heightCache = new Map<string, Uint8Array>();

  constructor(seed: number, options: WorldOptions) {
    this.seed = seed >>> 0;
    this.options = { terrain: options.terrain, trees: options.trees };
    this.wantsWood = options.trees !== 'none';
    this.curve = SHAPE_CURVES[options.terrain];
    // The same noise tables as version 1, so `hilly` has version 1's heights.
    this.continent = createNoise2D(deriveSeed(this.seed, 1));
    this.detail = createNoise2D(deriveSeed(this.seed, 2));
    this.rock = createNoise2D(deriveSeed(this.seed, 3));
  }

  /** Y of the topmost ground block (not counting water or trees) in column (x, z). */
  heightAt(x: number, z: number): number {
    const c = fbm2D(this.continent, x * CONTINENT_SCALE, z * CONTINENT_SCALE, 3);
    const d = fbm2D(this.detail, x * DETAIL_SCALE, z * DETAIL_SCALE, 5);
    const curve = this.curve;
    const base = SEA_LEVEL + 3 + c * (c > 0 ? curve.landSlope : WATER_SLOPE);
    const amplitude = curve.ampBase + curve.ampHill * smoothstep(curve.ampFrom, curve.ampTo, c);
    const hills = amplitude * (d * 0.6 + Math.abs(d) * 0.4);
    const h = Math.round(base + hills);
    return h < MIN_SURFACE ? MIN_SURFACE : h > MAX_SURFACE ? MAX_SURFACE : h;
  }

  isUnderWater(x: number, z: number): boolean {
    return this.heightAt(x, z) < SEA_LEVEL;
  }

  /** Trunk height of the tree rooted in column (x, z), or 0 if there is none. */
  treeAt(x: number, z: number): number {
    if (!this.isOrigin(x, z)) return 0;
    if (!this.isGrass(x, z)) return 0;
    return trunkHeight(this.seed, x, z);
  }

  /** True if the top block of the column is grass. */
  isGrass(x: number, z: number): boolean {
    return this.cachedHeightAt(x, z) > SEA_LEVEL + BEACH_ABOVE && !this.isRock(x, z);
  }

  /** Whether column (x, z) wants a tree, by hashes only (the terrain is checked apart). */
  private isOrigin(x: number, z: number): boolean {
    if (this.options.trees === 'none') return false;
    return isTreeOrigin(this.seed, x, z);
  }

  private aboveRockLine(h: number, x: number, z: number): boolean {
    const reach = ROCK_HEIGHT_SHIFT + ROCK_JITTER;
    if (h < ROCK_HEIGHT - reach) return false;
    if (h >= ROCK_HEIGHT + reach) return true;
    const shift = this.rock(x * ROCK_SCALE, z * ROCK_SCALE) * ROCK_HEIGHT_SHIFT;
    const jitter = (hash2Float(this.seed ^ SALT_ROCK, x, z) * 2 - 1) * ROCK_JITTER;
    return h >= ROCK_HEIGHT + shift + jitter;
  }

  /** True if the land column has a bare stone surface (version 1's rule). */
  isRock(x: number, z: number): boolean {
    const h = this.cachedHeightAt(x, z);
    if (h < SEA_LEVEL) return false;
    if (this.aboveRockLine(h, x, z)) return true;
    return (
      Math.abs(h - this.cachedHeightAt(x + 1, z)) >= ROCK_SLOPE ||
      Math.abs(h - this.cachedHeightAt(x - 1, z)) >= ROCK_SLOPE ||
      Math.abs(h - this.cachedHeightAt(x, z + 1)) >= ROCK_SLOPE ||
      Math.abs(h - this.cachedHeightAt(x, z - 1)) >= ROCK_SLOPE
    );
  }

  private heightsOf(cx: number, cz: number): Uint8Array {
    const cache = this.heightCache;
    const key = chunkKey(cx, cz);
    let heights = cache.get(key);
    if (!heights) {
      if (cache.size >= HEIGHT_CACHE_CHUNKS) {
        for (const oldest of cache.keys()) {
          cache.delete(oldest);
          break;
        }
      }
      heights = new Uint8Array(LAYER);
      cache.set(key, heights);
    }
    return heights;
  }

  private cachedHeightAt(x: number, z: number): number {
    const cx = Math.floor(x / CHUNK_SIZE);
    const cz = Math.floor(z / CHUNK_SIZE);
    const heights = this.heightsOf(cx, cz);
    const i = x - cx * CHUNK_SIZE + (z - cz * CHUNK_SIZE) * CHUNK_SIZE;
    let h = heights[i];
    if (h === 0) heights[i] = h = this.heightAt(x, z);
    return h;
  }

  /** Fills `heights` with the chunk's columns and its rim; returns the highest column. */
  private fillHeights(cx: number, cz: number): number {
    const heights = this.heights;
    const x0 = cx * CHUNK_SIZE;
    const z0 = cz * CHUNK_SIZE;
    const own = this.heightsOf(cx, cz);
    let max = 0;
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const i = lx + lz * CHUNK_SIZE;
        let h = own[i];
        if (h === 0) own[i] = h = this.heightAt(x0 + lx, z0 + lz);
        heights[lx + 1 + (lz + 1) * GRID] = h;
        if (h > max) max = h;
      }
    }
    const west = this.heightsOf(cx - 1, cz);
    const east = this.heightsOf(cx + 1, cz);
    const north = this.heightsOf(cx, cz - 1);
    const south = this.heightsOf(cx, cz + 1);
    const last = CHUNK_SIZE - 1;
    for (let i = 0; i < CHUNK_SIZE; i++) {
      let h = west[last + i * CHUNK_SIZE];
      if (h === 0) west[last + i * CHUNK_SIZE] = h = this.heightAt(x0 - 1, z0 + i);
      heights[(i + 1) * GRID] = h;
      h = east[i * CHUNK_SIZE];
      if (h === 0) east[i * CHUNK_SIZE] = h = this.heightAt(x0 + CHUNK_SIZE, z0 + i);
      heights[GRID - 1 + (i + 1) * GRID] = h;
      h = north[i + last * CHUNK_SIZE];
      if (h === 0) north[i + last * CHUNK_SIZE] = h = this.heightAt(x0 + i, z0 - 1);
      heights[i + 1] = h;
      h = south[i];
      if (h === 0) south[i] = h = this.heightAt(x0 + i, z0 + CHUNK_SIZE);
      heights[i + 1 + (GRID - 1) * GRID] = h;
    }
    return max;
  }

  generateChunk(cx: number, cz: number): Uint8Array {
    const blocks = new Uint8Array(CHUNK_VOLUME);
    const x0 = cx * CHUNK_SIZE;
    const z0 = cz * CHUNK_SIZE;
    const heights = this.heights;
    const maxHeight = this.fillHeights(cx, cz);

    const flags = this.flags;
    let deepWater = false;
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const g = lx + 1 + (lz + 1) * GRID;
        const h = heights[g];
        const column = lx + lz * CHUNK_SIZE;
        const rock =
          h >= SEA_LEVEL &&
          (this.aboveRockLine(h, x0 + lx, z0 + lz) ||
            Math.abs(h - heights[g + 1]) >= ROCK_SLOPE ||
            Math.abs(h - heights[g - 1]) >= ROCK_SLOPE ||
            Math.abs(h - heights[g + GRID]) >= ROCK_SLOPE ||
            Math.abs(h - heights[g - GRID]) >= ROCK_SLOPE);
        blocks[column] = Block.BEDROCK;
        if (rock) {
          flags[column] = ROCK_COLUMN;
          for (let y = 1; y <= h; y++) blocks[column + y * LAYER] = Block.STONE;
          continue;
        }
        const deep = SEA_LEVEL - h >= CLAY_MIN_WATER_DEPTH;
        flags[column] = deep ? 1 : 0;
        if (deep) deepWater = true;
        const beach = h >= SEA_LEVEL - BEACH_BELOW && h <= SEA_LEVEL + BEACH_ABOVE;
        const soil = beach ? Block.SAND : Block.DIRT;
        const top = beach ? Block.SAND : h < SEA_LEVEL ? Block.DIRT : Block.GRASS;
        const stoneTop = h - DIRT_DEPTH - 1;
        for (let y = 1; y <= stoneTop; y++) blocks[column + y * LAYER] = Block.STONE;
        for (let y = Math.max(1, stoneTop + 1); y < h; y++) blocks[column + y * LAYER] = soil;
        blocks[column + h * LAYER] = top;
        for (let y = h + 1; y <= SEA_LEVEL; y++) blocks[column + y * LAYER] = Block.WATER;
      }
    }

    if (deepWater) {
      markClayColumns(this.seed, x0, z0, flags);
      for (let column = 0; column < LAYER; column++) {
        if (flags[column] !== CLAY_COLUMN) continue;
        const h = heights[(column % CHUNK_SIZE) + 1 + (Math.floor(column / CHUNK_SIZE) + 1) * GRID];
        for (let y = h; y > h - CLAY_DEPTH; y--) blocks[column + y * LAYER] = Block.CLAY;
      }
    }
    placeOres(this.seed, blocks, x0, z0, maxHeight);
    if (this.options.trees !== 'none') this.placeTrees(blocks, x0, z0);
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
        if (!this.isOrigin(ox, oz)) continue;
        const inside = ox >= x0 && ox < x0 + CHUNK_SIZE && oz >= z0 && oz < z0 + CHUNK_SIZE;
        const ground = inside
          ? this.heights[ox - x0 + 1 + (oz - z0 + 1) * GRID]
          : this.cachedHeightAt(ox, oz);
        if (ground <= SEA_LEVEL + BEACH_ABOVE) continue;
        const rock = inside
          ? this.flags[ox - x0 + (oz - z0) * CHUNK_SIZE] === ROCK_COLUMN
          : this.isRock(ox, oz);
        if (rock) continue;
        const topLog = ground + trunkHeight(this.seed, ox, oz);

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
        if (inside) {
          const lx = ox - x0;
          const lz = oz - z0;
          for (let y = ground + 1; y <= topLog && y < WORLD_HEIGHT; y++) {
            blocks[lx + lz * CHUNK_SIZE + y * LAYER] = Block.LOG;
          }
        }
      }
    }
  }
}
