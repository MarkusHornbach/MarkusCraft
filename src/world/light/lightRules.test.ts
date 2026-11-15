import { describe, expect, it } from 'vitest';
import { BLOCKS, BLOCK_EMISSION, BLOCK_OPACITY, Block } from '../blocks';
import { BLOCK_LIGHT, blockOf, chunksSeeingCell, packLight, skyOf, stepLight } from './lightRules';

describe('light rules', () => {
  it('Phase 4 AC1.1: opacity and emission of every block are pinned', () => {
    const table = Object.fromEntries(BLOCKS.map((b) => [b.name, [b.opacity, b.emission]]));
    expect(table).toEqual({
      air: [0, 0],
      grass: [15, 0],
      dirt: [15, 0],
      stone: [15, 0],
      sand: [15, 0],
      log: [15, 0],
      leaves: [1, 0],
      planks: [15, 0],
      bricks: [15, 0],
      glass: [0, 0],
      water: [1, 0],
      bedrock: [15, 0],
      coal_ore: [15, 0],
      iron_ore: [15, 0],
      clay: [15, 0],
      workbench: [15, 0],
      furnace: [15, 0],
      stone_bricks: [15, 0],
      iron_block: [15, 0],
      torch: [0, 14],
    });
  });

  it('Phase 4 AC1.1: the lookup arrays follow the table and treat unknown ids like air', () => {
    for (const def of BLOCKS) {
      expect(BLOCK_OPACITY[def.id]).toBe(def.opacity);
      expect(BLOCK_EMISSION[def.id]).toBe(def.emission);
    }
    for (let id = BLOCKS.length; id < 256; id++) {
      expect(BLOCK_OPACITY[id]).toBe(BLOCK_OPACITY[Block.AIR]);
      expect(BLOCK_EMISSION[id]).toBe(0);
    }
    expect(BLOCK_LIGHT.opacity).toBe(BLOCK_OPACITY);
    expect(BLOCK_LIGHT.emission).toBe(BLOCK_EMISSION);
  });

  it('packs two levels into one byte', () => {
    for (let sky = 0; sky <= 15; sky++) {
      for (let block = 0; block <= 15; block++) {
        const packed = packLight(sky, block);
        expect(packed).toBeLessThan(256);
        expect(skyOf(packed)).toBe(sky);
        expect(blockOf(packed)).toBe(block);
      }
    }
  });

  it('a step costs one level plus the opacity of the cell entered, never below 0', () => {
    expect(stepLight(15, 0, false)).toBe(14);
    expect(stepLight(15, 1, false)).toBe(13);
    expect(stepLight(15, 15, false)).toBe(0);
    expect(stepLight(1, 0, false)).toBe(0);
    expect(stepLight(0, 0, false)).toBe(0);
    expect(stepLight(3, 1, false)).toBe(1);
    expect(stepLight(2, 1, false)).toBe(0);
  });

  it('Phase 4 AC1.2: only full sky light going straight down into a clear cell stays full', () => {
    expect(stepLight(15, 0, true)).toBe(15);
    expect(stepLight(14, 0, true)).toBe(13);
    expect(stepLight(15, 1, true)).toBe(13);
    expect(stepLight(15, 15, true)).toBe(0);
  });

  it('names the chunks whose mesh reads a cell', () => {
    const bits = (...list: [number, number][]) =>
      list.reduce((mask, [gx, gz]) => mask | (1 << (gx + 3 * gz)), 0);
    expect(chunksSeeingCell(1, 1, 5, 5)).toBe(bits([1, 1]));
    expect(chunksSeeingCell(1, 1, 0, 5)).toBe(bits([1, 1], [0, 1]));
    expect(chunksSeeingCell(1, 1, 15, 5)).toBe(bits([1, 1], [2, 1]));
    expect(chunksSeeingCell(1, 1, 5, 0)).toBe(bits([1, 1], [1, 0]));
    expect(chunksSeeingCell(1, 1, 15, 15)).toBe(bits([1, 1], [2, 1], [1, 2], [2, 2]));
    expect(chunksSeeingCell(0, 0, 0, 0)).toBe(bits([0, 0]));
    expect(chunksSeeingCell(2, 2, 15, 15)).toBe(bits([2, 2]));
    expect(chunksSeeingCell(0, 1, 15, 0)).toBe(bits([0, 1], [1, 1], [0, 0], [1, 0]));
  });
});
