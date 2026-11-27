// Capsules and the carve mask of generator 3 (Phase 8 part B2a).
import { describe, expect, it } from 'vitest';
import { CaveCarver, rasterCapsule } from './caves';
import { CONTINENT_SLOPE, LAND_MIN_HEIGHT, TerrainV2 } from './terrainV2';
import { TerrainV3 } from './terrainV3';

describe('caves', () => {
  it('Phase 8B2a a capsule is 3 to 5 blocks wide and flatter below its axis', () => {
    const spans: number[][] = [];
    const out = {
      push: (x: number, z: number, y0: number, y1: number) => spans.push([x, z, y0, y1]),
    };
    rasterCapsule(out, 0.5, 20.5, 0.5, 10.5, 20.5, 0.5, 2, 1.5, 2);
    const atX5 = spans.filter(([x]) => x === 5);
    expect(atX5.length).toBeGreaterThanOrEqual(3);
    expect(atX5.length).toBeLessThanOrEqual(5);
    const centre = atX5.find(([, z]) => z === 0);
    expect(centre).toEqual([5, 0, 19, 22]);
  });

  it('Phase 8B2a the mask is a pure function of seed and heights', () => {
    const terrain = new TerrainV3(1337, { terrain: 'balanced', trees: 'few' });
    const heights = { heightAt: (x: number, z: number) => terrain.heightAt(x, z) };
    const a = new CaveCarver(1337, heights);
    const b = new CaveCarver(1337, heights);
    // Different orders, the same masks.
    for (let cz = -2; cz <= 2; cz++) for (let cx = -2; cx <= 2; cx++) a.mask(cx, cz);
    for (let cz = 2; cz >= -2; cz--) {
      for (let cx = 2; cx >= -2; cx--) expect(b.mask(cx, cz)).toEqual(a.mask(cx, cz));
    }
    expect(a.shapesIn(-200, -200, 200, 200).length).toBeGreaterThan(0);
  });
});

describe('the land bound of the water rule', () => {
  it('Phase 8B2a where the continent noise is at least 0 the ground is at least LAND_MIN_HEIGHT', () => {
    for (const terrain of ['flat', 'balanced', 'hilly'] as const) {
      for (const seed of [1, 42, 1337]) {
        const t = new TerrainV2(seed, { terrain, trees: 'none' });
        for (let z = -600; z <= 600; z += 7) {
          for (let x = -600; x <= 600; x += 7) {
            if (t.continentAt(x, z) >= 0) {
              expect(t.heightAt(x, z)).toBeGreaterThanOrEqual(LAND_MIN_HEIGHT);
            }
          }
        }
      }
    }
  });
});

describe('the continent slope bound', () => {
  it('Phase 8B2a the continent value changes by at most CONTINENT_SLOPE per block', () => {
    let steepest = 0;
    for (const seed of [1, 42, 1337, 2024, 7]) {
      const t = new TerrainV2(seed, { terrain: 'balanced', trees: 'none' });
      for (let z = -2000; z <= 2000; z += 13) {
        for (let x = -2000; x <= 2000; x += 13) {
          const c = t.continentAt(x, z);
          steepest = Math.max(steepest, Math.abs(t.continentAt(x + 1, z) - c));
          steepest = Math.max(steepest, Math.abs(t.continentAt(x, z + 1) - c));
        }
      }
    }
    expect(steepest).toBeLessThanOrEqual(CONTINENT_SLOPE);
  });
});
