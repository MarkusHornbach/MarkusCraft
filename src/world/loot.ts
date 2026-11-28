// Loot of generator 4's shaft chests (Phase 8 part B3b): plain tables and their seeded draw.
//
// The contents of an untouched loot chest are derived again each time they are read, so the
// tables and the draw belong to generator 4 like its blocks: frozen once merged and pinned
// by `LOOT_CHECKSUM_1337_V4`. A change to either is a new generator version.
import { CHEST_SLOTS } from '../game/config';
import { Item } from '../items/items';
import { hash2, hash32, mulberry32 } from '../util/rng';
import { Block } from './blocks';
import type { ChestState, StateStack } from './blockState';

/** One entry of a table: an item, its count range (inclusive) and its weight. */
export interface LootEntry {
  readonly item: number;
  readonly min: number;
  readonly max: number;
  readonly weight: number;
}

/** A table: how many stacks (inclusive range), drawn without repeats by weight. */
export interface LootTable {
  readonly minStacks: number;
  readonly maxStacks: number;
  readonly entries: readonly LootEntry[];
}

export type LootTableName = 'starter' | 'rich';

/**
 * Starter: the spawn shaft's chest, reachable in minute one. Rich: every other shaft. Never
 * tools, logs, stone, ores or any other natural block (`loot.test.ts`).
 */
export const LOOT_TABLES: Readonly<Record<LootTableName, LootTable>> = {
  starter: {
    minStacks: 3,
    maxStacks: 4,
    entries: [
      { item: Block.TORCH, min: 4, max: 8, weight: 1 },
      { item: Item.COAL, min: 2, max: 6, weight: 1 },
      // At most 3: the wooden and the stone pickaxe need 4, so a first craft of sticks
      // (5 XP) stays unavoidable; without it chapters 1–2 end below level 3 (the furnace).
      { item: Item.STICK, min: 1, max: 3, weight: 1 },
      { item: Block.PLANKS, min: 8, max: 16, weight: 1 },
    ],
  },
  rich: {
    minStacks: 4,
    maxStacks: 6,
    entries: [
      { item: Block.TORCH, min: 8, max: 16, weight: 3 },
      { item: Item.COAL, min: 6, max: 12, weight: 3 },
      { item: Item.IRON_INGOT, min: 2, max: 5, weight: 2 },
      { item: Block.GLASS, min: 4, max: 12, weight: 2 },
      { item: Block.STONE_BRICKS, min: 8, max: 16, weight: 2 },
      { item: Block.BRICKS, min: 4, max: 12, weight: 1 },
      { item: Block.IRON_BLOCK, min: 1, max: 1, weight: 0.5 },
    ],
  },
};

const SALT_LOOT = 0x10a7;

/**
 * The contents of the loot chest in cell (x, y, z) of a world with `seed`: a pure function
 * of its arguments. Each stack goes into a hashed free slot of the chest.
 */
export function lootOf(
  seed: number,
  x: number,
  y: number,
  z: number,
  table: LootTableName,
  tables: Readonly<Record<LootTableName, LootTable>> = LOOT_TABLES,
): ChestState {
  const t = tables[table];
  const rng = mulberry32(hash32(hash2((seed >>> 0) ^ SALT_LOOT, x, z) ^ Math.imul(y, 0x9e3779b1)));
  const stacks = t.minStacks + Math.floor(rng() * (t.maxStacks - t.minStacks + 1));
  const slots: (StateStack | null)[] = new Array<StateStack | null>(CHEST_SLOTS).fill(null);
  let taken = 0; // bit per entry already drawn
  let left = 0;
  for (const e of t.entries) left += e.weight;
  for (let n = 0; n < stacks && n < t.entries.length; n++) {
    let pick = rng() * left;
    let index = -1;
    for (let i = 0; i < t.entries.length; i++) {
      if (taken & (1 << i)) continue;
      index = i;
      pick -= t.entries[i].weight;
      if (pick < 0) break;
    }
    const e = t.entries[index];
    taken |= 1 << index;
    left -= e.weight;
    const count = e.min + Math.floor(rng() * (e.max - e.min + 1));
    let slot = Math.floor(rng() * CHEST_SLOTS);
    while (slots[slot] !== null) slot = (slot + 1) % CHEST_SLOTS;
    slots[slot] = { item: e.item, count };
  }
  return { kind: 'chest', slots };
}
