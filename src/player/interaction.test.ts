import { describe, expect, it } from 'vitest';
import { WORLD_HEIGHT } from '../game/config';
import { BLOCKS, Block } from '../world/blocks';
import { breakResult, canPlace } from './interaction';
import { createPlayer } from './player';

function worldOf(cells: Record<string, number>) {
  return {
    getBlock: (x: number, y: number, z: number) =>
      y < 0 ? Block.BEDROCK : (cells[`${x},${y},${z}`] ?? Block.AIR),
  };
}

describe('breakResult (AC9.2)', () => {
  it('turns ordinary blocks into air', () => {
    for (const def of BLOCKS) {
      if (def.slot === null) continue;
      expect(breakResult(worldOf({ '0,5,0': def.id }), 0, 5, 0)).toBe(Block.AIR);
    }
  });

  it('refuses bedrock, water, air and positions outside the world', () => {
    expect(breakResult(worldOf({ '0,0,0': Block.BEDROCK }), 0, 0, 0)).toBeNull();
    expect(breakResult(worldOf({ '0,5,0': Block.WATER }), 0, 5, 0)).toBeNull();
    expect(breakResult(worldOf({}), 0, 5, 0)).toBeNull();
    expect(breakResult(worldOf({}), 0, -1, 0)).toBeNull();
    expect(breakResult(worldOf({}), 0, WORLD_HEIGHT, 0)).toBeNull();
  });

  it('fills the hole with water next to or below water, but not above it', () => {
    const sides = ['1,5,0', '-1,5,0', '0,5,1', '0,5,-1', '0,6,0'];
    for (const key of sides) {
      const world = worldOf({ '0,5,0': Block.SAND, [key]: Block.WATER });
      expect(breakResult(world, 0, 5, 0)).toBe(Block.WATER);
    }
    const below = worldOf({ '0,5,0': Block.SAND, '0,4,0': Block.WATER });
    expect(breakResult(below, 0, 5, 0)).toBe(Block.AIR);
    const diagonal = worldOf({ '0,5,0': Block.SAND, '1,5,1': Block.WATER });
    expect(breakResult(diagonal, 0, 5, 0)).toBe(Block.AIR);
  });
});

describe('canPlace (AC9.2)', () => {
  const player = createPlayer(0.5, 10, 0.5);

  it('allows air and water cells', () => {
    expect(canPlace(worldOf({}), player, 3, 10, 0)).toBe(true);
    expect(canPlace(worldOf({ '3,10,0': Block.WATER }), player, 3, 10, 0)).toBe(true);
  });

  it('refuses occupied cells', () => {
    for (const id of [Block.STONE, Block.LEAVES, Block.GLASS, Block.BEDROCK]) {
      expect(canPlace(worldOf({ '3,10,0': id }), player, 3, 10, 0)).toBe(false);
    }
  });

  it('refuses cells inside the player box', () => {
    expect(canPlace(worldOf({}), player, 0, 10, 0)).toBe(false);
    expect(canPlace(worldOf({}), player, 0, 11, 0)).toBe(false);
    // Directly below the feet and above the head is fine.
    expect(canPlace(worldOf({}), player, 0, 9, 0)).toBe(true);
    expect(canPlace(worldOf({}), player, 0, 12, 0)).toBe(true);
    expect(canPlace(worldOf({}), player, 1, 10, 0)).toBe(true);
    // Standing on a block edge, the box reaches into the neighbouring cell.
    const edge = createPlayer(0.9, 10, 0.5);
    expect(canPlace(worldOf({}), edge, 1, 10, 0)).toBe(false);
  });

  it('refuses cells outside the height range', () => {
    const high = createPlayer(0.5, 120, 0.5);
    expect(canPlace(worldOf({}), high, 3, WORLD_HEIGHT, 0)).toBe(false);
    expect(canPlace(worldOf({}), high, 3, WORLD_HEIGHT - 1, 0)).toBe(true);
    expect(canPlace(worldOf({}), high, 3, -1, 0)).toBe(false);
  });
});
