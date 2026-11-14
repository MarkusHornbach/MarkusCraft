import { describe, expect, it } from 'vitest';
import {
  BLOCKS,
  BLOCK_RENDER,
  BLOCK_SOLID,
  Block,
  HOTBAR_BLOCKS,
  RENDER_CUTOUT,
  RENDER_OPAQUE,
  RENDER_TRANSLUCENT,
  TILE_COUNT,
  TILE_NAMES,
  getBlockDef,
  isSolid,
} from './blocks';

describe('block registry (AC3.3)', () => {
  it('has complete properties for every id, in id order', () => {
    expect(BLOCKS.length).toBe(19);
    BLOCKS.forEach((def, index) => {
      expect(def.id).toBe(index);
      expect(def.name).toMatch(/^[a-z_]+$/);
      expect(def.label.length).toBeGreaterThan(0);
      expect(typeof def.solid).toBe('boolean');
      expect(['none', 'opaque', 'cutout', 'translucent']).toContain(def.render);
      expect(typeof def.breakable).toBe('boolean');
      expect(typeof def.replaceable).toBe('boolean');
      expect(typeof def.castsAo).toBe('boolean');
      expect(typeof def.mergesFaces).toBe('boolean');
    });
    expect(new Set(BLOCKS.map((b) => b.name)).size).toBe(BLOCKS.length);
  });

  it('references only existing tiles, and every drawn block has tiles', () => {
    expect(TILE_NAMES.length).toBe(TILE_COUNT);
    const used = new Set<number>();
    for (const def of BLOCKS) {
      if (def.render === 'none') {
        expect(def.tiles).toBeNull();
        continue;
      }
      expect(def.tiles).not.toBeNull();
      for (const tile of Object.values(def.tiles ?? {})) {
        expect(tile).toBeGreaterThanOrEqual(0);
        expect(tile).toBeLessThan(TILE_COUNT);
        used.add(tile);
      }
    }
    // No orphan tiles either.
    expect(used.size).toBe(TILE_COUNT);
  });

  it('matches the specification table', () => {
    expect(BLOCKS.map((b) => b.name)).toEqual([
      'air',
      'grass',
      'dirt',
      'stone',
      'sand',
      'log',
      'leaves',
      'planks',
      'bricks',
      'glass',
      'water',
      'bedrock',
      'coal_ore',
      'iron_ore',
      'clay',
      'workbench',
      'furnace',
      'stone_bricks',
      'iron_block',
    ]);
    expect(HOTBAR_BLOCKS).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(isSolid(Block.AIR)).toBe(false);
    expect(isSolid(Block.WATER)).toBe(false);
    expect(isSolid(Block.LEAVES)).toBe(true);
    expect(BLOCK_SOLID[Block.BEDROCK]).toBe(1);
    expect(BLOCK_RENDER[Block.STONE]).toBe(RENDER_OPAQUE);
    expect(BLOCK_RENDER[Block.LEAVES]).toBe(RENDER_CUTOUT);
    expect(BLOCK_RENDER[Block.GLASS]).toBe(RENDER_CUTOUT);
    expect(BLOCK_RENDER[Block.WATER]).toBe(RENDER_TRANSLUCENT);
    expect(getBlockDef(Block.BEDROCK).breakable).toBe(false);
    expect(getBlockDef(Block.WATER).breakable).toBe(false);
    expect(getBlockDef(Block.WATER).replaceable).toBe(true);
    expect(getBlockDef(Block.GRASS).tiles).toEqual({ top: 0, side: 1, bottom: 2 });
  });

  it('pins every block id: the table is append-only (Phase 3 AC1.9)', () => {
    // Ids are written into save files. Never change a line here; only append.
    expect(Block).toEqual({
      AIR: 0,
      GRASS: 1,
      DIRT: 2,
      STONE: 3,
      SAND: 4,
      LOG: 5,
      LEAVES: 6,
      PLANKS: 7,
      BRICKS: 8,
      GLASS: 9,
      WATER: 10,
      BEDROCK: 11,
      COAL_ORE: 12,
      IRON_ORE: 13,
      CLAY: 14,
      WORKBENCH: 15,
      FURNACE: 16,
      STONE_BRICKS: 17,
      IRON_BLOCK: 18,
    });
    expect(BLOCKS.map((b) => [b.id, b.name])).toEqual(
      Object.entries(Block).map(([key, id]) => [id, key.toLowerCase()]),
    );
  });

  it('adds the terrain blocks of Phase 3 as breakable but not placeable', () => {
    for (const id of [Block.COAL_ORE, Block.IRON_ORE, Block.CLAY]) {
      const def = getBlockDef(id);
      expect(def.solid).toBe(true);
      expect(def.breakable).toBe(true);
      expect(def.slot).toBeNull();
      expect(BLOCK_RENDER[id]).toBe(RENDER_OPAQUE);
    }
  });

  it('adds the crafted blocks of Phase 3 part C', () => {
    for (const id of [Block.WORKBENCH, Block.FURNACE, Block.STONE_BRICKS, Block.IRON_BLOCK]) {
      const def = getBlockDef(id);
      expect(def.solid).toBe(true);
      expect(def.breakable).toBe(true);
      expect(def.slot).toBeNull();
      expect(BLOCK_RENDER[id]).toBe(RENDER_OPAQUE);
    }
    // Workbench and furnace have a top of their own.
    expect(getBlockDef(Block.WORKBENCH).tiles).toEqual({ top: 16, side: 17, bottom: 8 });
    expect(getBlockDef(Block.FURNACE).tiles).toEqual({ top: 19, side: 18, bottom: 19 });
  });

  it('treats unknown ids like air', () => {
    expect(getBlockDef(200).name).toBe('air');
    expect(isSolid(200)).toBe(false);
  });
});
