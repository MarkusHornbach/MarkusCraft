// Terrain statistics of one seed and generator (Phase 7 part A): shapes, water, trees, ores.
import {
  CHUNK_SIZE,
  COAL_MAX_Y,
  COAL_MIN_Y,
  IRON_MAX_Y,
  IRON_MIN_Y,
  SEA_LEVEL,
} from '../game/config';
import { Block } from '../world/blocks';
import { blockIndex } from '../world/chunk';
import { BEACH_ABOVE } from '../world/generation/terrainRules';
import type { TerrainSource } from '../world/generation/terrain';

/** The seeds of the plan's acceptance criteria (Phase 7 part A, section 6). */
export const MEASURED_SEEDS = [1, 1337, 987654321, 42, 7, 2024, 99, 31337];
/** Half the side of the measured area, in columns: 320 × 320 around the origin. */
export const MEASURED_HALF = 160;
/** "Plains": the 9 × 9 neighbourhood of a land column spans at most this much height. */
export const PLAINS_RADIUS = 4;
export const PLAINS_SPAN = 3;
/** "Open": a grass column with no trunk within this many columns. */
export const OPEN_RADIUS = 6;
/** "High land": land above this height. */
export const HIGH_LAND = SEA_LEVEL + 20;

export interface TerrainCounts {
  columns: number;
  water: number;
  land: number;
  plains: number;
  beach: number;
  high: number;
  rock: number;
  grass: number;
  trees: number;
  open: number;
  /** Only with `blocks`: stone (with ore) in the ore ranges, ore, clay on water beds. */
  coalStone: number;
  coal: number;
  ironStone: number;
  iron: number;
  clay: number;
}

export function emptyCounts(): TerrainCounts {
  return {
    columns: 0,
    water: 0,
    land: 0,
    plains: 0,
    beach: 0,
    high: 0,
    rock: 0,
    grass: 0,
    trees: 0,
    open: 0,
    coalStone: 0,
    coal: 0,
    ironStone: 0,
    iron: 0,
    clay: 0,
  };
}

export function addCounts(into: TerrainCounts, from: TerrainCounts): void {
  for (const key of Object.keys(into) as (keyof TerrainCounts)[]) into[key] += from[key];
}

/** Sum of a 0/1 grid over a square, via a summed-area table of size (n + 1)². */
function boxSum(sums: Int32Array, n: number, x0: number, z0: number, x1: number, z1: number) {
  const w = n + 1;
  return (
    sums[x1 + 1 + (z1 + 1) * w] -
    sums[x0 + (z1 + 1) * w] -
    sums[x1 + 1 + z0 * w] +
    sums[x0 + z0 * w]
  );
}

function summedArea(grid: Uint8Array, n: number): Int32Array {
  const w = n + 1;
  const sums = new Int32Array(w * w);
  for (let z = 0; z < n; z++) {
    let row = 0;
    for (let x = 0; x < n; x++) {
      row += grid[x + z * n];
      sums[x + 1 + (z + 1) * w] = sums[x + 1 + z * w] + row;
    }
  }
  return sums;
}

/**
 * Counts the plan's measures over the columns [-half, half)² of a terrain. With `blocks`
 * it also generates the chunks and counts ores and clay (slower).
 */
export function measureTerrain(
  terrain: TerrainSource,
  half = MEASURED_HALF,
  blocks = false,
): TerrainCounts {
  const counts = emptyCounts();
  const size = half * 2;
  // Heights with a rim for the plains window, trunks with a rim for the open rule.
  const rim = Math.max(PLAINS_RADIUS, OPEN_RADIUS);
  const n = size + 2 * rim;
  const heights = new Uint8Array(n * n);
  const trunks = new Uint8Array(n * n);
  for (let z = 0; z < n; z++) {
    for (let x = 0; x < n; x++) {
      const wx = x - half - rim;
      const wz = z - half - rim;
      heights[x + z * n] = terrain.heightAt(wx, wz);
      trunks[x + z * n] = terrain.treeAt(wx, wz) > 0 ? 1 : 0;
    }
  }
  const trunkSums = summedArea(trunks, n);

  for (let z = rim; z < rim + size; z++) {
    for (let x = rim; x < rim + size; x++) {
      const wx = x - half - rim;
      const wz = z - half - rim;
      const h = heights[x + z * n];
      counts.columns++;
      counts.trees += trunks[x + z * n];
      if (h < SEA_LEVEL) {
        counts.water++;
        continue;
      }
      counts.land++;
      if (h > HIGH_LAND) counts.high++;
      if (h <= SEA_LEVEL + BEACH_ABOVE) counts.beach++;
      let lo = 255;
      let hi = 0;
      for (let dz = -PLAINS_RADIUS; dz <= PLAINS_RADIUS; dz++) {
        for (let dx = -PLAINS_RADIUS; dx <= PLAINS_RADIUS; dx++) {
          const v = heights[x + dx + (z + dz) * n];
          if (v < lo) lo = v;
          if (v > hi) hi = v;
        }
      }
      if (hi - lo <= PLAINS_SPAN) counts.plains++;
      if (terrain.isRock(wx, wz)) {
        counts.rock++;
      } else if (terrain.isGrass(wx, wz)) {
        counts.grass++;
        const r = OPEN_RADIUS;
        if (boxSum(trunkSums, n, x - r, z - r, x + r, z + r) === 0) counts.open++;
      }
    }
  }

  if (blocks) {
    const chunks = size / CHUNK_SIZE;
    for (let cz = -chunks / 2; cz < chunks / 2; cz++) {
      for (let cx = -chunks / 2; cx < chunks / 2; cx++) {
        const data = terrain.generateChunk(cx, cz);
        for (let lz = 0; lz < CHUNK_SIZE; lz++) {
          for (let lx = 0; lx < CHUNK_SIZE; lx++) {
            const h = terrain.heightAt(cx * CHUNK_SIZE + lx, cz * CHUNK_SIZE + lz);
            if (h < SEA_LEVEL && data[blockIndex(lx, h, lz)] === Block.CLAY) counts.clay++;
            for (let y = 1; y <= h; y++) {
              const id = data[blockIndex(lx, y, lz)];
              if (id !== Block.STONE && id !== Block.COAL_ORE && id !== Block.IRON_ORE) continue;
              if (y >= COAL_MIN_Y && y <= COAL_MAX_Y) counts.coalStone++;
              if (y >= IRON_MIN_Y && y <= IRON_MAX_Y) counts.ironStone++;
              if (id === Block.COAL_ORE) counts.coal++;
              if (id === Block.IRON_ORE) counts.iron++;
            }
          }
        }
      }
    }
  }
  return counts;
}

/** The plan's shares, in per cent (trees per 1000 grass columns). */
export interface TerrainShares {
  water: number;
  plains: number;
  beach: number;
  high: number;
  rock: number;
  treesPer1000: number;
  open: number;
  coal: number;
  iron: number;
  clay: number;
}

export function sharesOf(c: TerrainCounts): TerrainShares {
  const pct = (a: number, b: number): number => (b === 0 ? 0 : (a / b) * 100);
  return {
    water: pct(c.water, c.columns),
    plains: pct(c.plains, c.land),
    beach: pct(c.beach, c.land),
    high: pct(c.high, c.land),
    rock: pct(c.rock, c.land),
    treesPer1000: c.grass === 0 ? 0 : (c.trees / c.grass) * 1000,
    open: pct(c.open, c.grass),
    coal: pct(c.coal, c.coalStone),
    iron: pct(c.iron, c.ironStone),
    clay: pct(c.clay, c.water),
  };
}
