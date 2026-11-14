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
} as const;

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
  });
}
TABLE.set(Item.COAL, {
  id: Item.COAL,
  name: 'coal',
  label: 'Coal',
  stackSize: STACK_SIZE,
  block: null,
});

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
