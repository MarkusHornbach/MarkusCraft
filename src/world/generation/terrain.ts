// Terrain generation: a pure function from (seed, chunk coordinates) to block data.
import {
  CHUNK_SIZE,
  CHUNK_VOLUME,
  CLAY_DEPTH,
  CLAY_MIN_WATER_DEPTH,
  GENERATOR_VERSION,
  ROCK_HEIGHT,
  ROCK_HEIGHT_SHIFT,
  ROCK_SLOPE,
  SEA_LEVEL,
  WORLD_HEIGHT,
} from '../../game/config';
import { smoothstep } from '../../util/math';
import { createNoise2D, fbm2D, type Noise2D } from '../../util/noise';
import { deriveSeed, fnv1a, hash2Float } from '../../util/rng';
import { Block } from '../blocks';
import { chunkKey } from '../chunk';
import { CLAY_COLUMN, markClayColumns, placeOres } from './ores';
import { TREE_CANOPY_RADIUS, hasLeaf, isTreeOrigin, trunkHeight as treeTrunkHeight } from './trees';

/** Columns whose surface is this close to sea level are sand (beaches, shallow beds). */
export const BEACH_ABOVE = 2;
export const BEACH_BELOW = 3;
export const DIRT_DEPTH = 3;
export const MIN_SURFACE = 22;
export const MAX_SURFACE = 106;

const CONTINENT_SCALE = 1 / 360;
const DETAIL_SCALE = 1 / 110;
const ROCK_SCALE = 1 / 64;
/** Per-column jitter of the rock line, so grass and rock do not meet along a contour. */
const ROCK_JITTER = 1;
const SALT_ROCK = 0x70c4;
const LAYER = CHUNK_SIZE * CHUNK_SIZE;
/** Heights of a chunk's columns plus a rim of one column, for the slope rule. */
const GRID = CHUNK_SIZE + 2;
const HEIGHT_CACHE_CHUNKS = 512;
const ROCK_COLUMN = 3;

/**
 * Parts of generator version 1 that can be left out. Only tests and dev tools do that:
 * without all three the result is the Phase 1 terrain, the baseline for measurements.
 */
export interface TerrainFeatures {
  rock: boolean;
  ores: boolean;
  clay: boolean;
}
export const ALL_FEATURES: TerrainFeatures = { rock: true, ores: true, clay: true };
export const NO_FEATURES: TerrainFeatures = { rock: false, ores: false, clay: false };

/** Terrain for one world seed. Holds only seed-derived noise tables, no world state. */
export class Terrain {
  readonly seed: number;
  private readonly continent: Noise2D;
  private readonly detail: Noise2D;
  private readonly rock: Noise2D;
  // Scratch buffers of `generateChunk`, reused between calls.
  private readonly heights = new Uint8Array(GRID * GRID);
  /** Per column: `ROCK_COLUMN`, 1 where clay is possible, `CLAY_COLUMN` or 0. */
  private readonly flags = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE);
  /** Column heights of recently generated chunks. A cache only: it never changes results. */
  private readonly heightCache = new Map<string, Uint8Array>();

  constructor(seed: number) {
    this.seed = seed >>> 0;
    this.continent = createNoise2D(deriveSeed(this.seed, 1));
    this.detail = createNoise2D(deriveSeed(this.seed, 2));
    this.rock = createNoise2D(deriveSeed(this.seed, 3));
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
    // Trees need grass: above the beach band and not on bare rock.
    if (this.heightAt(x, z) <= SEA_LEVEL + BEACH_ABOVE) return 0;
    if (this.isRock(x, z)) return 0;
    return treeTrunkHeight(this.seed, x, z);
  }

  /** True if the top block of the column is grass. */
  isGrass(x: number, z: number): boolean {
    return this.heightAt(x, z) > SEA_LEVEL + BEACH_ABOVE && !this.isRock(x, z);
  }

  /**
   * Whether land of height `h` in column (x, z) lies above the rock line: high ground is
   * bare stone. The line wanders by a low-frequency noise and a little per column.
   */
  private aboveRockLine(h: number, x: number, z: number): boolean {
    const reach = ROCK_HEIGHT_SHIFT + ROCK_JITTER;
    // Decided without the noise for most columns.
    if (h < ROCK_HEIGHT - reach) return false;
    if (h >= ROCK_HEIGHT + reach) return true;
    const shift = this.rock(x * ROCK_SCALE, z * ROCK_SCALE) * ROCK_HEIGHT_SHIFT;
    const jitter = (hash2Float(this.seed ^ SALT_ROCK, x, z) * 2 - 1) * ROCK_JITTER;
    return h >= ROCK_HEIGHT + shift + jitter;
  }

  /**
   * True if the land column has a bare stone surface: high ground, or a step of
   * `ROCK_SLOPE` or more to one of its four neighbours. Columns under water are never rock.
   */
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

  /** Cached column heights of a chunk; 0 marks a column that was not computed yet. */
  private heightsOf(cx: number, cz: number): Uint8Array {
    const cache = this.heightCache;
    const key = chunkKey(cx, cz);
    let heights = cache.get(key);
    if (!heights) {
      // Drop the oldest entry when full.
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

  /** `heightAt` through the cache: neighbouring chunks ask for the same columns again. */
  private cachedHeightAt(x: number, z: number): number {
    const cx = Math.floor(x / CHUNK_SIZE);
    const cz = Math.floor(z / CHUNK_SIZE);
    const heights = this.heightsOf(cx, cz);
    const i = x - cx * CHUNK_SIZE + (z - cz * CHUNK_SIZE) * CHUNK_SIZE;
    let h = heights[i];
    if (h === 0) heights[i] = h = this.heightAt(x, z);
    return h;
  }

  /**
   * Fills `heights` with the ground heights of the chunk and, for the slope rule, of the
   * columns around it (the four corners of the rim are never read). Returns the highest
   * column of the chunk.
   */
  private fillHeights(cx: number, cz: number, withRim: boolean): number {
    const heights = this.heights;
    const x0 = cx * CHUNK_SIZE;
    const z0 = cz * CHUNK_SIZE;
    const own = withRim ? this.heightsOf(cx, cz) : null;
    let max = 0;
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const i = lx + lz * CHUNK_SIZE;
        let h = own ? own[i] : 0;
        if (h === 0) {
          h = this.heightAt(x0 + lx, z0 + lz);
          if (own) own[i] = h;
        }
        heights[lx + 1 + (lz + 1) * GRID] = h;
        if (h > max) max = h;
      }
    }
    if (!withRim) return max;

    // The rim columns belong to the four neighbours. What is computed here is kept in
    // the cache, so the neighbour does not compute it again when it is generated.
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

  generateChunk(cx: number, cz: number, features: TerrainFeatures = ALL_FEATURES): Uint8Array {
    const blocks = new Uint8Array(CHUNK_VOLUME);
    const x0 = cx * CHUNK_SIZE;
    const z0 = cz * CHUNK_SIZE;

    const heights = this.heights;
    const maxHeight = this.fillHeights(cx, cz, features.rock);

    const flags = this.flags;
    let deepWater = false;
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const g = lx + 1 + (lz + 1) * GRID;
        const h = heights[g];
        const column = lx + lz * CHUNK_SIZE;
        const rock =
          features.rock &&
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
        // Clay is possible where the water above the bed is deep enough.
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

    if (features.clay && deepWater) {
      markClayColumns(this.seed, x0, z0, flags);
      for (let column = 0; column < LAYER; column++) {
        if (flags[column] !== CLAY_COLUMN) continue;
        const h = heights[(column % CHUNK_SIZE) + 1 + (Math.floor(column / CHUNK_SIZE) + 1) * GRID];
        for (let y = h; y > h - CLAY_DEPTH; y--) blocks[column + y * LAYER] = Block.CLAY;
      }
    }
    if (features.ores) placeOres(this.seed, blocks, x0, z0, maxHeight);
    this.placeTrees(blocks, x0, z0, features.rock);
    return blocks;
  }

  /**
   * Adds every tree whose trunk or canopy touches this chunk. Origins up to the canopy
   * radius outside the border are evaluated, so both sides of a border agree.
   */
  private placeTrees(blocks: Uint8Array, x0: number, z0: number, rockRule: boolean): void {
    const r = TREE_CANOPY_RADIUS;
    for (let oz = z0 - r; oz < z0 + CHUNK_SIZE + r; oz++) {
      for (let ox = x0 - r; ox < x0 + CHUNK_SIZE + r; ox++) {
        if (!isTreeOrigin(this.seed, ox, oz)) continue;
        const inside = ox >= x0 && ox < x0 + CHUNK_SIZE && oz >= z0 && oz < z0 + CHUNK_SIZE;
        // Inside the chunk the height and the rock flag are already known.
        const ground = inside
          ? this.heights[ox - x0 + 1 + (oz - z0 + 1) * GRID]
          : rockRule
            ? this.cachedHeightAt(ox, oz)
            : this.heightAt(ox, oz);
        if (ground <= SEA_LEVEL + BEACH_ABOVE) continue;
        if (rockRule) {
          const rock = inside
            ? this.flags[ox - x0 + (oz - z0) * CHUNK_SIZE] === ROCK_COLUMN
            : this.isRock(ox, oz);
          if (rock) continue;
        }
        const trunk = treeTrunkHeight(this.seed, ox, oz);
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

const terrains = new Map<number, Terrain>();
const TERRAIN_CACHE_SIZE = 4;

/** Returns the (cached) terrain of a seed; the noise tables are built once per seed. */
export function getTerrain(seed: number): Terrain {
  const key = seed >>> 0;
  let terrain = terrains.get(key);
  if (!terrain) {
    // A few seeds stay cached (switching between worlds); the oldest one is dropped.
    if (terrains.size >= TERRAIN_CACHE_SIZE) {
      for (const oldest of terrains.keys()) {
        terrains.delete(oldest);
        break;
      }
    }
    terrain = new Terrain(key);
    terrains.set(key, terrain);
  }
  return terrain;
}

export function isKnownGeneratorVersion(version: number): boolean {
  return version === GENERATOR_VERSION;
}

/**
 * Pure chunk generator: depends only on its arguments. `version` is the generator version
 * stored in the world; a later version that changes the terrain must keep this one working.
 */
export function generateChunk(seed: number, cx: number, cz: number, version: number): Uint8Array {
  if (!isKnownGeneratorVersion(version)) throw new Error(`Unknown generator version ${version}`);
  return getTerrain(seed).generateChunk(cx, cz);
}

/**
 * 32-bit FNV-1a checksum over the block data of the 3 × 3 chunks around the origin. Two
 * devices that compute the same value generate the same terrain for the seed.
 */
export function terrainChecksum(seed: number, version: number): number {
  let hash: number | undefined;
  for (let cz = -1; cz <= 1; cz++) {
    for (let cx = -1; cx <= 1; cx++) hash = fnv1a(generateChunk(seed, cx, cz, version), hash);
  }
  return hash ?? 0;
}
