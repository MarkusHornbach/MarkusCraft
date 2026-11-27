// The place index (Phase 8 part B2b): generators 1 and 2 have none; regions are cached.
import { describe, expect, it } from 'vitest';
import { PLACE_INDEX_REGIONS, PLACE_REGION } from '../game/config';
import type { Place } from '../world/generation/terrain';
import { PlaceIndex } from './places';

describe('PlaceIndex', () => {
  it('Phase 8B2b AC5.2 has no places in generators 1 and 2', () => {
    for (const index of [
      new PlaceIndex(1337, { version: 1 }),
      new PlaceIndex(1337, { version: 2, options: { terrain: 'balanced', trees: 'few' } }),
    ]) {
      expect(index.hasPlaces).toBe(false);
      let n = 0;
      index.near(0, 0, 192, () => n++);
      expect(n).toBe(0);
      expect(index.built).toBe(0);
    }
  });

  it('Phase 8B2b AC5.1 caches regions and stays bounded', () => {
    const index = new PlaceIndex(1337, {
      version: 3,
      options: { terrain: 'balanced', trees: 'few' },
    });
    expect(index.hasPlaces).toBe(true);
    const first: Place[] = [];
    index.near(0, 0, 192, (p) => first.push(p));
    const built = index.built;
    expect(built).toBeGreaterThan(0);
    const again: Place[] = [];
    index.near(0, 0, 192, (p) => again.push(p));
    expect(index.built).toBe(built);
    expect(again).toEqual(first);
    // Every place lies in the region it is cached under.
    for (let rz = -2; rz <= 2; rz++) {
      for (let rx = -2; rx <= 2; rx++) {
        for (const p of index.region(rx, rz)) {
          expect(Math.floor(p.x / PLACE_REGION)).toBe(rx);
          expect(Math.floor(p.z / PLACE_REGION)).toBe(rz);
        }
      }
    }
    for (let i = 0; i < PLACE_INDEX_REGIONS + 4; i++) index.region(1000 + i, 0);
    expect(index.built).toBeGreaterThan(PLACE_INDEX_REGIONS);
  });
});
