import { describe, expect, it } from 'vitest';
import { CHUNK_VOLUME, WORLD_HEIGHT } from '../game/config';
import { Block } from './blocks';
import { blockIndex, chunkKey, createChunk, toChunkCoord, toLocalCoord } from './chunk';
import { World, chunksAffectedByEdit } from './World';

function emptyWorld(radius = 1): World {
  const world = new World(1);
  for (let cz = -radius; cz <= radius; cz++) {
    for (let cx = -radius; cx <= radius; cx++) world.addChunk(createChunk(cx, cz));
  }
  return world;
}

describe('chunk helpers', () => {
  it('map coordinates correctly, including negatives', () => {
    expect(toChunkCoord(0)).toBe(0);
    expect(toChunkCoord(15)).toBe(0);
    expect(toChunkCoord(16)).toBe(1);
    expect(toChunkCoord(-1)).toBe(-1);
    expect(toChunkCoord(-16)).toBe(-1);
    expect(toChunkCoord(-17)).toBe(-2);
    expect(toLocalCoord(-1)).toBe(15);
    expect(toLocalCoord(-16)).toBe(0);
    expect(toLocalCoord(17)).toBe(1);
    expect(blockIndex(1, 2, 3)).toBe(1 + 3 * 16 + 2 * 256);
    expect(blockIndex(15, 127, 15)).toBe(CHUNK_VOLUME - 1);
    expect(chunkKey(-1, 2)).toBe('-1,2');
    expect(() => createChunk(0, 0, new Uint8Array(3))).toThrow();
  });
});

describe('World block access (AC4.5)', () => {
  it('round-trips blocks at positive and negative coordinates and across borders', () => {
    const world = emptyWorld();
    const cells: [number, number, number][] = [
      [0, 0, 0],
      [5, 60, 7],
      [15, 127, 15],
      [16, 10, 0],
      [-1, 10, -1],
      [-16, 3, 15],
      [-9, 3, 31],
      [31, 100, -16],
    ];
    cells.forEach(([x, y, z], i) => {
      const id = (i % 9) + 1;
      expect(world.setBlock(x, y, z, id)).toBe(true);
      expect(world.getBlock(x, y, z)).toBe(id);
    });
    // Neighbouring cells across the border are untouched.
    expect(world.getBlock(15, 10, 0)).toBe(Block.AIR);
    expect(world.getBlock(0, 10, -1)).toBe(Block.AIR);
    // The data landed in the right chunk at the right index.
    expect(world.getChunk(-1, -1)?.blocks[blockIndex(15, 10, 15)]).toBe(5);
    expect(world.getChunk(1, 0)?.blocks[blockIndex(0, 10, 0)]).toBe(4);
  });

  it('answers out-of-range reads as specified', () => {
    const world = emptyWorld(0);
    expect(world.getBlock(0, WORLD_HEIGHT, 0)).toBe(Block.AIR);
    expect(world.getBlock(0, 1000, 0)).toBe(Block.AIR);
    expect(world.getBlock(0, -1, 0)).toBe(Block.BEDROCK);
    expect(world.setBlock(0, -1, 0, Block.STONE)).toBe(false);
    expect(world.setBlock(0, WORLD_HEIGHT, 0, Block.STONE)).toBe(false);
    // Unloaded chunk: air for rendering, solid for physics.
    expect(world.getBlock(100, 50, 100)).toBe(Block.AIR);
    expect(world.isSolidAt(100, 50, 100)).toBe(true);
    expect(world.isSolidAt(100, WORLD_HEIGHT + 5, 100)).toBe(false);
    expect(world.isSolidAt(0, -3, 0)).toBe(true);
    // Loaded chunk: physics follows the block table.
    expect(world.isSolidAt(0, 50, 0)).toBe(false);
    world.setBlock(0, 50, 0, Block.WATER);
    expect(world.isSolidAt(0, 50, 0)).toBe(false);
    expect(world.isWaterAt(0, 50, 0)).toBe(true);
    world.setBlock(0, 50, 0, Block.LEAVES);
    expect(world.isSolidAt(0, 50, 0)).toBe(true);
  });

  it('re-applies edits when a chunk is generated again', () => {
    const world = new World(1337);
    const chunk = world.generate(2, -3);
    expect(world.generate(2, -3)).toBe(chunk);
    const x = 2 * 16 + 4;
    const z = -3 * 16 + 9;
    world.setBlock(x, 120, z, Block.BRICKS);
    world.removeChunk(2, -3);
    expect(world.hasChunk(2, -3)).toBe(false);
    expect(world.getBlock(x, 120, z)).toBe(Block.AIR);
    world.generate(2, -3);
    expect(world.getBlock(x, 120, z)).toBe(Block.BRICKS);
    // Edits to chunks that are not loaded are recorded and applied later.
    world.setBlock(500, 90, 500, Block.GLASS);
    expect(world.getBlock(500, 90, 500)).toBe(Block.AIR);
    world.generate(toChunkCoord(500), toChunkCoord(500));
    expect(world.getBlock(500, 90, 500)).toBe(Block.GLASS);
    expect(world.chunkCount).toBe(2);
    expect([...world.allChunks()].length).toBe(2);
  });

  it('finds the surface, ignoring leaves', () => {
    const world = emptyWorld(0);
    expect(world.surfaceY(3, 3)).toBe(-1);
    world.setBlock(3, 40, 3, Block.STONE);
    world.setBlock(3, 45, 3, Block.LEAVES);
    expect(world.surfaceY(3, 3)).toBe(40);
    world.setBlock(3, 42, 3, Block.WATER);
    expect(world.surfaceY(3, 3)).toBe(42);
  });
});

describe('chunksAffectedByEdit (AC9.5)', () => {
  const keys = (x: number, z: number) =>
    chunksAffectedByEdit(x, z)
      .map((c) => chunkKey(c.cx, c.cz))
      .sort();
  it('returns only the own chunk for interior blocks', () => {
    expect(keys(5, 5)).toEqual(['0,0']);
  });
  it('adds the neighbour for border blocks', () => {
    expect(keys(0, 5)).toEqual(['-1,0', '0,0']);
    expect(keys(15, 5)).toEqual(['0,0', '1,0']);
    expect(keys(5, 16)).toEqual(['0,0', '0,1']);
    expect(keys(5, 31)).toEqual(['0,1', '0,2']);
  });
  it('adds diagonal neighbours for corner blocks', () => {
    expect(keys(0, 0)).toEqual(['-1,-1', '-1,0', '0,-1', '0,0']);
    expect(keys(-1, -1)).toEqual(['-1,-1', '-1,0', '0,-1', '0,0']);
    expect(keys(15, 16)).toEqual(['0,0', '0,1', '1,0', '1,1']);
  });
});
