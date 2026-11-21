// Phase 6 part D: the table of looks and how a look is chosen for a device.
import { describe, expect, it } from 'vitest';
import { playerKeyFromBytes } from '../net/roomCode';
import { mulberry32 } from '../util/rng';
import { LOOKS, LOOK_COUNT, lookForKey, resolveLook } from './looks';

function randomKey(rng: () => number): string {
  return playerKeyFromBytes(Array.from({ length: 16 }, () => Math.floor(rng() * 256)));
}

describe('looks', () => {
  it('Phase 6 AC11.1: the table is pinned (ids, names, order)', () => {
    expect(LOOKS.map((l) => [l.id, l.name])).toEqual([
      [1, 'Fern'],
      [2, 'Ember'],
      [3, 'Pebble'],
      [4, 'River'],
      [5, 'Moss'],
      [6, 'Dune'],
      [7, 'Frost'],
      [8, 'Plum'],
    ]);
    expect(LOOK_COUNT).toBe(8);
  });

  it('Phase 6 AC11.1: lookForKey gives 1–8, the same for the same key, evenly spread', () => {
    const rng = mulberry32(61);
    const counts = new Array<number>(9).fill(0);
    for (let i = 0; i < 10_000; i++) {
      const key = randomKey(rng);
      const look = lookForKey(key);
      expect(look).toBeGreaterThanOrEqual(1);
      expect(look).toBeLessThanOrEqual(8);
      expect(lookForKey(key)).toBe(look);
      counts[look]++;
    }
    for (let look = 1; look <= 8; look++) {
      expect(counts[look] / 10_000).toBeGreaterThan(0.09);
      expect(counts[look] / 10_000).toBeLessThan(0.16);
    }
  });

  it('Phase 6 AC11.1: resolveLook keeps a chosen look and derives the rest from the key', () => {
    const key = randomKey(mulberry32(3));
    for (let choice = 1; choice <= 8; choice++) expect(resolveLook(choice, key)).toBe(choice);
    for (const choice of [0, 9, -1, 2.5, '3', null, undefined, NaN]) {
      expect(resolveLook(choice, key)).toBe(lookForKey(key));
    }
  });

  it('no look uses the colour schemes of well-known default skins (hard rule 1)', () => {
    const turquoise = (c: readonly number[]): boolean => c[1] > 140 && c[2] > 140 && c[0] < 90;
    const orange = (c: readonly number[]): boolean =>
      c[0] > 180 && c[1] > 80 && c[1] < 150 && c[2] < 70;
    const green = (c: readonly number[]): boolean => c[1] > c[0] + 20 && c[1] > c[2] + 20;
    for (const look of LOOKS) {
      expect(turquoise(look.top)).toBe(false);
      expect(orange(look.hair) && green(look.top)).toBe(false);
    }
  });
});
