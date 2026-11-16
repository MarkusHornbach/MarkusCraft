import { describe, expect, it } from 'vitest';
import { block, expectCorrect, flatGroup, sky, worldOf } from '../../testing/lightEdits';
import { Block } from '../blocks';

describe('the torch in the light (Phase 4 AC6.8)', () => {
  it('lights its own cell with 14 and one level less per step; breaking it leaves no light', () => {
    const world = worldOf(flatGroup());
    expect(world.setBlock(40, 11, 40, Block.TORCH)).toBe(true);
    expect(block(world, 40, 11, 40)).toBe(14);
    expect(block(world, 41, 11, 40)).toBe(13);
    expect(block(world, 40, 12, 40)).toBe(13);
    expect(block(world, 40, 11, 47)).toBe(7);
    expect(block(world, 40, 11, 53)).toBe(1);
    expect(block(world, 40, 11, 54)).toBe(0);
    // Diagonal steps add up: 3 to the side and 3 up is six steps.
    expect(block(world, 43, 14, 40)).toBe(8);
    // Into the stone floor nothing goes; the sky light stays as it was.
    expect(block(world, 40, 10, 40)).toBe(0);
    expect(sky(world, 40, 11, 40)).toBe(15);
    expectCorrect(world);

    expect(world.setBlock(40, 11, 40, Block.AIR)).toBe(true);
    for (const [x, y, z] of [
      [40, 11, 40],
      [41, 11, 40],
      [40, 11, 47],
      [43, 14, 40],
    ]) {
      expect(block(world, x, y, z)).toBe(0);
    }
    expectCorrect(world);
  });

  it('shines through glass and under water, and its light joins with a second torch', () => {
    const world = worldOf(flatGroup());
    world.setBlock(40, 11, 40, Block.TORCH);
    world.setBlock(44, 11, 40, Block.TORCH);
    // Between them each cell takes the larger of the two.
    expect(block(world, 42, 11, 40)).toBe(12);
    world.setBlock(40, 11, 41, Block.GLASS);
    expect(block(world, 40, 11, 41)).toBe(13);
    world.setBlock(40, 11, 39, Block.WATER);
    expect(block(world, 40, 11, 39)).toBe(12);
    expectCorrect(world);
  });
});
