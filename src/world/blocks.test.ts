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
    expect(BLOCKS.length).toBe(12);
    BLOCKS.forEach((def, index) => {
      expect(def.id).toBe(index);
      expect(def.name).toMatch(/^[a-z]+$/);
      expect(def.label.length).toBeGreaterThan(0);
      expect(typeof def.solid).toBe('boolean');
      expect(['none', 'opaque', 'cutout', 'translucent']).toContain(def.render);
      expect(typeof def.breakable).toBe('boolean');
      expect(typeof def.replaceable).toBe('boolean');
      expect(typeof def.castsAo).toBe('boolean');
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

  it('treats unknown ids like air', () => {
    expect(getBlockDef(200).name).toBe('air');
    expect(isSolid(200)).toBe(false);
  });
});
