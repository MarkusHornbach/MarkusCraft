// The loot checksum of generator 4 (Phase 8 part B3b): the derived contents of many loot chests in one number.
import { fnv1a } from '../util/rng';
import { shaftChestCell } from '../world/generation/shafts';
import { getTerrain } from '../world/generation/terrain';
import { TerrainV4 } from '../world/generation/terrainV4';
import { TERRAIN_SHAPES, TREE_DENSITIES, type WorldGen } from '../world/generation/worldOptions';

/** FNV-1a over cell, slot, item and count of every filled slot of the given chests. */
function hashChests(
  terrain: TerrainV4,
  cells: { x: number; y: number; z: number }[],
  h: number,
): number {
  const word = new Int32Array(6);
  const bytes = new Uint8Array(word.buffer);
  for (const c of cells) {
    const loot = terrain.lootAt(c.x, c.y, c.z);
    if (!loot) throw new Error(`no loot at ${c.x} ${c.y} ${c.z}`);
    loot.slots.forEach((stack, slot) => {
      if (!stack) return;
      word.set([c.x, c.y, c.z, slot, stack.item, stack.count]);
      h = fnv1a(bytes, h);
    });
  }
  return h;
}

/**
 * Every loot chest of seed 1337 (balanced, few) whose shaft lies within ±`range` of the
 * origin, then the spawn chest of each of the twelve presets.
 */
export function lootChecksum1337(range = 1024): number {
  const gen: WorldGen = { version: 4, options: { terrain: 'balanced', trees: 'few' } };
  const terrain = getTerrain(1337, gen) as TerrainV4;
  const shafts = terrain.shafts
    .shaftsIn(-range, -range, range, range)
    .filter((s) => Math.abs(s.x) <= range && Math.abs(s.z) <= range);
  let h = hashChests(terrain, shafts.map(shaftChestCell), 0x811c9dc5);
  for (const t of TERRAIN_SHAPES) {
    for (const trees of TREE_DENSITIES) {
      const preset = getTerrain(1337, { version: 4, options: { terrain: t, trees } }) as TerrainV4;
      const s = preset.shafts.spawnShaft();
      if (s) h = hashChests(preset, [shaftChestCell(s)], h);
    }
  }
  return h >>> 0;
}
