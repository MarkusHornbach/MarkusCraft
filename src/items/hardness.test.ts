import { describe, expect, it } from 'vitest';
import { BLOCKS, Block } from '../world/blocks';
import { breakTimeMs, dropOf, missingTool, toolClassOf, toolSpeed } from './hardness';
import { ITEMS, Item, isItem } from './items';

describe('break times (Phase 3 AC7.1)', () => {
  it('equal the table of the plan, by hand', () => {
    const seconds: Record<string, number> = {
      leaves: 0.25,
      glass: 0.4,
      sand: 0.6,
      dirt: 0.6,
      grass: 0.7,
      clay: 0.8,
      planks: 1.5,
      log: 2.0,
      stone: 3.0,
      bricks: 3.0,
      coal_ore: 3.5,
      iron_ore: 4.5,
      workbench: 1.5,
      furnace: 3.0,
      stone_bricks: 3.0,
      iron_block: 5.0,
    };
    const table = Object.fromEntries(
      BLOCKS.filter((def) => def.breakable).map((def) => [def.name, breakTimeMs(def.id)]),
    );
    expect(table).toEqual(
      Object.fromEntries(Object.entries(seconds).map(([name, s]) => [name, s * 1000])),
    );
  });

  it('every breakable block has a time; the others have none', () => {
    for (const def of BLOCKS) {
      const time = breakTimeMs(def.id);
      if (def.breakable) {
        expect(time, def.name).not.toBeNull();
        expect(time ?? 0).toBeGreaterThan(0);
      } else {
        expect(time, def.name).toBeNull();
      }
    }
    expect(breakTimeMs(200)).toBeNull();
  });
});

describe('drop table (Phase 3 AC7.3)', () => {
  it('every block drops itself, coal ore drops one coal (with the best pickaxe in the hand)', () => {
    for (const def of BLOCKS) {
      const drop = dropOf(def.id, Item.IRON_PICKAXE);
      if (!def.breakable) {
        expect(drop, def.name).toBeNull();
        continue;
      }
      expect(drop?.count).toBe(1);
      expect(isItem(drop?.item ?? -1), def.name).toBe(true);
      if (def.id === Block.COAL_ORE) expect(drop?.item).toBe(Item.COAL);
      else expect(drop?.item).toBe(def.id);
    }
    expect(dropOf(Block.AIR)).toBeNull();
    expect(dropOf(Block.WATER)).toBeNull();
    expect(dropOf(Block.BEDROCK)).toBeNull();
  });

  it('hands out a fresh stack each time', () => {
    const drop = (): unknown => dropOf(Block.COAL_ORE, Item.WOODEN_PICKAXE);
    expect(drop()).toEqual({ item: Item.COAL, count: 1 });
    expect(drop()).not.toBe(drop());
  });
});

describe('tools (Phase 3 AC11.1)', () => {
  const CLASSES: Record<string, string | null> = {
    leaves: null,
    glass: null,
    sand: 'shovel',
    dirt: 'shovel',
    grass: 'shovel',
    clay: 'shovel',
    planks: 'axe',
    workbench: 'axe',
    log: 'axe',
    stone: 'pickaxe',
    bricks: 'pickaxe',
    stone_bricks: 'pickaxe',
    furnace: 'pickaxe',
    coal_ore: 'pickaxe',
    iron_ore: 'pickaxe',
    iron_block: 'pickaxe',
  };

  it('every breakable block has the tool class of the plan', () => {
    const table = Object.fromEntries(
      BLOCKS.filter((def) => def.breakable).map((def) => [def.name, toolClassOf(def.id)]),
    );
    expect(table).toEqual(CLASSES);
    expect(toolClassOf(Block.BEDROCK)).toBeNull();
    expect(toolClassOf(200)).toBeNull();
  });

  it('for every block and every item the time is the hand time divided by 1, 2, 4 or 8', () => {
    let checked = 0;
    for (const def of BLOCKS) {
      const hand = breakTimeMs(def.id);
      for (const item of [null, ...ITEMS.map((i) => i.id), 9999]) {
        const time = breakTimeMs(def.id, item);
        if (!def.breakable) {
          expect(time).toBeNull();
          continue;
        }
        const tool = ITEMS.find((i) => i.id === item)?.tool ?? null;
        const fits = tool !== null && tool.class === CLASSES[def.name];
        const factor = fits && tool ? [2, 4, 8][tool.tier - 1] : 1;
        expect(toolSpeed(def.id, item)).toBe(factor);
        expect(time, `${def.name} with ${item}`).toBe((hand ?? 0) / factor);
        checked++;
      }
    }
    // 16 breakable blocks × (hand + 28 items + an unknown id).
    expect(checked).toBe(16 * 30);
    expect(breakTimeMs(Block.STONE, Item.STONE_PICKAXE)).toBe(750);
    expect(breakTimeMs(Block.IRON_BLOCK, Item.IRON_PICKAXE)).toBe(625);
    expect(breakTimeMs(Block.LOG, Item.WOODEN_AXE)).toBe(1000);
    expect(breakTimeMs(Block.DIRT, Item.IRON_SHOVEL)).toBe(75);
    expect(breakTimeMs(Block.LEAVES, Item.IRON_AXE)).toBe(250);
  });
});

describe('gating (Phase 3 AC11.2)', () => {
  const PICKAXES = [Item.WOODEN_PICKAXE, Item.STONE_PICKAXE, Item.IRON_PICKAXE];
  const OTHERS = ITEMS.map((i) => i.id).filter((id) => !PICKAXES.includes(id as 259));

  it('stone and coal ore drop nothing by hand and their item with any pickaxe', () => {
    for (const held of [null, ...OTHERS]) {
      expect(dropOf(Block.STONE, held), String(held)).toBeNull();
      expect(dropOf(Block.COAL_ORE, held), String(held)).toBeNull();
      expect(missingTool(Block.STONE, held)).toEqual({ class: 'pickaxe', tier: 1 });
    }
    for (const pick of PICKAXES) {
      expect(dropOf(Block.STONE, pick)).toEqual({ item: Block.STONE, count: 1 });
      expect(dropOf(Block.COAL_ORE, pick)).toEqual({ item: Item.COAL, count: 1 });
      expect(missingTool(Block.STONE, pick)).toBeNull();
      expect(missingTool(Block.COAL_ORE, pick)).toBeNull();
    }
  });

  it('iron ore drops nothing with a wooden pickaxe and its block with a stone or iron one', () => {
    for (const held of [null, Item.WOODEN_PICKAXE, ...OTHERS]) {
      expect(dropOf(Block.IRON_ORE, held), String(held)).toBeNull();
      expect(missingTool(Block.IRON_ORE, held)).toEqual({ class: 'pickaxe', tier: 2 });
    }
    for (const pick of [Item.STONE_PICKAXE, Item.IRON_PICKAXE]) {
      expect(dropOf(Block.IRON_ORE, pick)).toEqual({ item: Block.IRON_ORE, count: 1 });
      expect(missingTool(Block.IRON_ORE, pick)).toBeNull();
    }
  });

  it('everything else can be gathered by hand', () => {
    const gated: number[] = [Block.STONE, Block.COAL_ORE, Block.IRON_ORE];
    for (const def of BLOCKS) {
      if (!def.breakable || gated.includes(def.id)) continue;
      expect(missingTool(def.id, null), def.name).toBeNull();
      expect(dropOf(def.id), def.name).toEqual({ item: def.id, count: 1 });
    }
    expect(missingTool(Block.BEDROCK, null)).toBeNull();
    expect(missingTool(Block.AIR, null)).toBeNull();
  });
});
