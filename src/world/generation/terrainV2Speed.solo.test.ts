// Generator 2 speed against version 1 (Phase 7 AC4.3). A solo file: the two times differ
// by little and a busy machine shifts them.
import { describe, it } from 'vitest';
import { expectFasterThan } from '../../testing/timing';
import { Terrain } from './terrain';
import { TerrainV2 } from './terrainV2';

describe('generator 2 speed', () => {
  it('Phase 7 AC4.3: balanced/normal is at most 15 % slower per chunk than version 1', () => {
    // Fresh generators each round (no warm cache), the same contiguous area as the game
    // loads it, the two sides in turn; the best round of each counts.
    const run = (make: () => { generateChunk(cx: number, cz: number): Uint8Array }): number => {
      const terrain = make();
      const start = performance.now();
      for (let cz = 0; cz < 7; cz++) {
        for (let cx = 0; cx < 7; cx++) terrain.generateChunk(cx, cz);
      }
      return (performance.now() - start) / 49;
    };
    const v1 = (): Terrain => new Terrain(5);
    const v2 = (): TerrainV2 => new TerrainV2(5, { terrain: 'balanced', trees: 'normal' });
    for (let round = 0; round < 30; round++) {
      run(v1);
      run(v2);
    }
    let one = Infinity;
    let two = Infinity;
    for (let round = 0; round < 120; round++) {
      one = Math.min(one, run(v1));
      two = Math.min(two, run(v2));
    }
    expectFasterThan(two, one * 1.15);
  });
});
