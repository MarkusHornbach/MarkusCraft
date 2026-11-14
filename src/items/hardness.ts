// Hardness: how long a block takes to break, with which tool, and which item it yields.
import type { ItemStack } from '../actions/playerRecord';
import { Block, getBlockDef } from '../world/blocks';
import { Item, type ToolClass, type ToolDef, toolOf } from './items';

/**
 * Seconds to break a block by hand (plan 5.5). Every breakable block has an entry; a unit
 * test fails if one is missing. Tools divide these times.
 */
const BREAK_SECONDS: ReadonlyMap<number, number> = new Map([
  [Block.LEAVES, 0.25],
  [Block.GLASS, 0.4],
  [Block.SAND, 0.6],
  [Block.DIRT, 0.6],
  [Block.GRASS, 0.7],
  [Block.CLAY, 0.8],
  [Block.PLANKS, 1.5],
  [Block.WORKBENCH, 1.5],
  [Block.LOG, 2.0],
  [Block.STONE, 3.0],
  [Block.BRICKS, 3.0],
  [Block.STONE_BRICKS, 3.0],
  [Block.FURNACE, 3.0],
  [Block.COAL_ORE, 3.5],
  [Block.IRON_ORE, 4.5],
  [Block.IRON_BLOCK, 5.0],
]);

/** The tool class that breaks a block faster (plan 5.5); leaves and glass have none. */
const TOOL_CLASS: ReadonlyMap<number, ToolClass> = new Map<number, ToolClass>([
  [Block.SAND, 'shovel'],
  [Block.DIRT, 'shovel'],
  [Block.GRASS, 'shovel'],
  [Block.CLAY, 'shovel'],
  [Block.PLANKS, 'axe'],
  [Block.WORKBENCH, 'axe'],
  [Block.LOG, 'axe'],
  [Block.STONE, 'pickaxe'],
  [Block.BRICKS, 'pickaxe'],
  [Block.STONE_BRICKS, 'pickaxe'],
  [Block.FURNACE, 'pickaxe'],
  [Block.COAL_ORE, 'pickaxe'],
  [Block.IRON_ORE, 'pickaxe'],
  [Block.IRON_BLOCK, 'pickaxe'],
]);

/** The tool class a block is broken faster with, or null. */
export function toolClassOf(block: number): ToolClass | null {
  return TOOL_CLASS.get(block) ?? null;
}

/**
 * How much faster the held item breaks a block: 2, 4 or 8 for a wooden, stone or iron
 * tool of the block's class, 1 for everything else (the hand, other items, other tools).
 */
export function toolSpeed(block: number, held: number | null): number {
  const tool = toolOf(held);
  if (!tool || tool.class !== TOOL_CLASS.get(block)) return 1;
  return 2 ** tool.tier;
}

/**
 * Milliseconds a block takes to break with the held item (null: the empty hand), or null
 * if it cannot be broken.
 */
export function breakTimeMs(block: number, held: number | null = null): number | null {
  if (!getBlockDef(block).breakable) return null;
  const seconds = BREAK_SECONDS.get(block);
  return seconds === undefined ? null : (seconds * 1000) / toolSpeed(block, held);
}

/**
 * Gating: blocks that yield their item only when broken with a tool of this class and at
 * least this tier. Without it they still break, at hand speed, and yield nothing.
 */
const NEEDED_TOOL: ReadonlyMap<number, ToolDef> = new Map<number, ToolDef>([
  [Block.STONE, { class: 'pickaxe', tier: 1 }],
  [Block.COAL_ORE, { class: 'pickaxe', tier: 1 }],
  [Block.IRON_ORE, { class: 'pickaxe', tier: 2 }],
]);

/**
 * The tool a block needs to yield its item, if the held item is not good enough; null if
 * the block needs none or the held item does. The HUD turns this into "Needs a pickaxe".
 */
export function missingTool(block: number, held: number | null): ToolDef | null {
  const needed = NEEDED_TOOL.get(block);
  if (!needed) return null;
  const tool = toolOf(held);
  if (tool && tool.class === needed.class && tool.tier >= needed.tier) return null;
  return needed;
}

/** Blocks that yield something else than themselves. */
const DROPS: ReadonlyMap<number, ItemStack> = new Map([
  [Block.COAL_ORE, { item: Item.COAL, count: 1 }],
]);

/**
 * What a broken block puts into the inventory when broken with the held item (null: the
 * empty hand): itself, except where the drop table says otherwise. Null if it yields
 * nothing: the block cannot be broken, or it needs a tool that is not in the hand.
 */
export function dropOf(block: number, held: number | null = null): ItemStack | null {
  if (!getBlockDef(block).breakable) return null;
  if (missingTool(block, held)) return null;
  const drop = DROPS.get(block);
  return drop ? { ...drop } : { item: block, count: 1 };
}
