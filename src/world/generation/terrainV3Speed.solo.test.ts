// Generators 3 and 4 speed against generator 2 (Phase 8 part B2a AC2.2, B3b AC1.5). A solo file: the two
// times differ by little and a busy machine shifts them.
import { describe, it } from 'vitest';
import { TIMING_ENFORCED, expectFasterThan } from '../../testing/timing';

/** Rounds of each side; under coverage the limits are not checked, one round runs the code. */
const ROUNDS = TIMING_ENFORCED ? 20 : 1;
import { findSpawn } from './spawn';
import { TerrainV2 } from './terrainV2';
import { TerrainV3 } from './terrainV3';
import { TerrainV4 } from './terrainV4';

const OPTIONS = { terrain: 'balanced', trees: 'few' } as const;
const SEEDS = [1, 42, 1337, 2024];

/**
 * Per chunk over the 15 × 15 chunks around the origin (what the game generates at the
 * phone's default render distance 5), the spawn already known: the game finds it before
 * it loads a chunk, for every generator. Caves are worked out per 64 × 64 region with a
 * reach of 32: a small area pays for the regions around it (9 × 9 chunks: about 1.3 ×).
 */
function run(make: (seed: number) => TerrainV2, seed: number): number {
  const terrain = make(seed);
  findSpawn(terrain);
  const start = performance.now();
  for (let cz = -7; cz <= 7; cz++) {
    for (let cx = -7; cx <= 7; cx++) terrain.generateChunk(cx, cz);
  }
  return (performance.now() - start) / 225;
}

describe('generator 3 speed', () => {
  it('Phase 8B2a AC2.2 Phase 8B3b AC1.5 a chunk of generators 3 and 4 takes at most 1.35 × generator 2', () => {
    // Fresh generators each round (no warm caches beyond the spawn), the two sides in turn;
    // the best round of each counts, summed over four seeds.
    const v2 = (seed: number): TerrainV2 => new TerrainV2(seed, OPTIONS);
    const v3 = (seed: number): TerrainV3 => new TerrainV3(seed, OPTIONS);
    const v4 = (seed: number): TerrainV4 => new TerrainV4(seed, OPTIONS);
    const two = SEEDS.map(() => Infinity);
    const three = SEEDS.map(() => Infinity);
    const four = SEEDS.map(() => Infinity);
    for (let round = 0; round < ROUNDS; round++) {
      SEEDS.forEach((seed, i) => {
        two[i] = Math.min(two[i], run(v2, seed));
        three[i] = Math.min(three[i], run(v3, seed));
        four[i] = Math.min(four[i], run(v4, seed));
      });
    }
    const sum = (xs: number[]): number => xs.reduce((a, b) => a + b, 0);
    console.log(
      `generation per chunk: generator 2 ${(sum(two) / 4).toFixed(3)} ms, generator 3 ${(sum(three) / 4).toFixed(3)} ms (${(sum(three) / sum(two)).toFixed(2)} ×), generator 4 ${(sum(four) / 4).toFixed(3)} ms (${(sum(four) / sum(two)).toFixed(2)} ×)`,
    );
    expectFasterThan(sum(three), sum(two) * 1.35);
    // Phase 8B3b AC1.5: generator 4 adds one cell write per shaft.
    expectFasterThan(sum(four), sum(two) * 1.35);
  });

  it('Phase 8B2a AC2.2 the first chunk of a world (spawn and spawn shaft) is measured and limited', () => {
    const first: number[] = [];
    for (let round = 0; round < Math.min(ROUNDS, 3); round++) {
      for (const seed of SEEDS) {
        const terrain = new TerrainV3(seed, OPTIONS);
        const start = performance.now();
        terrain.generateChunk(0, 0);
        first.push(performance.now() - start);
      }
    }
    first.sort((a, b) => a - b);
    const median = first[first.length >> 1];
    console.log(
      `first chunk of a world: median ${median.toFixed(1)} ms, worst ${first[first.length - 1].toFixed(1)} ms`,
    );
    expectFasterThan(median, FIRST_CHUNK_LIMIT_MS);
  });
});

/** At least three times the measured median (numbers in docs/phase-8b2a-report.md). */
const FIRST_CHUNK_LIMIT_MS = 400;
