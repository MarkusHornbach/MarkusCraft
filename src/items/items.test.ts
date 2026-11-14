import { describe, expect, it } from 'vitest';
import { STACK_SIZE } from '../game/config';
import { BLOCKS, Block, isPlaceable } from '../world/blocks';
import {
  BLOCK_ITEMS,
  FIRST_ITEM_ID,
  ITEMS,
  Item,
  TOOL_CLASSES,
  TOOL_TIERS,
  getItemDef,
  isItem,
  itemLabel,
  stackSizeOf,
  toolOf,
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
      workbench: 15,
      furnace: 16,
      stone_bricks: 17,
      iron_block: 18,
      coal: 256,
      stick: 257,
      iron_ingot: 258,
      wooden_pickaxe: 259,
      wooden_axe: 260,
      wooden_shovel: 261,
      stone_pickaxe: 262,
      stone_axe: 263,
      stone_shovel: 264,
      iron_pickaxe: 265,
      iron_axe: 266,
      iron_shovel: 267,
    });
    expect(Item).toEqual({
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
    });
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
        tool: null,
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
      // Tools do not stack; everything else does, up to 99.
      expect(item.stackSize).toBe(item.tool ? 1 : STACK_SIZE);
      expect(item.label.length).toBeGreaterThan(0);
    }
    expect(new Set(ITEMS.map((i) => i.id)).size).toBe(ITEMS.length);
    expect(new Set(ITEMS.map((i) => i.name)).size).toBe(ITEMS.length);
    expect(getItemDef(Item.COAL)?.label).toBe('Coal');
  });

  it('has pickaxe, axe and shovel in wood, stone and iron (plan 5.6)', () => {
    const tools = ITEMS.filter((item) => item.tool !== null);
    expect(tools.map((item) => [item.name, item.tool?.class, item.tool?.tier])).toEqual([
      ['wooden_pickaxe', 'pickaxe', 1],
      ['wooden_axe', 'axe', 1],
      ['wooden_shovel', 'shovel', 1],
      ['stone_pickaxe', 'pickaxe', 2],
      ['stone_axe', 'axe', 2],
      ['stone_shovel', 'shovel', 2],
      ['iron_pickaxe', 'pickaxe', 3],
      ['iron_axe', 'axe', 3],
      ['iron_shovel', 'shovel', 3],
    ]);
    expect(TOOL_CLASSES).toEqual(['pickaxe', 'axe', 'shovel']);
    expect(TOOL_TIERS).toEqual([1, 2, 3]);
    for (const item of tools) {
      expect(item.block).toBeNull();
      expect(stackSizeOf(item.id)).toBe(1);
      expect(toolOf(item.id)).toEqual(item.tool);
    }
    expect(getItemDef(Item.IRON_PICKAXE)?.label).toBe('Iron pickaxe');
    expect(getItemDef(Item.STICK)?.label).toBe('Stick');
    expect(getItemDef(Item.IRON_INGOT)?.label).toBe('Iron ingot');
    expect(toolOf(Item.COAL)).toBeNull();
    expect(toolOf(Block.STONE)).toBeNull();
    expect(toolOf(null)).toBeNull();
    expect(toolOf(undefined)).toBeNull();
    expect(toolOf(9999)).toBeNull();
  });

  it('answers for unknown ids without throwing', () => {
    expect(getItemDef(9999)).toBeUndefined();
    expect(itemLabel(9999)).toBe('Unknown item');
    expect(itemLabel(Block.STONE)).toBe('Stone');
    expect(stackSizeOf(9999)).toBe(STACK_SIZE);
  });
});
