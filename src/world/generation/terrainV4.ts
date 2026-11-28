// Generator version 4 (Phase 8 part B3b): version 3's terrain with a loot chest in every mine shaft's chamber.
import { CHUNK_SIZE } from '../../game/config';
import { Block } from '../blocks';
import type { ChestState } from '../blockState';
import { lootOf } from '../loot';
import { type Shaft, shaftChestCell } from './shafts';
import type { Place } from './terrain';
import { type SiteCell, TerrainV3 } from './terrainV3';

const LAYER = CHUNK_SIZE * CHUNK_SIZE;

/**
 * Generator 3 plus one chest per shaft at `shaftChestCell`. The chest's contents are never
 * generated: `lootAt` derives them from the seed and the cell when a chest is first read.
 */
export class TerrainV4 extends TerrainV3 {
  override generateChunk(cx: number, cz: number): Uint8Array {
    const blocks = super.generateChunk(cx, cz);
    // The chest cell lies in the chamber, below anything trees reach: putting it in after
    // the trees is the same as right after the shafts.
    const x0 = cx * CHUNK_SIZE;
    const z0 = cz * CHUNK_SIZE;
    const last = CHUNK_SIZE - 1;
    for (const s of this.shafts.shaftsIn(x0, z0, x0 + last, z0 + last)) {
      const c = shaftChestCell(s);
      if (c.x < x0 || c.x > x0 + last || c.z < z0 || c.z > z0 + last) continue;
      blocks[c.x - x0 + (c.z - z0) * CHUNK_SIZE + c.y * LAYER] = Block.CHEST;
    }
    return blocks;
  }

  /** The shaft whose chest cell is (x, y, z), or null. */
  chestShaftAt(x: number, y: number, z: number): Shaft | null {
    const s = this.shafts.shaftAt(x, z);
    if (!s) return null;
    const c = shaftChestCell(s);
    return c.x === x && c.y === y && c.z === z ? s : null;
  }

  /** The derived contents of the chest in cell (x, y, z), or null if no shaft puts one there. */
  lootAt(x: number, y: number, z: number): ChestState | null {
    const s = this.chestShaftAt(x, y, z);
    return s ? lootOf(this.seed, x, y, z, s.spawn ? 'starter' : 'rich') : null;
  }

  /** Generator 3's places, then one `chest` per shaft whose chest cell lies in the area. */
  override placesIn(minX: number, minZ: number, maxX: number, maxZ: number, out: Place[]): void {
    super.placesIn(minX, minZ, maxX, maxZ, out);
    for (const s of this.shafts.shaftsIn(minX, minZ, maxX, maxZ)) {
      const c = shaftChestCell(s);
      if (c.x >= minX && c.x <= maxX && c.z >= minZ && c.z <= maxZ) {
        out.push({ kind: 'chest', x: c.x, y: c.y, z: c.z });
      }
    }
  }
}

/** The chunk that holds the spawn shaft's chest, or null without a spawn shaft. */
export function spawnChestChunk(terrain: TerrainV4): { cx: number; cz: number } | null {
  const s = terrain.shafts.spawnShaft();
  if (!s) return null;
  const c = shaftChestCell(s);
  return { cx: Math.floor(c.x / CHUNK_SIZE), cz: Math.floor(c.z / CHUNK_SIZE) };
}

/** Where a test finds the loot chests of a generator 4 world (the test API's `lootSites`). */
export interface LootSites {
  /** The spawn shaft's chest and a standing cell next to it in the chamber; null: no shaft. */
  spawn: { chest: SiteCell; stand: SiteCell } | null;
  /** The chest of the grid shaft nearest the spawn within 256 blocks, or null. */
  grid: SiteCell | null;
}

/** The spawn shaft's chest and the nearest grid shaft's chest (Phase 8 part B3b). */
export function lootSites(terrain: TerrainV4): LootSites {
  const own = terrain.shafts.spawnShaft();
  const spawn = terrain.spawnPoint();
  const r = 256;
  let grid: SiteCell | null = null;
  let best = Infinity;
  for (const s of terrain.shafts.shaftsIn(spawn.x - r, spawn.z - r, spawn.x + r, spawn.z + r)) {
    if (s.spawn) continue;
    const c = shaftChestCell(s);
    const d = Math.hypot(c.x - spawn.x, c.z - spawn.z);
    if (d <= r && d < best) {
      best = d;
      grid = c;
    }
  }
  if (!own) return { spawn: null, grid };
  const chest = shaftChestCell(own);
  // The chamber cell diagonal to the chest corner: free, on the stone bricks.
  return { spawn: { chest, stand: { x: chest.x + 1, y: chest.y, z: chest.z - 1 } }, grid };
}
