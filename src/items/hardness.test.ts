import { describe, expect, it } from 'vitest';
import { BLOCKS, Block } from '../world/blocks';
import { breakTimeMs, dropOf } from './hardness';
import { Item, isItem } from './items';

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
  it('every block drops itself, coal ore drops one coal', () => {
    for (const def of BLOCKS) {
      const drop = dropOf(def.id);
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
    expect(dropOf(Block.COAL_ORE)).not.toBe(dropOf(Block.COAL_ORE));
  });
});
