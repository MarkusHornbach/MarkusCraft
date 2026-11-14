import { describe, expect, it } from 'vitest';
import { CHUNK_SIZE, WORLD_HEIGHT } from '../../game/config';
import {
  COUNT,
  PLACED,
  block,
  expectCorrect,
  flatGroup,
  lights,
  randomEdits,
  sky,
  worldOf,
} from '../../testing/lightEdits';
import { GLOW_ROCK, LAMP, TEST_LIGHT, artificialGroup } from '../../testing/lightScenes';
import { expectFasterThan } from '../../testing/timing';
import { mulberry32, randInt } from '../../util/rng';
import { Block } from '../blocks';
import { World } from '../World';
import { blockOf } from './lightRules';
import { changesLight, lightDifference, updateLight } from './lightUpdate';

describe('light after edits', () => {
  it('Phase 4 AC2.3: random edits that reach the top of the world', () => {
    randomEdits(worldOf(artificialGroup(79, COUNT)), 30, 2025, true);
  });

  it('Phase 4 AC2.4: removing an emitter leaves no light behind', () => {
    const world = worldOf(flatGroup());
    world.setBlock(40, 12, 40, LAMP);
    expect(block(world, 40, 12, 40)).toBe(14);
    expect(block(world, 45, 12, 40)).toBe(9);
    expect(block(world, 40, 11, 53)).toBe(0);
    expect(block(world, 40, 12, 53)).toBe(1);
    expectCorrect(world);
    world.setBlock(40, 12, 40, Block.AIR);
    for (const chunk of world.allChunks()) {
      if (chunk.light) expect(chunk.light.some((value) => blockOf(value) > 0)).toBe(false);
    }
    expectCorrect(world);
  });

  it('Phase 4 AC2.4: closing the top of a shaft darkens it to 0, opening it restores 15', () => {
    const group = flatGroup();
    group.fill(30, 11, 30, 50, 40, 50, Block.STONE);
    group.fill(40, 11, 40, 40, 40, 40, Block.AIR);
    const world = worldOf(group);
    for (let y = 11; y <= 40; y++) expect(sky(world, 40, y, 40)).toBe(15);
    world.setBlock(40, 40, 40, Block.STONE);
    for (let y = 11; y <= 40; y++) expect(sky(world, 40, y, 40)).toBe(0);
    expectCorrect(world);
    world.setBlock(40, 40, 40, Block.AIR);
    for (let y = 11; y <= 40; y++) expect(sky(world, 40, y, 40)).toBe(15);
    expectCorrect(world);
    // Glass on top changes nothing; leaves dim the whole shaft.
    world.setBlock(40, 40, 40, Block.GLASS);
    expect(sky(world, 40, 11, 40)).toBe(15);
    world.setBlock(40, 40, 40, Block.LEAVES);
    expect(sky(world, 40, 40, 40)).toBe(13);
    expect(sky(world, 40, 39, 40)).toBe(12);
    expect(sky(world, 40, 30, 40)).toBe(3);
    expect(sky(world, 40, 11, 40)).toBe(0);
    expectCorrect(world);
  });

  it('Phase 4 AC2.4: of two emitters whose light overlaps, one is removed', () => {
    const world = worldOf(flatGroup());
    world.setBlock(38, 12, 40, LAMP);
    world.setBlock(44, 12, 40, LAMP);
    expect(block(world, 41, 12, 40)).toBe(11);
    world.setBlock(38, 12, 40, Block.AIR);
    expect(block(world, 44, 12, 40)).toBe(14);
    expect(block(world, 41, 12, 40)).toBe(11);
    expect(block(world, 38, 12, 40)).toBe(8);
    expect(block(world, 31, 12, 40)).toBe(1);
    expectCorrect(world);
    // An opaque emitter swept away by the removal of a brighter one comes back by itself.
    world.setBlock(46, 12, 40, GLOW_ROCK);
    world.setBlock(44, 12, 40, Block.AIR);
    expect(block(world, 46, 12, 40)).toBe(9);
    expect(block(world, 45, 12, 40)).toBe(8);
    expectCorrect(world);
  });

  it('Phase 4 AC2.4: an edit on a chunk corner reaches all four chunks', () => {
    const world = worldOf(flatGroup());
    const reported: string[] = [];
    world.onLightChange = (cx, cz) => reported.push(`${cx},${cz}`);
    world.setBlock(32, 11, 32, LAMP);
    expect(reported.sort()).toEqual(['1,1', '1,2', '2,1', '2,2']);
    expect(block(world, 31, 11, 31)).toBe(12);
    expect(block(world, 26, 11, 32)).toBe(8);
    expectCorrect(world);
  });

  it('Phase 4 AC2.5: reports only what a mesh can see', () => {
    const world = worldOf(flatGroup());
    const reported: string[] = [];
    world.onLightChange = (cx, cz) => reported.push(`${cx},${cz}`);
    // Stone for stone: no light changes at all.
    world.setBlock(40, 5, 40, Block.DIRT);
    world.setBlock(40, 20, 40, Block.GLASS);
    expect(reported).toEqual([]);
    // A block in the open, in the middle of a chunk: only its own cell goes dark.
    world.setBlock(40, 11, 40, Block.STONE);
    expect(reported).toEqual(['2,2']);
    // The same on a border: the neighbour's mesh reads the cell.
    reported.length = 0;
    world.setBlock(47, 11, 40, Block.STONE);
    expect(reported.sort()).toEqual(['2,2', '3,2']);
    expect(world.setBlock(0, -1, 0, Block.STONE)).toBe(false);
    expect(world.setBlock(0, WORLD_HEIGHT, 0, Block.STONE)).toBe(false);
  });

  it('Phase 4 AC2.4: an edit next to a chunk that is not lit works the lit chunks out again', () => {
    const world = worldOf(flatGroup());
    const reported: string[] = [];
    world.onLightChange = (cx, cz, lit) => reported.push(`${cx},${cz},${lit}`);
    // Chunk (1, 1) is lit, its neighbour (0, 1) is not: a lamp in each of them.
    world.setBlock(17, 11, 20, LAMP);
    expect(block(world, 17, 11, 20)).toBe(14);
    expect(world.getLight(15, 11, 20)).toBeNull();
    world.setBlock(14, 12, 24, LAMP);
    expect(block(world, 16, 12, 24)).toBe(12);
    expect(reported.every((entry) => entry.endsWith('true'))).toBe(true);
    expect(reported).toContain('1,1,true');
    expect(world.litCount).toBe(9);
    expectCorrect(world);
  });

  it('Phase 4 AC2.4: an edit in a chunk that is not loaded is only recorded', () => {
    const world = worldOf(flatGroup());
    const reported: string[] = [];
    world.onLightChange = (cx, cz, lit) => reported.push(`${cx},${cz},${lit}`);
    const before = lights(world);
    world.setBlock(7 * 16 + 3, 11, 5, LAMP);
    expect(world.edits.get('7,0')?.get(3 + 5 * 16 + 11 * 256)).toBe(LAMP);
    expect(world.hasChunk(7, 0)).toBe(false);
    expect(reported).toEqual([]);
    expect(lights(world)).toEqual(before);
  });

  it('a lit chunk next to an edit in a chunk that is not loaded loses its light', () => {
    const world = worldOf(flatGroup());
    world.removeChunk(4, 2);
    const reported: string[] = [];
    world.onLightChange = (cx, cz, lit) => reported.push(`${cx},${cz},${lit}`);
    world.setBlock(4 * 16, 11, 40, LAMP);
    expect(reported.sort()).toEqual(['3,1,false', '3,2,false', '3,3,false']);
    expect(world.getChunk(3, 2)?.light).toBeNull();
    expect(world.getLight(3 * 16 + 5, 11, 40)).toBeNull();
    expect(world.litCount).toBe(6);
  });

  it('light above and below the world', () => {
    const world = worldOf(flatGroup());
    expect(world.getLight(40, WORLD_HEIGHT, 40)).toBe(0xf0);
    expect(world.getLight(40, -1, 40)).toBe(0);
    expect(world.getLight(40, 50, 40)).toBe(0xf0);
    expect(world.getLight(999, 50, 40)).toBeNull();
    expect(() => world.light(0, 0)).toThrow();
    expect(world.canLight(1, 1)).toBe(true);
    expect(world.canLight(0, 0)).toBe(false);
    expect(world.allLit(2, 2)).toBe(true);
    expect(world.allLit(1, 1)).toBe(false);
  });

  it('verifyLight counts wrong cells and finds none in a correct world', () => {
    const world = new World(1337);
    for (let cz = -2; cz <= 2; cz++) for (let cx = -2; cx <= 2; cx++) world.generate(cx, cz);
    world.light(0, 0);
    world.light(1, 0);
    world.setBlock(3, world.surfaceY(3, 3) + 3, 3, Block.PLANKS);
    // Chunk (1, 0) needs chunks on the side of the world that are not loaded.
    world.removeChunk(2, 1);
    expect(world.verifyLight()).toBe(0);
    const light = world.getChunk(0, 0)?.light as Uint8Array;
    light[5] ^= 0x10;
    light[900] ^= 0x01;
    expect(world.verifyLight()).toBe(2);
    // The light a chunk would have, without loading it, equals the light it gets.
    const stored = world.getChunk(1, 0)?.light as Uint8Array;
    expect(world.lightOf(1, 0)).toBe(stored);
    world.removeChunk(1, 0);
    expect(world.lightOf(1, 0)).toEqual(stored);
  });
});

describe('updateLight', () => {
  it('needs nine lit chunks', () => {
    const blocks = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE * WORLD_HEIGHT);
    expect(() =>
      updateLight(
        () => blocks,
        () => null,
        0,
        0,
        0,
        1,
      ),
    ).toThrow();
  });

  it('knows which block changes matter for light', () => {
    expect(changesLight(Block.STONE, Block.DIRT)).toBe(false);
    expect(changesLight(Block.AIR, Block.GLASS)).toBe(false);
    expect(changesLight(Block.AIR, Block.STONE)).toBe(true);
    expect(changesLight(Block.AIR, Block.WATER)).toBe(true);
    expect(changesLight(Block.AIR, LAMP, TEST_LIGHT)).toBe(true);
    expect(changesLight(Block.AIR, LAMP)).toBe(false);
  });

  it('compares two versions of a chunk light', () => {
    const a = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE * WORLD_HEIGHT);
    const b = a.slice();
    expect(lightDifference(a, b)).toBe(0);
    b[5 + 5 * 16 + 256] = 3;
    expect(lightDifference(a, b)).toBe(1 << 4);
    b[0] = 3;
    expect(lightDifference(a, b)).toBe((1 << 4) | (1 << 3) | (1 << 1) | (1 << 0));
  });

  it('Phase 4 AC2.6: one edit takes at most 0.5 ms on average', () => {
    const world = worldOf(artificialGroup(78, COUNT));
    const rng = mulberry32(5);
    const edits: [number, number, number, number][] = [];
    for (let i = 0; i < 2000; i++) {
      edits.push([
        32 + randInt(rng, CHUNK_SIZE),
        randInt(rng, 22),
        32 + randInt(rng, CHUNK_SIZE),
        PLACED[randInt(rng, PLACED.length)],
      ]);
    }
    const start = performance.now();
    for (const [x, y, z, id] of edits) world.setBlock(x, y, z, id);
    const average = (performance.now() - start) / edits.length;
    console.log(`light update: ${average.toFixed(4)} ms per edit on average`);
    expectCorrect(world);
    expectFasterThan(average, 0.5);
  });

  it('Phase 4 AC2.6: opening the roof of a dark hall of 31 × 31 × 4 takes at most 5 ms', () => {
    const group = flatGroup();
    group.fill(24, 11, 24, 56, 15, 56, Block.STONE);
    group.fill(25, 11, 25, 55, 14, 55, Block.AIR);
    const world = worldOf(group);
    expect(sky(world, 40, 11, 40)).toBe(0);
    let best = Infinity;
    for (let round = 0; round < 10; round++) {
      const start = performance.now();
      world.setBlock(40, 15, 40, Block.AIR);
      best = Math.min(best, performance.now() - start);
      expect(sky(world, 40, 11, 40)).toBe(15);
      expect(sky(world, 30, 11, 40)).toBe(5);
      if (round === 0) expectCorrect(world);
      world.setBlock(40, 15, 40, Block.STONE);
      expect(sky(world, 30, 11, 40)).toBe(0);
    }
    console.log(`light update: ${best.toFixed(3)} ms to open the roof of the hall`);
    expectFasterThan(best, 5);
  });
});
