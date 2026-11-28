// Abandoned mine shafts of generator 3: a lit spiral staircase from a log frame down to a chamber.
//
// Sites lie on a jittered grid (a hashed chance per cell) plus one near the spawn, found by
// a hashed ring search. A site needs dry land under its whole footprint, little height
// difference and no carved cell within one column of it, so tunnels and ravines never cut
// a shaft. Everything is a pure function of the seed, the heights, the carve mask and the
// spawn (which itself never depends on shafts).
import {
  SHAFT_MAX_HEIGHT_DIFF,
  SEA_LEVEL,
  SHAFT_CHANCE,
  SHAFT_GRID,
  WORLD_HEIGHT,
} from '../../game/config';
import { hash2, mulberry32 } from '../../util/rng';
import { Block } from '../blocks';
import type { CaveCarver, HeightSource } from './caves';
import type { SpawnPoint } from './spawn';
import { BEACH_ABOVE } from './terrainRules';

/** Half the footprint's edge: the footprint is 7 × 7 columns around the centre. */
export const SHAFT_HALF = 3;
/** The well (a spiral of 8 steps around the central log column) and its walls. */
const WELL_HALF = 1;
const BORDER = 2;
/** The frame's height above the top (posts, then the lintel). */
const FRAME = 4;
/** A torch stands on every this many steps. */
const TORCH_EVERY = 4;
/** The chamber's standing height range and its air height. */
const CHAMBER_MIN_Y = 10;
const CHAMBER_MAX_Y = 14;
const CHAMBER_AIR = 3;
/** Spawn shaft: rings searched from the spawn (horizontal distance), near first. */
export const SPAWN_SHAFT_MIN = 24;
export const SPAWN_SHAFT_NEAR = 64;
export const SPAWN_SHAFT_MAX = 128;
const RING_STEP = 4;
/** Grid shafts this close to the spawn shaft are left out. */
const SPAWN_SHAFT_CLEARANCE = 48;
/** The jitter keeps grid shafts this far from their cell's edges. */
const GRID_MARGIN = 16;
const SALT_SHAFT = 0x5af7;
const SALT_SPAWN_SHAFT = 0x5b01;

/** The spiral's cells around the centre, in walking order (each next to the one before). */
export const RING: readonly (readonly [number, number])[] = [
  [-1, -1],
  [0, -1],
  [1, -1],
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
];
/** For each ring cell, the border cell outside it from which the stairs are entered. */
const RING_OUT: readonly (readonly [number, number])[] = [
  [-1, -2],
  [0, -2],
  [1, -2],
  [2, 0],
  [1, 2],
  [0, 2],
  [-1, 2],
  [-2, 0],
];

export interface Shaft {
  /** Centre column (the log column). */
  x: number;
  z: number;
  /** Y of the collar (planks); the frame stands on it, the first step lies one below. */
  top: number;
  /** Y the chamber's floor is stood on (its stone bricks lie one below). */
  floor: number;
  /** Ring cell of the first step. */
  entry: number;
  spawn: boolean;
}

/** The standing cell on the collar next to the first step: where the walk down starts. */
export function shaftTopCell(s: Shaft): { x: number; y: number; z: number } {
  const [ox, oz] = RING_OUT[s.entry];
  return { x: s.x + ox, y: s.top + 1, z: s.z + oz };
}

/** A standing cell in the chamber (the corner next to the last step). */
export function shaftChamberCell(s: Shaft): { x: number; y: number; z: number } {
  return { x: s.x + 2, y: s.floor, z: s.z - 2 };
}

/**
 * The chest cell of generator 4 (Phase 8 part B3b): the chamber corner without a torch,
 * opposite the stair landing, standing on the chamber's stone bricks.
 */
export function shaftChestCell(s: Shaft): { x: number; y: number; z: number } {
  return { x: s.x - 3, y: s.floor, z: s.z + 3 };
}

/**
 * The block a shaft puts into cell (x, y, z), or -1 where it leaves the generated block.
 * The caller makes sure the column lies in the shaft's footprint.
 */
export function shaftBlock(s: Shaft, x: number, y: number, z: number): number {
  const dx = x - s.x;
  const dz = z - s.z;
  const ax = Math.abs(dx);
  const az = Math.abs(dz);
  if (ax > SHAFT_HALF || az > SHAFT_HALF) return -1;
  const top = s.top;
  const floor = s.floor;
  const ring = Math.max(ax, az);
  if (ring === 0) return y >= floor && y <= top + FRAME - 1 ? Block.LOG : -1;
  if (ring === WELL_HALF) {
    if (y < floor - 1 || y > top + FRAME) return -1;
    if (y === floor - 1) return Block.STONE_BRICKS;
    const p = ringIndex(dx, dz);
    // Step k stands on y = top - k, its block one below; k runs to the chamber's floor.
    const steps = top - floor;
    const kBlock = top - 1 - y;
    if (kBlock >= 0 && kBlock < steps && (s.entry + kBlock) % 8 === p) return Block.PLANKS;
    const kStand = top - y;
    if (
      kStand >= 0 &&
      kStand < steps &&
      kStand % TORCH_EVERY === 0 &&
      (s.entry + kStand) % 8 === p
    ) {
      return Block.TORCH;
    }
    return Block.AIR;
  }
  if (y === floor - 1) return Block.STONE_BRICKS;
  if (y >= floor && y < floor + CHAMBER_AIR) {
    if (ax === SHAFT_HALF && az === SHAFT_HALF && y === floor && dx === dz) return Block.TORCH;
    return Block.AIR;
  }
  if (ring !== BORDER) return -1;
  if (y === top || y === top + FRAME) return Block.PLANKS;
  if (y > top && y < top + FRAME) return ax === BORDER && az === BORDER ? Block.LOG : Block.AIR;
  return -1;
}

function ringIndex(dx: number, dz: number): number {
  for (let i = 0; i < RING.length; i++) if (RING[i][0] === dx && RING[i][1] === dz) return i;
  return 0;
}

/** Lowest and highest cell a shaft changes. */
export function shaftYRange(s: Shaft): { from: number; to: number } {
  return { from: s.floor - 1, to: Math.min(WORLD_HEIGHT - 1, s.top + FRAME) };
}

/** The shafts of one seed: the spawn shaft and the grid shafts, cached. */
export class ShaftPlanner {
  readonly seed: number;
  private readonly heights: HeightSource;
  private readonly caves: CaveCarver;
  private readonly spawnOf: () => SpawnPoint;
  private spawnShaftCache: Shaft | null | undefined;
  private readonly grid = new Map<number, Shaft | null>();
  private readonly candidates = new Map<number, { x: number; z: number; hash: number } | null>();

  constructor(seed: number, heights: HeightSource, caves: CaveCarver, spawn: () => SpawnPoint) {
    this.seed = seed >>> 0;
    this.heights = heights;
    this.caves = caves;
    this.spawnOf = spawn;
  }

  /**
   * The shaft whose centre is (x, z) if a shaft fits there: every footprint column dry
   * land (not water, not a beach), heights within `SHAFT_MAX_HEIGHT_DIFF`, no carved
   * cell in the footprint or next to it. Null otherwise.
   */
  siteAt(x: number, z: number, hash: number, spawn: boolean): Shaft | null {
    let min = Infinity;
    let max = -Infinity;
    for (let dz = -SHAFT_HALF; dz <= SHAFT_HALF; dz++) {
      for (let dx = -SHAFT_HALF; dx <= SHAFT_HALF; dx++) {
        const h = this.heights.heightAt(x + dx, z + dz);
        if (h <= SEA_LEVEL + BEACH_ABOVE) return null;
        if (h < min) min = h;
        if (h > max) max = h;
      }
    }
    if (max - min > SHAFT_MAX_HEIGHT_DIFF) return null;
    const reach = SHAFT_HALF + 1;
    for (let dz = -reach; dz <= reach; dz++) {
      for (let dx = -reach; dx <= reach; dx++) {
        if (this.caves.carvedBetween(x + dx, z + dz, 0, WORLD_HEIGHT - 1)) return null;
      }
    }
    const rng = mulberry32(hash);
    const floor = CHAMBER_MIN_Y + Math.floor(rng() * (CHAMBER_MAX_Y - CHAMBER_MIN_Y + 1));
    const top = min;
    // The last step lands on the chamber's floor at the corner `shaftChamberCell` names.
    const steps = top - floor;
    const last = 2; // RING index of (1, -1): the chamber cell (2, -2) lies outside it.
    const entry = (((last - steps) % 8) + 8) % 8;
    return { x, z, top, floor, entry, spawn };
  }

  /** The shaft near the spawn, or null if none fits within `SPAWN_SHAFT_MAX`. */
  spawnShaft(): Shaft | null {
    if (this.spawnShaftCache === undefined) this.spawnShaftCache = this.findSpawnShaft();
    return this.spawnShaftCache;
  }

  private findSpawnShaft(): Shaft | null {
    const spawn = this.spawnOf();
    const hash = hash2(this.seed ^ SALT_SPAWN_SHAFT, 0, 0);
    const offset = (hash / 4294967296) * Math.PI * 2;
    for (let d = SPAWN_SHAFT_MIN; d <= SPAWN_SHAFT_MAX; d += RING_STEP) {
      const n = Math.ceil((2 * Math.PI * d) / 6);
      for (let i = 0; i < n; i++) {
        const a = offset + (i / n) * Math.PI * 2;
        const x = spawn.x + Math.round(Math.cos(a) * d);
        const z = spawn.z + Math.round(Math.sin(a) * d);
        const site = this.siteAt(x, z, hash2(this.seed ^ SALT_SPAWN_SHAFT, x, z), true);
        if (site) return site;
      }
    }
    return null;
  }

  /** The shaft of grid cell (gx, gz), or null. */
  gridShaft(gx: number, gz: number): Shaft | null {
    const key = (gx + 0x8000) * 0x10000 + (gz + 0x8000);
    let shaft = this.grid.get(key);
    if (shaft === undefined) {
      shaft = this.computeGridShaft(gx, gz);
      this.grid.set(key, shaft);
    }
    return shaft;
  }

  /** Where grid cell (gx, gz) would put its shaft (by hashes only), or null. */
  private gridCandidate(gx: number, gz: number): { x: number; z: number; hash: number } | null {
    const key = (gx + 0x8000) * 0x10000 + (gz + 0x8000);
    let candidate = this.candidates.get(key);
    if (candidate === undefined) {
      candidate = this.computeCandidate(gx, gz);
      this.candidates.set(key, candidate);
    }
    return candidate;
  }

  private computeCandidate(gx: number, gz: number): { x: number; z: number; hash: number } | null {
    const hash = hash2(this.seed ^ SALT_SHAFT, gx, gz);
    const rng = mulberry32(hash);
    if (rng() >= SHAFT_CHANCE) return null;
    const span = SHAFT_GRID - 2 * GRID_MARGIN;
    const x = gx * SHAFT_GRID + GRID_MARGIN + Math.floor(rng() * span);
    const z = gz * SHAFT_GRID + GRID_MARGIN + Math.floor(rng() * span);
    return { x, z, hash };
  }

  private computeGridShaft(gx: number, gz: number): Shaft | null {
    const candidate = this.gridCandidate(gx, gz);
    if (!candidate) return null;
    const { x, z, hash } = candidate;
    const own = this.spawnShaft();
    if (own) {
      const d = Math.hypot(x - own.x, z - own.z);
      if (d < SPAWN_SHAFT_CLEARANCE) return null;
    }
    return this.siteAt(x, z, hash, false);
  }

  /** Every shaft whose footprint touches the area (inclusive). */
  shaftsIn(minX: number, minZ: number, maxX: number, maxZ: number): Shaft[] {
    const result: Shaft[] = [];
    const touches = (s: { x: number; z: number }): boolean =>
      s.x + SHAFT_HALF >= minX &&
      s.x - SHAFT_HALF <= maxX &&
      s.z + SHAFT_HALF >= minZ &&
      s.z - SHAFT_HALF <= maxZ;
    const own = this.spawnShaft();
    if (own && touches(own)) result.push(own);
    const gx0 = Math.floor((minX - SHAFT_HALF) / SHAFT_GRID);
    const gx1 = Math.floor((maxX + SHAFT_HALF) / SHAFT_GRID);
    const gz0 = Math.floor((minZ - SHAFT_HALF) / SHAFT_GRID);
    const gz1 = Math.floor((maxZ + SHAFT_HALF) / SHAFT_GRID);
    for (let gz = gz0; gz <= gz1; gz++) {
      for (let gx = gx0; gx <= gx1; gx++) {
        // The site test (heights, carving) only for a candidate that touches the area.
        const c = this.gridCandidate(gx, gz);
        if (!c || !touches(c)) continue;
        const s = this.gridShaft(gx, gz);
        if (s) result.push(s);
      }
    }
    return result;
  }

  /** The shaft whose footprint holds column (x, z), or null. */
  shaftAt(x: number, z: number): Shaft | null {
    const own = this.spawnShaft();
    if (own && Math.abs(x - own.x) <= SHAFT_HALF && Math.abs(z - own.z) <= SHAFT_HALF) return own;
    // Grid shafts keep `GRID_MARGIN` from their cell's edges: only the own cell can hold one.
    const gx = Math.floor(x / SHAFT_GRID);
    const gz = Math.floor(z / SHAFT_GRID);
    const c = this.gridCandidate(gx, gz);
    if (!c || Math.abs(x - c.x) > SHAFT_HALF || Math.abs(z - c.z) > SHAFT_HALF) return null;
    return this.gridShaft(gx, gz);
  }
}
