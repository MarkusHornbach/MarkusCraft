import { describe, expect, it } from 'vitest';
import { STACK_SIZE } from '../game/config';
import { BLOCKS, Block, isPlaceable } from '../world/blocks';
import {
  BLOCK_ITEMS,
  FIRST_ITEM_ID,
  ITEMS,
  Item,
  getItemDef,
  isItem,
  itemLabel,
  stackSizeOf,
} from './items';

describe('item table (Phase 3 AC6.4)', () => {
  it('pins the ids of all items: they are written into save files', () => {
    expect(Object.fromEntries(ITEMS.map((item) => [item.name, item.id]))).toEqual({
      grass: 1,
      dirt: 2,
      stone: 3,
      sand: 4,
      log: 5,
      leaves: 6,
      planks: 7,
      bricks: 8,
      glass: 9,
      coal_ore: 12,
      iron_ore: 13,
      clay: 14,
      coal: 256,
    });
    expect(Item).toEqual({ COAL: 256 });
  });

  it('makes every placeable block an item with the same id, name and label', () => {
    for (const def of BLOCKS) {
      const item = getItemDef(def.id);
      if (!isPlaceable(def.id)) {
        expect(item, def.name).toBeUndefined();
        continue;
      }
      expect(item).toEqual({
        id: def.id,
        name: def.name,
        label: def.label,
        stackSize: STACK_SIZE,
        block: def.id,
      });
    }
    expect(BLOCK_ITEMS).toEqual(BLOCKS.filter((b) => isPlaceable(b.id)).map((b) => b.id));
    expect(isItem(Block.AIR)).toBe(false);
    expect(isItem(Block.WATER)).toBe(false);
    expect(isItem(Block.BEDROCK)).toBe(false);
  });

  it('keeps items that are not blocks at ids from 256 and has unique ids and names', () => {
    for (const item of ITEMS) {
      expect(item.block === null).toBe(item.id >= FIRST_ITEM_ID);
      expect(item.stackSize).toBe(STACK_SIZE);
      expect(item.label.length).toBeGreaterThan(0);
    }
    expect(new Set(ITEMS.map((i) => i.id)).size).toBe(ITEMS.length);
    expect(new Set(ITEMS.map((i) => i.name)).size).toBe(ITEMS.length);
    expect(getItemDef(Item.COAL)?.label).toBe('Coal');
  });

  it('answers for unknown ids without throwing', () => {
    expect(getItemDef(9999)).toBeUndefined();
    expect(itemLabel(9999)).toBe('Unknown item');
    expect(itemLabel(Block.STONE)).toBe('Stone');
    expect(stackSizeOf(9999)).toBe(STACK_SIZE);
  });
});
