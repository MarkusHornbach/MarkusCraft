// The bot's dark-break count: a break counts when no light source is unlocked and every
// face of the block is dim (Fix Adventure 1 AC2.2).
import { describe, expect, it } from 'vitest';
import { Block } from '../world/blocks';
import { Bot, type Cell, DARK_LIGHT } from './Bot';

describe('dark breaks (Fix Adventure 1 AC2.2)', () => {
  it('Fix Adventure 1 AC2.2: a block enclosed in stone is dark before a light source, not after; the surface by day never', () => {
    const bot = new Bot(1337, { version: 2, options: { terrain: 'flat', trees: 'few' } });
    const [px, py, pz] = bot.cell;
    // A stone block deep below the start, its six neighbours made stone by hand.
    const deep: Cell = [px, 6, pz];
    for (const [dx, dy, dz] of [
      [1, 0, 0],
      [-1, 0, 0],
      [0, 1, 0],
      [0, -1, 0],
      [0, 0, 1],
      [0, 0, -1],
    ] as const) {
      bot.world.setBlock(px + dx, 6 + dy, pz + dz, Block.STONE);
    }
    bot.world.setBlock(px, 6, pz, Block.STONE);
    expect(bot.lightSourceUnlocked()).toBe(false);
    expect(bot.brightestFace(deep)).toBeLessThanOrEqual(DARK_LIGHT);
    expect(bot.isDarkBreak(deep)).toBe(true);
    // The ground under the start point: its top face has full sky light.
    const ground: Cell = [px, py - 1, pz];
    expect(bot.brightestFace(ground)).toBe(15);
    expect(bot.isDarkBreak(ground)).toBe(false);
    // Task 11 done: the torch is unlocked, nothing counts any more.
    bot.session.replaceProgress({ done: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], counts: [] });
    expect(bot.lightSourceUnlocked()).toBe(true);
    expect(bot.isDarkBreak(deep)).toBe(false);
    expect(bot.darkBreaks).toEqual([]);
    expect(bot.world.verifyLight()).toBe(0);
  });
});
