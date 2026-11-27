// Generator version 3 (Phase 8 part B2a): version 2's terrain with tunnels, ravines and mine shafts.
import { CHUNK_SIZE, CHUNK_VOLUME, WORLD_HEIGHT } from '../../game/config';
import { Block } from '../blocks';
import { CaveCarver, MASK_WORDS } from './caves';
import { placeOres } from './ores';
import {
  SHAFT_HALF,
  type Shaft,
  ShaftPlanner,
  shaftBlock,
  shaftChamberCell,
  shaftTopCell,
  shaftYRange,
} from './shafts';
import { findSpawn, type SpawnPoint } from './spawn';
import type { TerrainSource } from './terrain';
import { TerrainV2 } from './terrainV2';
import { TREE_CANOPY_RADIUS, trunkHeight } from './trees';
import type { WorldOptions } from './worldOptions';

const LAYER = CHUNK_SIZE * CHUNK_SIZE;
/** Trees of a chunk reach this far beyond it (their canopy). */
const TREE_MARGIN = TREE_CANOPY_RADIUS;
const TREE_SIDE = CHUNK_SIZE + 2 * TREE_MARGIN;
const WORDS_PER_COLUMN = WORLD_HEIGHT / 32;
/** The spawn wants no carved cell within this many columns ... */
const SPAWN_CAVE_COLUMNS = 2;
/** ... and this many blocks below its surface. */
const SPAWN_CAVE_DEPTH = 8;

/**
 * Terrain of one seed and one set of world options with caves. The phases are version 2's
 * (base, clay, ores, trees) with the carving and the shafts between the ores and the trees.
 */
export class TerrainV3 extends TerrainV2 {
  readonly caves: CaveCarver;
  readonly shafts: ShaftPlanner;
  private spawn: SpawnPoint | null = null;
  /** While a chunk's trees are placed: the shafts near it and a memo per column. */
  private nearShafts: Shaft[] = [];
  private readonly leafMemo = new Int8Array(TREE_SIDE * TREE_SIDE);
  private memoX0 = 0;
  private memoZ0 = 0;

  constructor(seed: number, options: WorldOptions) {
    super(seed, options);
    this.hooks = true;
    const heights = {
      heightAt: (x: number, z: number) => this.cachedHeightAt(x, z),
      continentAt: (x: number, z: number) => this.continentAt(x, z),
    };
    this.caves = new CaveCarver(this.seed, heights);
    this.shafts = new ShaftPlanner(this.seed, heights, this.caves, () => this.spawnPoint());
  }

  override generateChunk(cx: number, cz: number): Uint8Array {
    const blocks = new Uint8Array(CHUNK_VOLUME);
    const x0 = cx * CHUNK_SIZE;
    const z0 = cz * CHUNK_SIZE;
    const maxHeight = this.fillBase(blocks, cx, cz);
    placeOres(this.seed, blocks, x0, z0, maxHeight);
    const mask = this.caves.mask(cx, cz);
    if (mask) carve(blocks, mask);
    this.placeShafts(blocks, x0, z0);
    const r = TREE_MARGIN;
    this.nearShafts = this.shafts.shaftsIn(
      x0 - r,
      z0 - r,
      x0 + CHUNK_SIZE - 1 + r,
      z0 + CHUNK_SIZE - 1 + r,
    );
    this.leafMemo.fill(-1);
    this.memoX0 = x0 - r;
    this.memoZ0 = z0 - r;
    this.placeTreesPhase(blocks, x0, z0);
    return blocks;
  }

  /** True if cell (x, y, z) is carved (tunnel, chamber or ravine). */
  carved(x: number, y: number, z: number): boolean {
    return this.caves.carved(x, y, z);
  }

  /** True if the ground cell of column (x, z) is carved: a mouth or a ravine. */
  carvedColumn(x: number, z: number): boolean {
    return this.caves.carved(x, this.cachedHeightAt(x, z), z);
  }

  /** True if cell (x, y, z) belongs to a mine shaft (its blocks or its air). */
  inShaft(x: number, y: number, z: number): boolean {
    const s = this.shafts.shaftAt(x, z);
    return s !== null && shaftBlock(s, x, y, z) >= 0;
  }

  /** True if column (x, z) lies in a mine shaft's footprint. */
  inShaftFootprint(x: number, z: number): boolean {
    return this.shafts.shaftAt(x, z) !== null;
  }

  /** Builds every shaft whose footprint touches the chunk at block origin (x0, z0). */
  private placeShafts(blocks: Uint8Array, x0: number, z0: number): void {
    const last = CHUNK_SIZE - 1;
    for (const s of this.shafts.shaftsIn(x0, z0, x0 + last, z0 + last)) {
      const { from, to } = shaftYRange(s);
      const xa = Math.max(x0, s.x - SHAFT_HALF);
      const xb = Math.min(x0 + last, s.x + SHAFT_HALF);
      const za = Math.max(z0, s.z - SHAFT_HALF);
      const zb = Math.min(z0 + last, s.z + SHAFT_HALF);
      for (let z = za; z <= zb; z++) {
        for (let x = xa; x <= xb; x++) {
          const column = x - x0 + (z - z0) * CHUNK_SIZE;
          for (let y = from; y <= to; y++) {
            const block = shaftBlock(s, x, y, z);
            if (block >= 0) blocks[column + y * LAYER] = block;
          }
        }
      }
    }
  }

  override isGrass(x: number, z: number): boolean {
    return this.grassWith(x, z, true);
  }

  override treeAt(x: number, z: number): number {
    return this.treeWith(x, z, true);
  }

  private grassWith(x: number, z: number, shafts: boolean): boolean {
    if (!super.isGrass(x, z)) return false;
    if (this.carvedColumn(x, z)) return false;
    return !shafts || !this.inShaftFootprint(x, z);
  }

  private treeWith(x: number, z: number, shafts: boolean): number {
    if (!this.isOrigin(x, z)) return 0;
    if (!this.grassWith(x, z, shafts)) return 0;
    return trunkHeight(this.seed, x, z);
  }

  /** Version 2's rule, and neither carved nor part of a shaft. */
  override oreHost(x: number, y: number, z: number): boolean {
    return super.oreHost(x, y, z) && !this.caves.carved(x, y, z) && !this.inShaft(x, y, z);
  }

  /** Whether column (x, z) lies in the footprint of one of the shafts near the chunk. */
  private nearShaftFootprint(x: number, z: number): boolean {
    for (const s of this.nearShafts) {
      if (Math.abs(x - s.x) <= SHAFT_HALF && Math.abs(z - s.z) <= SHAFT_HALF) return true;
    }
    return false;
  }

  // The hooks are asked only while `generateChunk` places the chunk's trees.
  protected override treeBlocked(x: number, z: number, ground: number): boolean {
    return this.caves.carved(x, ground, z) || this.nearShaftFootprint(x, z);
  }

  protected override leafBlocked(x: number, z: number): boolean {
    const i = x - this.memoX0 + (z - this.memoZ0) * TREE_SIDE;
    let blocked = this.leafMemo[i];
    if (blocked < 0) {
      blocked = this.nearShaftFootprint(x, z) || this.carvedColumn(x, z) ? 1 : 0;
      this.leafMemo[i] = blocked;
    }
    return blocked === 1;
  }

  /**
   * The spawn: `findSpawn` over a view of this terrain without the shafts (they are placed
   * relative to the spawn), whose grass also wants no carved cell near and below it.
   */
  spawnPoint(): SpawnPoint {
    if (!this.spawn) {
      const view: TerrainSource = {
        seed: this.seed,
        wantsWood: this.wantsWood,
        heightAt: (x, z) => this.heightAt(x, z),
        isUnderWater: (x, z) => this.isUnderWater(x, z),
        isGrass: (x, z) => this.grassWith(x, z, false) && this.clearBelow(x, z),
        isRock: (x, z) => this.isRock(x, z),
        treeAt: (x, z) => this.treeWith(x, z, false),
        oreHost: (x, y, z) => this.oreHost(x, y, z),
        generateChunk: (cx, cz) => this.generateChunk(cx, cz),
      };
      this.spawn = findSpawn(view);
    }
    return this.spawn;
  }

  /** No carved cell within the spawn's columns and depth around column (x, z). */
  private clearBelow(x: number, z: number): boolean {
    const h = this.cachedHeightAt(x, z);
    const c = SPAWN_CAVE_COLUMNS;
    for (let dz = -c; dz <= c; dz++) {
      for (let dx = -c; dx <= c; dx++) {
        if (this.caves.carvedBetween(x + dx, z + dz, h - SPAWN_CAVE_DEPTH, h)) return false;
      }
    }
    return true;
  }
}

/** Turns every carved cell of the chunk into air. */
function carve(blocks: Uint8Array, mask: Uint32Array): void {
  for (let w = 0; w < MASK_WORDS; w++) {
    let bits = mask[w];
    if (bits === 0) continue;
    const column = (w / WORDS_PER_COLUMN) | 0;
    const yBase = (w % WORDS_PER_COLUMN) * 32;
    while (bits !== 0) {
      const bit = 31 - Math.clz32(bits & -bits);
      bits &= bits - 1;
      blocks[column + (yBase + bit) * LAYER] = Block.AIR;
    }
  }
}

/** A cell of the world. */
export interface SiteCell {
  x: number;
  y: number;
  z: number;
}

/** Where a test finds the caves of a generator 3 world (the test API's `caveSites`). */
export interface CaveSites {
  /** The spawn shaft: the standing cell on its collar and one in its chamber. */
  shaft: { x: number; z: number; top: SiteCell; chamber: SiteCell } | null;
  /** The entrance whose mouth lies nearest the spawn: its mouth and its deep end. */
  entrance: { mouth: SiteCell; end: SiteCell } | null;
  /** The ravine nearest the spawn: its first end (on the surface) and its lowest floor cell. */
  ravine: { start: SiteCell; floor: SiteCell } | null;
}

/** The spawn shaft, the nearest entrance and the nearest ravine (within 256 blocks). */
export function caveSites(terrain: TerrainV3): CaveSites {
  const spawn = terrain.spawnPoint();
  const s = terrain.shafts.spawnShaft();
  const shapes = terrain.caves.shapesIn(spawn.x - 256, spawn.z - 256, spawn.x + 256, spawn.z + 256);
  const nearest = (kind: string) => {
    let best = null;
    let bestD = Infinity;
    for (const shape of shapes) {
      if (shape.kind !== kind) continue;
      const d = Math.hypot(shape.startX - spawn.x, shape.startZ - spawn.z);
      if (d < bestD) {
        bestD = d;
        best = shape;
      }
    }
    return best;
  };
  const entrance = nearest('entrance');
  const ravine = nearest('ravine');
  return {
    shaft: s ? { x: s.x, z: s.z, top: shaftTopCell(s), chamber: shaftChamberCell(s) } : null,
    entrance: entrance
      ? {
          mouth: { x: entrance.startX, y: entrance.startY, z: entrance.startZ },
          end: { x: entrance.endX, y: entrance.endY, z: entrance.endZ },
        }
      : null,
    ravine: ravine
      ? {
          start: { x: ravine.startX, y: ravine.startY, z: ravine.startZ },
          floor: { x: ravine.endX, y: ravine.endY, z: ravine.endZ },
        }
      : null,
  };
}
