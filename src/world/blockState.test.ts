import { describe, expect, it } from 'vitest';
import { CHEST_SLOTS } from '../game/config';
import { Block } from './blocks';
import {
  type ChestState,
  STATE_KINDS,
  emptyChest,
  initialState,
  isEmptyState,
  stateKindOf,
  summarizeStates,
} from './blockState';
import { blockIndex, chunkKey } from './chunk';
import { World } from './World';

function chestWith(item: number, count: number, slot = 0): ChestState {
  const slots = emptyChest().slots.slice();
  slots[slot] = { item, count };
  return { kind: 'chest', slots };
}

/** A world of seed 1337 with the chunks around the origin generated and lit. */
function litWorld(): World {
  const world = new World(1337);
  for (let cz = -2; cz <= 2; cz++) for (let cx = -2; cx <= 2; cx++) world.generate(cx, cz);
  for (let cz = -1; cz <= 1; cz++) for (let cx = -1; cx <= 1; cx++) world.light(cx, cz);
  return world;
}

const X = 3;
const Z = 5;
const Y = 100;

describe('block state (Phase 8B3a 6.2)', () => {
  it('maps only the chest to a state kind', () => {
    expect(STATE_KINDS).toEqual(['chest']);
    expect(stateKindOf(Block.CHEST)).toBe('chest');
    for (const id of [Block.AIR, Block.STONE, Block.WORKBENCH, Block.FURNACE, Block.TORCH]) {
      expect(stateKindOf(id)).toBeNull();
    }
  });

  it('gives an empty chest of 27 slots as the initial state of a chest only', () => {
    const chest = initialState(Block.CHEST, 1, 2, 3, null);
    expect(chest).toEqual({ kind: 'chest', slots: new Array(CHEST_SLOTS).fill(null) });
    expect(chest && isEmptyState(chest)).toBe(true);
    expect(initialState(Block.STONE, 1, 2, 3, null)).toBeNull();
    expect(isEmptyState(chestWith(Block.STONE, 1, 26))).toBe(false);
  });

  it('Phase 8B3a AC1.1: a chest without a stored state reads as empty', () => {
    const world = litWorld();
    world.setBlock(X, Y, Z, Block.CHEST);
    expect(world.storedState(X, Y, Z)).toBeNull();
    expect(world.getState(X, Y, Z)).toEqual(emptyChest());
    expect(world.getState(X, Y + 1, Z)).toBeNull();
    expect(world.verifyLight()).toBe(0);
  });

  it('Phase 8B3a AC1.1: setBlock of a chest cell to another block removes its state', () => {
    const world = litWorld();
    world.setBlock(X, Y, Z, Block.CHEST);
    expect(world.setState(X, Y, Z, chestWith(Block.STONE, 5))).toBe(true);
    expect(world.getState(X, Y, Z)).toEqual(chestWith(Block.STONE, 5));
    world.setBlock(X, Y, Z, Block.AIR);
    expect(world.storedState(X, Y, Z)).toBeNull();
    expect(world.states.size).toBe(0);
    // A new chest in the same cell starts empty.
    world.setBlock(X, Y, Z, Block.CHEST);
    expect(world.getState(X, Y, Z)).toEqual(emptyChest());
    expect(world.verifyLight()).toBe(0);
  });

  it('keeps an explicitly stored empty state, so a later generator cannot refill it', () => {
    const world = litWorld();
    world.setBlock(X, Y, Z, Block.CHEST);
    world.setState(X, Y, Z, emptyChest());
    expect(world.storedState(X, Y, Z)).toEqual(emptyChest());
    world.setState(X, Y, Z, null);
    expect(world.storedState(X, Y, Z)).toBeNull();
  });

  it('refuses to store a state in a loaded cell of another kind; never touches light', () => {
    const world = litWorld();
    const light = world.lightOf(0, 0).slice();
    expect(world.setState(X, Y, Z, chestWith(Block.DIRT, 1))).toBe(false);
    expect(world.states.size).toBe(0);
    world.setBlock(X, Y, Z, Block.CHEST);
    const lit = world.lightOf(0, 0).slice();
    world.setState(X, Y, Z, chestWith(Block.DIRT, 1));
    expect(world.lightOf(0, 0)).toEqual(lit);
    expect(lit).not.toEqual(light);
    expect(world.verifyLight()).toBe(0);
  });

  it('Phase 8B3a AC1.2: states survive unloading and reloading their chunk', () => {
    const world = litWorld();
    world.setBlock(X, Y, Z, Block.CHEST);
    world.setState(X, Y, Z, chestWith(Block.LOG, 7, 13));
    world.removeChunk(0, 0);
    // Unloaded: the block reads as air, but the stored state stays in the world.
    expect(world.getState(X, Y, Z)).toBeNull();
    expect(world.storedState(X, Y, Z)).toEqual(chestWith(Block.LOG, 7, 13));
    world.generate(0, 0);
    expect(world.getState(X, Y, Z)).toEqual(chestWith(Block.LOG, 7, 13));
    expect(world.droppedStates).toBe(0);
    world.light(0, 0);
    expect(world.verifyLight()).toBe(0);
  });

  it('Phase 8B3a AC1.2: a loaded state on a cell that is no chest is dropped and counted', () => {
    const states = new Map([
      [chunkKey(0, 0), new Map([[blockIndex(X, Y, Z), chestWith(Block.SAND, 3)]])],
    ]);
    // The edit puts a chest into another cell; the state's own cell is air.
    const edits = new Map([[chunkKey(0, 0), new Map([[blockIndex(X, Y + 1, Z), Block.CHEST]])]]);
    const world = new World(1337, undefined, edits, states);
    world.generate(0, 0);
    expect(world.droppedStates).toBe(1);
    expect(world.states.size).toBe(0);
    expect(world.getState(X, Y + 1, Z)).toEqual(emptyChest());
  });

  it('a state set in an unloaded chunk stays when the chunk loads with a chest there', () => {
    const world = new World(1337);
    world.setBlock(40, Y, 40, Block.CHEST);
    world.setState(40, Y, 40, chestWith(Block.CLAY, 2));
    world.generate(2, 2);
    expect(world.getState(40, Y, 40)).toEqual(chestWith(Block.CLAY, 2));
    expect(world.droppedStates).toBe(0);
  });
});

describe('state summary (Phase 8B3a 6.6)', () => {
  it('counts chests with items and the JSON size of all states', () => {
    const states = new Map([
      [
        '0,0',
        new Map([
          [1, chestWith(Block.STONE, 3)],
          [2, emptyChest()],
        ]),
      ],
      ['1,0', new Map([[3, chestWith(Block.LOG, 1, 26)]])],
    ]);
    const bytes = [chestWith(Block.STONE, 3), emptyChest(), chestWith(Block.LOG, 1, 26)]
      .map((s) => JSON.stringify(s).length)
      .reduce((a, b) => a + b, 0);
    expect(summarizeStates(states)).toEqual({ filled: 2, bytes });
    expect(summarizeStates(new Map())).toEqual({ filled: 0, bytes: 0 });
  });
});
