// Hardness: how long a block takes to break by hand, and which item it yields.
import type { ItemStack } from '../actions/playerRecord';
import { Block, getBlockDef } from '../world/blocks';
import { Item } from './items';

/**
 * Seconds to break a block by hand (plan 5.5). Every breakable block has an entry; a unit
 * test fails if one is missing. Part C adds tools that divide these times.
 */
const BREAK_SECONDS: ReadonlyMap<number, number> = new Map([
  [Block.LEAVES, 0.25],
  [Block.GLASS, 0.4],
  [Block.SAND, 0.6],
  [Block.DIRT, 0.6],
  [Block.GRASS, 0.7],
  [Block.CLAY, 0.8],
  [Block.PLANKS, 1.5],
  [Block.LOG, 2.0],
  [Block.STONE, 3.0],
  [Block.BRICKS, 3.0],
  [Block.COAL_ORE, 3.5],
  [Block.IRON_ORE, 4.5],
]);

/** Milliseconds a block takes to break by hand, or null if it cannot be broken. */
export function breakTimeMs(block: number): number | null {
  if (!getBlockDef(block).breakable) return null;
  const seconds = BREAK_SECONDS.get(block);
  return seconds === undefined ? null : seconds * 1000;
}

/** Blocks that yield something else than themselves. */
const DROPS: ReadonlyMap<number, ItemStack> = new Map([
  [Block.COAL_ORE, { item: Item.COAL, count: 1 }],
]);

/**
 * What a broken block puts into the inventory: itself, except where the drop table says
 * otherwise. Null for blocks that cannot be broken.
 */
export function dropOf(block: number): ItemStack | null {
  if (!getBlockDef(block).breakable) return null;
  const drop = DROPS.get(block);
  return drop ? { ...drop } : { item: block, count: 1 };
}
