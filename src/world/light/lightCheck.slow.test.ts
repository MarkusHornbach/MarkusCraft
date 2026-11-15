import { describe, expect, it } from 'vitest';
import { CHUNK_VOLUME, WORLD_HEIGHT } from '../../game/config';
import { GLOW_ROCK, LAMP, TEST_LIGHT } from '../../testing/lightScenes';
import { Block } from '../blocks';
import { checkChunkLight, checkLight, joinChunks } from './lightCheck';
import { blockOf, skyOf } from './lightRules';

const SIZE = 40;
const GROUND = 10;

/** A box of 40 × 40 columns; the middle is far enough from the sides to be exact. */
class Box {
  readonly blocks = new Uint8Array(SIZE * SIZE * WORLD_HEIGHT);

  constructor() {
    this.fill(0, 0, 0, SIZE - 1, GROUND, SIZE - 1, Block.STONE);
  }

  set(x: number, y: number, z: number, id: number): void {
    this.blocks[x + z * SIZE + y * SIZE * SIZE] = id;
  }

  fill(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, id: number): void {
    for (let y = y0; y <= y1; y++) {
      for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) this.set(x, y, z, id);
    }
  }

  light(): (x: number, y: number, z: number) => { sky: number; block: number } {
    const light = checkLight(this.blocks, SIZE, SIZE, TEST_LIGHT);
    return (x, y, z) => {
      const value = light[x + z * SIZE + y * SIZE * SIZE];
      return { sky: skyOf(value), block: blockOf(value) };
    };
  }
}

describe('lightCheck: the rules of plan 5.2 (Phase 4 AC1.2)', () => {
  it('an open column is 15 down to the first block that is not air or glass', () => {
    const box = new Box();
    box.set(20, 30, 20, Block.GLASS);
    const at = box.light();
    for (const y of [WORLD_HEIGHT - 1, 60, 31, 30, 29, GROUND + 1])
      expect(at(20, y, 20).sky).toBe(15);
    expect(at(20, GROUND, 20).sky).toBe(0);
    expect(at(20, GROUND + 1, 20).block).toBe(0);
  });

  it('a tunnel loses one level per block', () => {
    const box = new Box();
    // A hill fills the box from x = 10 on; the tunnel runs into it at ground level.
    box.fill(10, GROUND + 1, 0, SIZE - 1, 30, SIZE - 1, Block.STONE);
    box.fill(10, GROUND + 1, 20, 35, GROUND + 2, 20, Block.AIR);
    const at = box.light();
    expect(at(9, GROUND + 1, 20).sky).toBe(15);
    for (let step = 0; step < 14; step++) {
      expect(at(10 + step, GROUND + 1, 20).sky).toBe(14 - step);
      expect(at(10 + step, GROUND + 2, 20).sky).toBe(14 - step);
    }
    for (let x = 24; x <= 35; x++) expect(at(x, GROUND + 1, 20).sky).toBe(0);
  });

  it('a leaf block under open sky has 13 and the air below it 12', () => {
    const box = new Box();
    box.fill(14, 20, 14, 26, 20, 26, Block.LEAVES);
    const at = box.light();
    expect(at(20, 21, 20).sky).toBe(15);
    expect(at(20, 20, 20).sky).toBe(13);
    // No straight-down bonus below 15: the air under the canopy keeps fading.
    expect(at(20, 19, 20).sky).toBe(12);
    expect(at(20, 18, 20).sky).toBe(11);
    // At the rim of the canopy the open air next to it is brighter than the light from above.
    expect(at(14, 19, 14).sky).toBe(14);
  });

  it("under three blocks of water the bed's top face sees 9", () => {
    const box = new Box();
    box.fill(10, GROUND - 2, 10, 30, GROUND, 30, Block.WATER);
    const at = box.light();
    expect(at(20, GROUND, 20).sky).toBe(13);
    expect(at(20, GROUND - 1, 20).sky).toBe(11);
    expect(at(20, GROUND - 2, 20).sky).toBe(9);
    expect(at(20, GROUND - 3, 20).sky).toBe(0);
  });

  it('glass lets light through unchanged, also sideways', () => {
    const box = new Box();
    // A closed room with a glass block in the roof and one in a wall.
    box.fill(15, GROUND + 1, 15, 25, GROUND + 5, 25, Block.BRICKS);
    box.fill(16, GROUND + 1, 16, 24, GROUND + 4, 24, Block.AIR);
    box.set(20, GROUND + 5, 20, Block.GLASS);
    box.set(15, GROUND + 2, 18, Block.GLASS);
    const at = box.light();
    expect(at(20, GROUND + 5, 20).sky).toBe(15);
    expect(at(20, GROUND + 1, 20).sky).toBe(15);
    expect(at(21, GROUND + 1, 20).sky).toBe(14);
    // Through the wall: 15 outside, 14 in the glass, 13 in the first cell inside.
    expect(at(14, GROUND + 2, 18).sky).toBe(15);
    expect(at(15, GROUND + 2, 18).sky).toBe(14);
    expect(at(16, GROUND + 2, 18).sky).toBe(13);
  });

  it('a closed room has sky light 0', () => {
    const box = new Box();
    box.fill(15, GROUND + 1, 15, 25, GROUND + 5, 25, Block.BRICKS);
    box.fill(16, GROUND + 1, 16, 24, GROUND + 4, 24, Block.AIR);
    const at = box.light();
    for (let y = GROUND + 1; y <= GROUND + 4; y++) {
      for (let x = 16; x <= 24; x++) expect(at(x, y, 20).sky).toBe(0);
    }
    expect(at(20, GROUND + 6, 20).sky).toBe(15);
  });

  it('an emitter of 14 lights cells up to 13 steps away, around corners but not through walls', () => {
    const box = new Box();
    box.set(20, 40, 20, LAMP);
    box.fill(22, 38, 18, 22, 42, 22, Block.STONE);
    const at = box.light();
    expect(at(20, 40, 20).block).toBe(14);
    for (let d = 1; d <= 15; d++) expect(at(20 - d, 40, 20).block).toBe(Math.max(0, 14 - d));
    expect(at(20, 40 + 13, 20).block).toBe(1);
    expect(at(20, 40 + 14, 20).block).toBe(0);
    expect(at(17, 42, 23).block).toBe(14 - 8);
    // The wall is dark; behind it the light has gone around: 3 + 3 + 3 steps instead of 3.
    expect(at(22, 40, 20).block).toBe(0);
    expect(at(23, 40, 20).block).toBe(14 - 9);
    // Sky light is not touched by an emitter.
    expect(at(20, 40, 20).sky).toBe(15);
  });

  it('an opaque emitter has its emission and lights its neighbours', () => {
    const box = new Box();
    box.set(20, GROUND, 20, GLOW_ROCK);
    box.set(20, GROUND + 1, 20, LAMP);
    const at = box.light();
    expect(at(20, GROUND, 20).block).toBe(9);
    expect(at(20, GROUND, 20).sky).toBe(0);
    // The lamp above is brighter, but its light does not enter the opaque rock.
    expect(at(20, GROUND + 1, 20).block).toBe(14);
    box.set(20, GROUND + 1, 20, Block.AIR);
    const alone = box.light();
    expect(alone(20, GROUND + 1, 20).block).toBe(8);
    expect(alone(21, GROUND + 1, 20).block).toBe(7);
    expect(alone(21, GROUND, 20).block).toBe(0);
  });

  it('light fades in water and leaves by two per block', () => {
    const box = new Box();
    box.fill(10, GROUND + 1, 10, 30, GROUND + 9, 30, Block.WATER);
    box.set(20, GROUND + 5, 20, LAMP);
    const at = box.light();
    expect(at(21, GROUND + 5, 20).block).toBe(12);
    expect(at(22, GROUND + 5, 20).block).toBe(10);
    expect(at(26, GROUND + 5, 20).block).toBe(2);
    expect(at(27, GROUND + 5, 20).block).toBe(0);
  });

  it('refuses block data of the wrong size', () => {
    expect(() => checkLight(new Uint8Array(10), 4, 4)).toThrow();
  });

  it('joins chunks into a box and cuts the middle chunk out again', () => {
    const a = new Uint8Array(CHUNK_VOLUME).fill(Block.STONE, 0, 256 * 5);
    const b = new Uint8Array(CHUNK_VOLUME).fill(Block.DIRT, 0, 256 * 3);
    const box = joinChunks((ix) => (ix === 0 ? a : ix === 1 ? b : null), 3, 1);
    expect(box[0]).toBe(Block.STONE);
    expect(box[16]).toBe(Block.DIRT);
    expect(box[32]).toBe(Block.AIR);
    expect(box[16 + 4 * 48 * 16]).toBe(Block.AIR);
    expect(box[15 + 4 * 48 * 16]).toBe(Block.STONE);
    const light = checkChunkLight((dx, dz) => (dx === 0 && dz === 0 ? a : null));
    expect(skyOf(light[0])).toBe(0);
    expect(skyOf(light[256 * 5])).toBe(15);
    // The side of the lone chunk gets light from the air next to it; its inside does not.
    expect(skyOf(light[256 * 4])).toBe(0);
  });
});
