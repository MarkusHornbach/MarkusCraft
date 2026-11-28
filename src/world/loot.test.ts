// Loot tables, the item rule, determinism and the frozen loot checksum (Phase 8 part B3b, AC2.1, AC2.2).
import { describe, expect, it } from 'vitest';
import { CHEST_SLOTS, STACK_SIZE } from '../game/config';
import { Item, getItemDef, isItem, toolOf } from '../items/items';
import { RECIPES } from '../items/recipes';
import { NATURAL_BLOCKS } from '../progress/tables';
import { lootChecksum1337 } from '../testing/lootChecksum';
import { LOOT_CHECKSUM_1337_V4 } from '../testing/terrainChecksum';
import { Block } from './blocks';
import { emptyChest, initialState } from './blockState';
import { shaftChestCell } from './generation/shafts';
import { getTerrain } from './generation/terrain';
import type { TerrainV4 } from './generation/terrainV4';
import { LOOT_TABLES, type LootTableName, lootOf } from './loot';

const GEN4 = { version: 4, options: { terrain: 'balanced', trees: 'few' } } as const;
const GEN3 = { version: 3, options: { terrain: 'balanced', trees: 'few' } } as const;
const NAMES: LootTableName[] = ['starter', 'rich'];

describe('loot tables', () => {
  it('Phase 8B3b AC2.2 no loot item is a tool or a natural block; every item exists; counts fit', () => {
    for (const name of NAMES) {
      const table = LOOT_TABLES[name];
      expect(table.maxStacks, name).toBeLessThanOrEqual(CHEST_SLOTS);
      expect(table.maxStacks, name).toBeLessThanOrEqual(table.entries.length);
      expect(table.minStacks, name).toBeGreaterThanOrEqual(1);
      for (const e of table.entries) {
        const label = `${name} ${e.item}`;
        expect(isItem(e.item), label).toBe(true);
        expect(toolOf(e.item), label).toBeNull();
        expect(NATURAL_BLOCKS.includes(e.item), label).toBe(false);
        expect(e.item, label).not.toBe(Block.LOG);
        expect(e.min, label).toBeGreaterThanOrEqual(1);
        expect(e.max, label).toBeLessThanOrEqual(
          Math.min(STACK_SIZE, getItemDef(e.item)?.stackSize ?? 0),
        );
        expect(e.min, label).toBeLessThanOrEqual(e.max);
        expect(e.weight, label).toBeGreaterThan(0);
      }
    }
  });

  it('Phase 8B3b AC2.2 draws stay within the tables, without repeats, and fit 27 slots', () => {
    for (const name of NAMES) {
      const table = LOOT_TABLES[name];
      const counts = new Map<number, number>();
      for (let i = 0; i < 2000; i++) {
        const chest = lootOf(7, i * 13, 10 + (i % 5), -i * 7, name);
        expect(chest.slots).toHaveLength(CHEST_SLOTS);
        const filled = chest.slots.filter((s) => s !== null);
        expect(filled.length).toBeGreaterThanOrEqual(table.minStacks);
        expect(filled.length).toBeLessThanOrEqual(table.maxStacks);
        expect(new Set(filled.map((s) => s?.item)).size).toBe(filled.length);
        for (const s of filled) {
          if (!s) continue;
          const e = table.entries.find((entry) => entry.item === s.item);
          expect(e, `${name} ${s.item}`).toBeDefined();
          if (!e) continue;
          expect(s.count).toBeGreaterThanOrEqual(e.min);
          expect(s.count).toBeLessThanOrEqual(e.max);
          counts.set(s.item, (counts.get(s.item) ?? 0) + 1);
        }
      }
      // Every entry turns up, the iron block too ("rarely").
      for (const e of table.entries)
        expect(counts.get(e.item) ?? 0, `${name} ${e.item}`).toBeGreaterThan(0);
    }
    const rich = new Map<number, number>();
    for (let i = 0; i < 2000; i++) {
      for (const s of lootOf(9, i, 12, i, 'rich').slots)
        if (s) rich.set(s.item, (rich.get(s.item) ?? 0) + 1);
    }
    expect(rich.get(Block.IRON_BLOCK) ?? 0).toBeLessThan(rich.get(Block.TORCH) ?? 0);
  });

  it('Phase 8B3b the starter chest never holds every stick the first pickaxes need (level 3 stays reachable)', () => {
    // Chapters 1 and 2 give exactly level 3 with the first crafts that cannot be avoided;
    // with every stick from loot the stick's first craft (5 XP) would be skipped.
    const sticksNeeded = [Item.WOODEN_PICKAXE, Item.STONE_PICKAXE].reduce((sum, tool) => {
      const recipe = RECIPES.find((r) => r.result.item === tool);
      return sum + (recipe?.ingredients.find((i) => i.item === Item.STICK)?.count ?? 0);
    }, 0);
    const sticks = LOOT_TABLES.starter.entries.find((e) => e.item === Item.STICK);
    expect(sticks?.max ?? 0).toBeLessThan(sticksNeeded);
    // Planks are made for task 2 and coal for task 11 anyway; torches for task 13.
  });

  it('Phase 8B3b AC2.1 the same seed and cell always give the same contents', () => {
    expect(lootOf(1337, 4, 11, -9, 'rich')).toEqual(lootOf(1337, 4, 11, -9, 'rich'));
    expect(lootOf(1337, 4, 11, -9, 'rich')).not.toEqual(lootOf(1338, 4, 11, -9, 'rich'));
    expect(lootOf(1337, 4, 11, -9, 'rich')).not.toEqual(lootOf(1337, 4, 12, -9, 'rich'));
  });

  it('Phase 8B3b AC2.1 the spawn chest reads the starter table, grid chests the rich one', () => {
    const terrain = getTerrain(1337, GEN4) as TerrainV4;
    const own = terrain.shafts.spawnShaft();
    expect(own).not.toBeNull();
    if (!own) return;
    const c = shaftChestCell(own);
    const derived = initialState(Block.CHEST, c.x, c.y, c.z, terrain);
    expect(derived).toEqual(lootOf(1337, c.x, c.y, c.z, 'starter'));
    const grid = terrain.shafts.shaftsIn(-400, -400, 400, 400).filter((s) => !s.spawn);
    expect(grid.length).toBeGreaterThan(0);
    for (const s of grid) {
      const g = shaftChestCell(s);
      expect(initialState(Block.CHEST, g.x, g.y, g.z, terrain)).toEqual(
        lootOf(1337, g.x, g.y, g.z, 'rich'),
      );
    }
    // Another cell, or the same cell in generator 3, is an empty chest.
    expect(initialState(Block.CHEST, c.x + 1, c.y, c.z, terrain)).toBe(emptyChest());
    expect(initialState(Block.CHEST, c.x, c.y, c.z, getTerrain(1337, GEN3))).toBe(emptyChest());
    expect(initialState(Block.STONE, c.x, c.y, c.z, terrain)).toBeNull();
  });

  it('Phase 8B3b AC2.1 LOOT_CHECKSUM_1337_V4 is pinned', () => {
    expect(lootChecksum1337()).toBe(LOOT_CHECKSUM_1337_V4);
  });
});
