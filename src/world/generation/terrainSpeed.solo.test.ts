// Generation speed against the Phase 1 terrain. A solo file: it runs with nothing next to
// it, because the two times differ by little and a busy machine shifts them.
import { describe, it } from 'vitest';
import { expectFasterThan } from '../../testing/timing';
import { ALL_FEATURES, NO_FEATURES, Terrain } from './terrain';

describe('generation speed', () => {
  it('is at most 20 % slower than the Phase 1 terrain (Phase 3 AC1.10)', () => {
    // Both generators run in the same process on the same contiguous area, as the game
    // loads it; each round starts with a fresh generator so no cache is warm.
    const run = (features: typeof ALL_FEATURES): number => {
      const terrain = new Terrain(5);
      const start = performance.now();
      for (let cz = 0; cz < 7; cz++) {
        for (let cx = 0; cx < 7; cx++) terrain.generateChunk(cx, cz, features);
      }
      return (performance.now() - start) / 49;
    };
    // Warm both paths up first: the comparison is about optimised code, and in a file of
    // its own nothing else has run the generator before.
    for (let round = 0; round < 30; round++) {
      run(ALL_FEATURES);
      run(NO_FEATURES);
    }
    let plain = Infinity;
    let full = Infinity;
    // Other test files run next to this one and can slow one of the two for a while:
    // enough rounds that both get a quiet moment (the best round of each counts).
    for (let round = 0; round < 120; round++) {
      plain = Math.min(plain, run(NO_FEATURES));
      full = Math.min(full, run(ALL_FEATURES));
    }
    expectFasterThan(full, plain * 1.2);
    // The absolute limit of Phase 1 (AC4.6) still holds with a wide margin.
    expectFasterThan(full, 15);
  });
});
