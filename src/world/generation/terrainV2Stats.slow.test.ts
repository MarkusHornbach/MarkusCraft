// Statistics of generator 2 over the plan's seeds (Phase 7 part A, groups 2 and 3). Heavy:
// a slow file, without a tight time limit.
import { describe, expect, it } from 'vitest';
import {
  MEASURED_HALF,
  MEASURED_SEEDS,
  type TerrainCounts,
  addCounts,
  emptyCounts,
  measureTerrain,
  sharesOf,
} from '../../testing/terrainMeasure';
import { Terrain } from './terrain';
import { TerrainV2 } from './terrainV2';
import {
  TERRAIN_SHAPES,
  TREE_DENSITIES,
  type TerrainShape,
  type TreeDensity,
} from './worldOptions';

function measureShape(shape: TerrainShape | 'v1'): { total: TerrainCounts; perSeed: number[] } {
  const total = emptyCounts();
  const perSeed: number[] = [];
  for (const seed of MEASURED_SEEDS) {
    const terrain =
      shape === 'v1' ? new Terrain(seed) : new TerrainV2(seed, { terrain: shape, trees: 'normal' });
    const counts = measureTerrain(terrain, MEASURED_HALF, true);
    perSeed.push(sharesOf(counts).plains);
    addCounts(total, counts);
  }
  return { total, perSeed };
}

describe('generator 2 shapes over the measured seeds', () => {
  const v1 = measureShape('v1');
  const shapes = new Map(TERRAIN_SHAPES.map((s) => [s, measureShape(s)]));
  const shares = (s: TerrainShape) => {
    const shape = shapes.get(s);
    if (!shape) throw new Error(s);
    return { ...sharesOf(shape.total), perSeed: shape.perSeed };
  };

  it('Phase 7 AC2.1: hilly has the heights of version 1 in every column', () => {
    for (const seed of MEASURED_SEEDS) {
      const one = new Terrain(seed);
      const two = new TerrainV2(seed, { terrain: 'hilly', trees: 'none' });
      let differ = 0;
      for (let z = -MEASURED_HALF; z < MEASURED_HALF; z++) {
        for (let x = -MEASURED_HALF; x < MEASURED_HALF; x++) {
          if (one.heightAt(x, z) !== two.heightAt(x, z)) differ++;
        }
      }
      expect(differ, `seed ${seed}`).toBe(0);
    }
  });

  it('Phase 7 AC2.2: plains share of land per shape', () => {
    const flat = shares('flat');
    const balanced = shares('balanced');
    const hilly = shares('hilly');
    expect(flat.plains).toBeGreaterThanOrEqual(85);
    expect(balanced.plains).toBeGreaterThanOrEqual(68);
    expect(balanced.plains).toBeLessThanOrEqual(88);
    expect(hilly.plains).toBeCloseTo(sharesOf(v1.total).plains, 6);
    for (const p of flat.perSeed) expect(p).toBeGreaterThanOrEqual(75);
    for (const p of balanced.perSeed) expect(p).toBeGreaterThanOrEqual(55);
  });

  it('Phase 7 AC2.3: the water share stays within 6 points of version 1', () => {
    const water = sharesOf(v1.total).water;
    for (const s of TERRAIN_SHAPES) expect(Math.abs(shares(s).water - water), s).toBeLessThan(6);
  });

  it('Phase 7 AC2.4: little high land on flat and balanced', () => {
    expect(shares('flat').high).toBeLessThanOrEqual(1);
    expect(shares('balanced').high).toBeLessThanOrEqual(6);
  });

  it('Phase 7 AC2.5: ores and clay as in version 1 for every shape', () => {
    // The tolerances of the version 1 tests (terrainV1.test.ts, Phase 3 AC1.3, AC1.6).
    for (const s of TERRAIN_SHAPES) {
      const share = shares(s);
      expect(share.coal, s).toBeGreaterThanOrEqual(0.8);
      expect(share.coal, s).toBeLessThanOrEqual(1.6);
      expect(share.iron, s).toBeGreaterThanOrEqual(0.4);
      expect(share.iron, s).toBeLessThanOrEqual(0.8);
      expect(share.clay, s).toBeGreaterThanOrEqual(4);
      expect(share.clay, s).toBeLessThanOrEqual(12);
    }
  });
});

describe('generator 2 trees over the measured seeds', () => {
  const measure = (shape: TerrainShape, trees: TreeDensity) => {
    const total = emptyCounts();
    for (const seed of MEASURED_SEEDS) {
      addCounts(total, measureTerrain(new TerrainV2(seed, { terrain: shape, trees })));
    }
    return sharesOf(total);
  };
  const LIMITS: Record<TreeDensity, [number, number]> = {
    none: [0, 0],
    few: [4, 10],
    normal: [12, 22],
    many: [28, 45],
  };
  const OPEN: Partial<Record<TreeDensity, number>> = { few: 50, normal: 20 };

  for (const shape of TERRAIN_SHAPES) {
    it(`Phase 7 AC3.1, AC3.2: trees per 1000 grass columns and open land (${shape})`, () => {
      for (const trees of TREE_DENSITIES) {
        const s = measure(shape, trees);
        const [lo, hi] = LIMITS[trees];
        expect(s.treesPer1000, `${shape}/${trees}`).toBeGreaterThanOrEqual(lo);
        expect(s.treesPer1000, `${shape}/${trees}`).toBeLessThanOrEqual(hi);
        const open = OPEN[trees];
        if (open !== undefined) expect(s.open, `${shape}/${trees}`).toBeGreaterThanOrEqual(open);
      }
    });
  }
});
