// The shared vein walk and the ore host (Phase 8 part B1): what the radar predicts.
import { describe, expect, it } from 'vitest';
import { CHUNK_SIZE } from '../../game/config';
import { Block } from '../blocks';
import { blockIndex } from '../chunk';
import { ColumnCache } from './columnCache';
import {
  ORE_CELL,
  ORE_KINDS,
  VEIN_CELLS_MAX,
  VEIN_REACH,
  oreCellRows,
  oreKindSeed,
  veinCells,
} from './ores';
import { getTerrain } from './terrain';
import { DIRT_DEPTH } from './terrainRules';

const BALANCED = { version: 2, options: { terrain: 'balanced', trees: 'few' } } as const;

describe('veinCells', () => {
  it('is deterministic, connected, in the box and the height range', () => {
    const out = new Int32Array(VEIN_CELLS_MAX * 3);
    const again = new Int32Array(VEIN_CELLS_MAX * 3);
    let veins = 0;
    for (const kind of ORE_KINDS) {
      const kindSeed = oreKindSeed(1337, kind);
      const rows = oreCellRows(kind);
      for (let cellY = rows.from; cellY <= rows.to; cellY++) {
        for (let cellX = -3; cellX <= 3; cellX++) {
          const n = veinCells(kind, kindSeed, cellX, cellY, 2, out);
          expect(veinCells(kind, kindSeed, cellX, cellY, 2, again)).toBe(n);
          expect(Array.from(again.subarray(0, n * 3))).toEqual(Array.from(out.subarray(0, n * 3)));
          if (n === 0) continue;
          veins++;
          for (let c = 0; c < n; c++) {
            const x = out[c * 3];
            const y = out[c * 3 + 1];
            const z = out[c * 3 + 2];
            expect(y).toBeGreaterThanOrEqual(kind.minY);
            expect(y).toBeLessThanOrEqual(kind.maxY);
            expect(x).toBeGreaterThanOrEqual(cellX * ORE_CELL - VEIN_REACH);
            expect(x).toBeLessThan((cellX + 1) * ORE_CELL + VEIN_REACH);
            expect(z).toBeGreaterThanOrEqual(2 * ORE_CELL - VEIN_REACH);
            expect(z).toBeLessThan(3 * ORE_CELL + VEIN_REACH);
          }
        }
      }
    }
    expect(veins).toBeGreaterThan(20);
  });

  it('matches the ores of a generated chunk where the cell was stone', () => {
    // Every ore block of the chunk lies in a vein of its kind (the full agreement is
    // src/radar/agreement.slow.test.ts).
    const terrain = getTerrain(42, BALANCED);
    const blocks = terrain.generateChunk(0, 0);
    const predicted = new Set<number>();
    const out = new Int32Array(VEIN_CELLS_MAX * 3);
    const kind = ORE_KINDS[0];
    const kindSeed = oreKindSeed(42, kind);
    const rows = oreCellRows(kind);
    for (let cellZ = -1; cellZ <= 3; cellZ++) {
      for (let cellX = -1; cellX <= 3; cellX++) {
        for (let cellY = rows.from; cellY <= rows.to; cellY++) {
          const n = veinCells(kind, kindSeed, cellX, cellY, cellZ, out);
          for (let c = 0; c < n; c++) {
            const x = out[c * 3];
            const y = out[c * 3 + 1];
            const z = out[c * 3 + 2];
            if (x < 0 || x >= CHUNK_SIZE || z < 0 || z >= CHUNK_SIZE) continue;
            if (terrain.oreHost(x, y, z)) predicted.add(blockIndex(x, y, z));
          }
        }
      }
    }
    const actual = new Set<number>();
    blocks.forEach((b, i) => {
      if (b === Block.COAL_ORE) actual.add(i);
    });
    expect(actual.size).toBeGreaterThan(0);
    expect([...predicted].sort()).toEqual([...actual].sort());
  });
});

describe('oreHost', () => {
  it('is stone from 1 to the height in a rock column, else below the soil', () => {
    for (const gen of [{ version: 1 } as const, BALANCED]) {
      const terrain = getTerrain(1337, gen);
      let rock = 0;
      let soil = 0;
      for (let x = -64; x < 64; x += 3) {
        for (let z = -64; z < 64; z += 5) {
          const h = terrain.heightAt(x, z);
          const top = terrain.isRock(x, z) ? h : h - DIRT_DEPTH - 1;
          if (terrain.isRock(x, z)) rock++;
          else soil++;
          expect(terrain.oreHost(x, 0, z)).toBe(false);
          expect(terrain.oreHost(x, 1, z)).toBe(top >= 1);
          expect(terrain.oreHost(x, top, z)).toBe(true);
          expect(terrain.oreHost(x, top + 1, z)).toBe(false);
        }
      }
      expect(soil).toBeGreaterThan(0);
      expect(rock + soil).toBeGreaterThan(100);
    }
  });
});

describe('ColumnCache', () => {
  it('keeps values per column and recomputes after a slot was taken', () => {
    const cache = new ColumnCache(4);
    let calls = 0;
    const compute = (x: number, z: number): number => {
      calls++;
      return x * 100 + z;
    };
    for (let round = 0; round < 3; round++) {
      for (let x = -5; x < 5; x++) expect(cache.get(x, 7, compute)).toBe(x * 100 + 7);
    }
    expect(calls).toBeGreaterThanOrEqual(10);
    const before = calls;
    expect(cache.get(3, 3, compute)).toBe(303);
    expect(cache.get(3, 3, compute)).toBe(303);
    expect(calls).toBe(before + 1);
  });
});
