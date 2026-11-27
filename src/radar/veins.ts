// The seed side of the radar: the ore veins of a world per ore cell column, from the generator.
import { getTerrain, type TerrainSource } from '../world/generation/terrain';
import {
  ORE_CELL,
  ORE_KINDS,
  VEIN_CELLS_MAX,
  oreCellRows,
  oreKindSeed,
  veinCells,
} from '../world/generation/ores';
import type { WorldGen } from '../world/generation/worldOptions';

/**
 * The veins whose origin lies in one ore cell column, as the generator places them: only
 * cells where the generator leaves stone (`oreHost`) and no earlier kind's vein took the
 * cell. Vein `v` has block `blocks[v]` and the cells `cells[3·starts[v] … 3·starts[v+1])`.
 */
export interface ColumnVeins {
  readonly count: number;
  readonly blocks: Uint8Array;
  readonly starts: Uint16Array;
  readonly cells: Int32Array;
}

/** Bounded cache of columns (oldest dropped); a cache only, it never changes results. */
export const VEIN_INDEX_COLUMNS = 2048;

const MAX_VEINS = ORE_KINDS.reduce((n, k) => n + oreCellRows(k).to - oreCellRows(k).from + 1, 0);

function columnKey(cellX: number, cellZ: number): number {
  return (cellX & 0xffff) * 0x10000 + (cellZ & 0xffff);
}

/** Key of a cell for the "taken by an earlier kind" set; exact within a few columns. */
function cellKey(x: number, y: number, z: number): number {
  return ((x & 0xfffff) * 0x100000 + (z & 0xfffff)) * 128 + y;
}

/** The ore veins of one seed and generator; depends on nothing else, never on the world. */
export class VeinIndex {
  readonly seed: number;
  readonly gen: WorldGen;
  private readonly terrain: TerrainSource;
  private readonly kindSeeds: number[];
  private readonly columns = new Map<number, ColumnVeins>();
  /** Columns built since the index was made (tests: the cache works). */
  built = 0;
  // Scratch buffers of `build`.
  private readonly out = new Int32Array(VEIN_CELLS_MAX * 3);
  private readonly tmpBlocks = new Uint8Array(MAX_VEINS);
  private readonly tmpStarts = new Uint16Array(MAX_VEINS + 1);
  private readonly tmpCells = new Int32Array(MAX_VEINS * VEIN_CELLS_MAX * 3);
  private readonly taken = new Set<number>();

  constructor(seed: number, gen: WorldGen) {
    this.seed = seed >>> 0;
    this.gen = gen;
    this.terrain = getTerrain(seed, gen);
    this.kindSeeds = ORE_KINDS.map((k) => oreKindSeed(this.seed, k));
  }

  get cachedColumns(): number {
    return this.columns.size;
  }

  /** The veins of ore cell column (cellX, cellZ), from the cache or worked out now. */
  column(cellX: number, cellZ: number): ColumnVeins {
    const key = columnKey(cellX, cellZ);
    let column = this.columns.get(key);
    if (column) return column;
    if (this.columns.size >= VEIN_INDEX_COLUMNS) {
      for (const oldest of this.columns.keys()) {
        this.columns.delete(oldest);
        break;
      }
    }
    column = this.build(cellX, cellZ);
    this.columns.set(key, column);
    return column;
  }

  /** Ore cell column of a block coordinate. */
  static cellOf(v: number): number {
    return Math.floor(v / ORE_CELL);
  }

  private build(cellX: number, cellZ: number): ColumnVeins {
    this.built++;
    const out = this.out;
    const terrain = this.terrain;
    let count = 0;
    let cellCount = 0;
    for (let k = 0; k < ORE_KINDS.length; k++) {
      const kind = ORE_KINDS[k];
      const kindSeed = this.kindSeeds[k];
      const rows = oreCellRows(kind);
      if (k > 0) this.fillTaken(k, cellX, cellZ);
      for (let cellY = rows.from; cellY <= rows.to; cellY++) {
        const n = veinCells(kind, kindSeed, cellX, cellY, cellZ, out);
        if (n === 0) continue;
        const start = cellCount;
        for (let c = 0; c < n; c++) {
          const x = out[c * 3];
          const y = out[c * 3 + 1];
          const z = out[c * 3 + 2];
          if (!terrain.oreHost(x, y, z)) continue;
          if (k > 0 && this.taken.has(cellKey(x, y, z))) continue;
          this.tmpCells[cellCount * 3] = x;
          this.tmpCells[cellCount * 3 + 1] = y;
          this.tmpCells[cellCount * 3 + 2] = z;
          cellCount++;
        }
        if (cellCount === start) continue;
        this.tmpBlocks[count] = kind.block;
        this.tmpStarts[count] = start;
        count++;
      }
    }
    this.tmpStarts[count] = cellCount;
    return {
      count,
      blocks: this.tmpBlocks.slice(0, count),
      starts: this.tmpStarts.slice(0, count + 1),
      cells: this.tmpCells.slice(0, cellCount * 3),
    };
  }

  /**
   * Fills `taken` with the cells of earlier kinds' veins that can reach this column (their
   * origins lie in the 3 × 3 columns around it; a vein reaches 2 < `ORE_CELL` blocks).
   */
  private fillTaken(kindIndex: number, cellX: number, cellZ: number): void {
    const taken = this.taken;
    const out = this.out;
    taken.clear();
    for (let j = 0; j < kindIndex; j++) {
      const kind = ORE_KINDS[j];
      const rows = oreCellRows(kind);
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          for (let cellY = rows.from; cellY <= rows.to; cellY++) {
            const n = veinCells(kind, this.kindSeeds[j], cellX + dx, cellY, cellZ + dz, out);
            for (let c = 0; c < n; c++) {
              taken.add(cellKey(out[c * 3], out[c * 3 + 1], out[c * 3 + 2]));
            }
          }
        }
      }
    }
  }
}
