// Item table: everything a player can hold. A block is the item with the same id.
import { STACK_SIZE } from '../game/config';
import { BLOCKS, isPlaceable } from '../world/blocks';

/** Items that are not blocks start here; block ids stay below. */
export const FIRST_ITEM_ID = 256;

/**
 * Ids of the items that are not blocks. They are written into save files: the table is
 * append-only, an id is never reused or renumbered (pinned by a unit test).
 */
export const Item = {
  COAL: 256,
  STICK: 257,
  IRON_INGOT: 258,
  WOODEN_PICKAXE: 259,
  WOODEN_AXE: 260,
  WOODEN_SHOVEL: 261,
  STONE_PICKAXE: 262,
  STONE_AXE: 263,
  STONE_SHOVEL: 264,
  IRON_PICKAXE: 265,
  IRON_AXE: 266,
  IRON_SHOVEL: 267,
} as const;

/** What a tool is made for. A block names the class that breaks it faster. */
export type ToolClass = 'pickaxe' | 'axe' | 'shovel';
export const TOOL_CLASSES: readonly ToolClass[] = ['pickaxe', 'axe', 'shovel'];

/** Tool tiers: 1 wood, 2 stone, 3 iron. */
export type ToolTier = 1 | 2 | 3;
export const TOOL_TIERS: readonly ToolTier[] = [1, 2, 3];

export interface ToolDef {
  class: ToolClass;
  tier: ToolTier;
}

export interface ItemDef {
  id: number;
  /** Lower-case key, stable for code and tests. */
  name: string;
  /** Name shown in the user interface. */
  label: string;
  /** How many of this item one slot holds. */
  stackSize: number;
  /** The block this item places, or null for items that cannot be placed. */
  block: number | null;
  /** Class and tier if the item is a tool, otherwise null. */
  tool: ToolDef | null;
}

const TABLE = new Map<number, ItemDef>();
// Every block a player can hold is an item with the block's id, name and label.
for (const def of BLOCKS) {
  if (!isPlaceable(def.id)) continue;
  TABLE.set(def.id, {
    id: def.id,
    name: def.name,
    label: def.label,
    stackSize: STACK_SIZE,
    block: def.id,
    tool: null,
  });
}

function material(id: number, name: string, label: string): void {
  TABLE.set(id, { id, name, label, stackSize: STACK_SIZE, block: null, tool: null });
}

/** Tools do not stack: one per slot. */
function tool(id: number, name: string, label: string, cls: ToolClass, tier: ToolTier): void {
  TABLE.set(id, { id, name, label, stackSize: 1, block: null, tool: { class: cls, tier } });
}

material(Item.COAL, 'coal', 'Coal');
material(Item.STICK, 'stick', 'Stick');
material(Item.IRON_INGOT, 'iron_ingot', 'Iron ingot');
tool(Item.WOODEN_PICKAXE, 'wooden_pickaxe', 'Wooden pickaxe', 'pickaxe', 1);
tool(Item.WOODEN_AXE, 'wooden_axe', 'Wooden axe', 'axe', 1);
tool(Item.WOODEN_SHOVEL, 'wooden_shovel', 'Wooden shovel', 'shovel', 1);
tool(Item.STONE_PICKAXE, 'stone_pickaxe', 'Stone pickaxe', 'pickaxe', 2);
tool(Item.STONE_AXE, 'stone_axe', 'Stone axe', 'axe', 2);
tool(Item.STONE_SHOVEL, 'stone_shovel', 'Stone shovel', 'shovel', 2);
tool(Item.IRON_PICKAXE, 'iron_pickaxe', 'Iron pickaxe', 'pickaxe', 3);
tool(Item.IRON_AXE, 'iron_axe', 'Iron axe', 'axe', 3);
tool(Item.IRON_SHOVEL, 'iron_shovel', 'Iron shovel', 'shovel', 3);

/** All items in id order: the blocks first, then the other items. */
export const ITEMS: readonly ItemDef[] = [...TABLE.values()].sort((a, b) => a.id - b.id);

/** The items that place a block, in id order (the Creative palette). */
export const BLOCK_ITEMS: readonly number[] = ITEMS.filter((item) => item.block !== null).map(
  (item) => item.id,
);

export function getItemDef(id: number): ItemDef | undefined {
  return TABLE.get(id);
}

export function isItem(id: number): boolean {
  return TABLE.has(id);
}

/** The name for the user interface; an id this build does not know reads "Unknown item". */
export function itemLabel(id: number): string {
  return TABLE.get(id)?.label ?? 'Unknown item';
}

export function stackSizeOf(id: number): number {
  return TABLE.get(id)?.stackSize ?? STACK_SIZE;
}

/** Class and tier of a tool; null for everything else, also for an empty hand. */
export function toolOf(id: number | null | undefined): ToolDef | null {
  return id === null || id === undefined ? null : (TABLE.get(id)?.tool ?? null);
}
