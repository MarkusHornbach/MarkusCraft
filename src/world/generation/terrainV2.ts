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
import { deriveSeed, hash2, hash2Float } from '../../util/rng';
import { Block } from '../blocks';
import { chunkKey } from '../chunk';
import { ColumnCache } from './columnCache';
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
import { TREE_CANOPY_RADIUS, TREE_MIN_SPACING, hasLeaf, trunkHeight } from './trees';
import type { TerrainShape, TreeDensity, WorldOptions } from './worldOptions';

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

/**
 * A tree level: the candidate chance of a column is `meadow + (forest - meadow) · w`, with
 * the forest weight `w = smoothstep(lo, hi, f)` of the low-frequency forest noise `f`. The
 * spacing rule of version 1 then thins the candidates out.
 */
export interface TreeLevel {
  meadow: number;
  forest: number;
  lo: number;
  hi: number;
}

export const TREE_LEVELS: Record<Exclude<TreeDensity, 'none'>, TreeLevel> = {
  few: { meadow: 0.0006, forest: 0.08, lo: 0.24, hi: 0.44 },
  normal: { meadow: 0.002, forest: 0.1, lo: 0, hi: 0.22 },
  many: { meadow: 0.06, forest: 0.14, lo: -0.4, hi: -0.1 },
};

/** The forest noise: about 1/160, two octaves (forests and meadows, not single trees). */
const FOREST_SCALE = 1 / 160;
const FOREST_OCTAVES = 2;
/** `deriveSeed` index of the forest noise; 1 to 3 are version 1's tables. */
const FOREST_NOISE = 4;
const SALT_PLACE = 0x2b7d;
/** Origins that can matter to a chunk: its canopy reach plus the spacing rule's reach. */
const TREE_REACH = TREE_CANOPY_RADIUS + TREE_MIN_SPACING - 1;
const CHANCE_SIDE = CHUNK_SIZE + 2 * TREE_REACH;

const LAYER = CHUNK_SIZE * CHUNK_SIZE;
/** Heights of a chunk's columns plus a rim of one column, for the slope rule. */
const GRID = CHUNK_SIZE + 2;
const HEIGHT_CACHE_CHUNKS = 512;
const ROCK_COLUMN = 3;
const STONE_TOP_CACHE = 4096;

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
  private readonly forestNoise: Noise2D;
  private readonly level: TreeLevel | null;
  /** The level's highest chance: a column whose hash is above it is never a candidate. */
  private readonly maxChance: number;
  /** Whether the tree hooks of a later version are asked (false: version 2's fast path). */
  protected hooks = false;
  /**
   * Candidate chance per column of the chunk being generated and its rim (-1: not computed
   * yet), so the forest noise is evaluated once per column and never per neighbour check.
   */
  private readonly chances = new Float32Array(CHANCE_SIDE * CHANCE_SIDE);
  private chanceX0 = 0;
  private chanceZ0 = 0;
  private chancesActive = false;
  // Scratch buffers of `generateChunk`, reused between calls.
  private readonly heights = new Uint8Array(GRID * GRID);
  /** Per column: `ROCK_COLUMN`, 1 where clay is possible, `CLAY_COLUMN` or 0. */
  private readonly flags = new Uint8Array(LAYER);
  /** Column heights of recently generated chunks. A cache only: it never changes results. */
  private readonly heightCache = new Map<string, Uint8Array>();
  /** `stoneTop` of recently asked columns (the radar asks the same ones again). */
  private readonly stoneTops = new ColumnCache(STONE_TOP_CACHE);

  constructor(seed: number, options: WorldOptions) {
    this.seed = seed >>> 0;
    this.options = { terrain: options.terrain, trees: options.trees };
    this.wantsWood = options.trees !== 'none';
    this.curve = SHAPE_CURVES[options.terrain];
    // The same noise tables as version 1, so `hilly` has version 1's heights.
    this.continent = createNoise2D(deriveSeed(this.seed, 1));
    this.detail = createNoise2D(deriveSeed(this.seed, 2));
    this.rock = createNoise2D(deriveSeed(this.seed, 3));
    this.forestNoise = createNoise2D(deriveSeed(this.seed, FOREST_NOISE));
    this.level = options.trees === 'none' ? null : TREE_LEVELS[options.trees];
    this.maxChance = this.level ? Math.max(this.level.meadow, this.level.forest) : 0;
  }

  /** Forest weight of a column, 0 (meadow) to 1 (forest); 0 without trees. */
  forestWeight(x: number, z: number): number {
    const level = this.level;
    if (!level) return 0;
    const f = fbm2D(this.forestNoise, x * FOREST_SCALE, z * FOREST_SCALE, FOREST_OCTAVES);
    return smoothstep(level.lo, level.hi, f);
  }

  private chanceAt(x: number, z: number): number {
    const level = this.level;
    if (!level) return 0;
    if (this.chancesActive) {
      const lx = x - this.chanceX0;
      const lz = z - this.chanceZ0;
      if (lx >= 0 && lx < CHANCE_SIDE && lz >= 0 && lz < CHANCE_SIDE) {
        const i = lx + lz * CHANCE_SIDE;
        let chance = this.chances[i];
        if (chance < 0) {
          chance = level.meadow + (level.forest - level.meadow) * this.forestWeight(x, z);
          this.chances[i] = chance;
        }
        return chance;
      }
    }
    return level.meadow + (level.forest - level.meadow) * this.forestWeight(x, z);
  }

  private isCandidate(x: number, z: number): boolean {
    const h = hash2Float(this.seed ^ SALT_PLACE, x, z);
    // Most columns are decided without the noise.
    return h < this.maxChance && h < this.chanceAt(x, z);
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
  protected isOrigin(x: number, z: number): boolean {
    if (!this.level) return false;
    if (!this.isCandidate(x, z)) return false;
    // Version 1's spacing rule: among candidates closer than the minimum spacing the one
    // with the highest hash wins, so the rule does not depend on generation order.
    const own = hash2(this.seed ^ SALT_PLACE, x, z);
    const reach = TREE_MIN_SPACING - 1;
    for (let dz = -reach; dz <= reach; dz++) {
      for (let dx = -reach; dx <= reach; dx++) {
        if (dx === 0 && dz === 0) continue;
        if (!this.isCandidate(x + dx, z + dz)) continue;
        const other = hash2(this.seed ^ SALT_PLACE, x + dx, z + dz);
        if (other > own || (other === own && (dx > 0 || (dx === 0 && dz > 0)))) return false;
      }
    }
    return true;
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
    return this.rockOf(
      h,
      x,
      z,
      this.cachedHeightAt(x + 1, z),
      this.cachedHeightAt(x - 1, z),
      this.cachedHeightAt(x, z + 1),
      this.cachedHeightAt(x, z - 1),
    );
  }

  /**
   * The rock rule of a land column of height `h` with its four neighbours' heights: the
   * one decision of `generateChunk` and `isRock`.
   */
  protected rockOf(
    h: number,
    x: number,
    z: number,
    e: number,
    w: number,
    s: number,
    n: number,
  ): boolean {
    return (
      h >= SEA_LEVEL &&
      (this.aboveRockLine(h, x, z) ||
        Math.abs(h - e) >= ROCK_SLOPE ||
        Math.abs(h - w) >= ROCK_SLOPE ||
        Math.abs(h - s) >= ROCK_SLOPE ||
        Math.abs(h - n) >= ROCK_SLOPE)
    );
  }

  /** Highest stone cell of the column before the ores (rock: its height; else below the soil). */
  stoneTop(x: number, z: number): number {
    return this.stoneTops.get(x, z, this.computeStoneTop);
  }

  protected readonly computeStoneTop = (x: number, z: number): number => {
    const h = this.cachedHeightAt(x, z);
    return this.isRock(x, z) ? h : h - DIRT_DEPTH - 1;
  };

  /** True if generation leaves stone in the cell before the ores are placed. */
  oreHost(x: number, y: number, z: number): boolean {
    return y >= 1 && y <= this.stoneTop(x, z);
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

  protected cachedHeightAt(x: number, z: number): number {
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
    const maxHeight = this.fillBase(blocks, cx, cz);
    placeOres(this.seed, blocks, x0, z0, maxHeight);
    this.placeTreesPhase(blocks, x0, z0);
    return blocks;
  }

  /**
   * First phase of a chunk: bedrock, stone, soil, water and clay. Leaves the chunk's column
   * heights (with the rim) in `heights` and the column flags in `flags` for the later
   * phases; returns the highest column. Version 3 builds on the same phases.
   */
  protected fillBase(blocks: Uint8Array, cx: number, cz: number): number {
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
        const rock = this.rockOf(
          h,
          x0 + lx,
          z0 + lz,
          heights[g + 1],
          heights[g - 1],
          heights[g + GRID],
          heights[g - GRID],
        );
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
    return maxHeight;
  }

  /** Height of a column of the chunk last passed to `fillBase` (local coordinates). */
  protected baseHeight(lx: number, lz: number): number {
    return this.heights[lx + 1 + (lz + 1) * GRID];
  }

  /** Last phase of a chunk: the trees (after `fillBase` of the same chunk). */
  protected placeTreesPhase(blocks: Uint8Array, x0: number, z0: number): void {
    if (!this.level) return;
    this.chances.fill(-1);
    this.chanceX0 = x0 - TREE_REACH;
    this.chanceZ0 = z0 - TREE_REACH;
    this.chancesActive = true;
    try {
      this.placeTrees(blocks, x0, z0);
    } finally {
      this.chancesActive = false;
    }
  }

  /**
   * Whether a tree rooted on ground `ground` of column (x, z) is left out; version 2 has
   * no such rule, version 3 keeps trees off carved columns and shafts.
   */
  protected treeBlocked(x: number, z: number, ground: number): boolean {
    void x;
    void z;
    void ground;
    return false;
  }

  /** Whether a leaf may not go into column (x, z) (version 3: a shaft's footprint). */
  protected leafBlocked(x: number, z: number): boolean {
    void x;
    void z;
    return false;
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
        if (this.hooks && this.treeBlocked(ox, oz, ground)) continue;
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
              if (this.hooks && this.leafBlocked(ox + dx, oz + dz)) continue;
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
