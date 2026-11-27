// Generator 3 speed against generator 2 (Phase 8 part B2a, AC2.2). A solo file: the two
// times differ by little and a busy machine shifts them.
import { describe, it } from 'vitest';
import { expectFasterThan } from '../../testing/timing';
import { findSpawn } from './spawn';
import { TerrainV2 } from './terrainV2';
import { TerrainV3 } from './terrainV3';

const OPTIONS = { terrain: 'balanced', trees: 'few' } as const;
const SEEDS = [1, 42, 1337, 2024];

/**
 * Per chunk over the 9 × 9 chunks around the origin (the area of the face budget), the
 * spawn already known: the game finds it before it loads a chunk, for every generator.
 */
function run(make: (seed: number) => TerrainV2, seed: number): number {
  const terrain = make(seed);
  findSpawn(terrain);
  const start = performance.now();
  for (let cz = -4; cz <= 4; cz++) {
    for (let cx = -4; cx <= 4; cx++) terrain.generateChunk(cx, cz);
  }
  return (performance.now() - start) / 81;
}

describe('generator 3 speed', () => {
  it('Phase 8B2a AC2.2 a chunk of generator 3 takes at most 1.35 × generator 2', () => {
    // Fresh generators each round (no warm caches beyond the spawn), the two sides in turn;
    // the best round of each counts, summed over four seeds.
    const v2 = (seed: number): TerrainV2 => new TerrainV2(seed, OPTIONS);
    const v3 = (seed: number): TerrainV3 => new TerrainV3(seed, OPTIONS);
    const two = SEEDS.map(() => Infinity);
    const three = SEEDS.map(() => Infinity);
    for (let round = 0; round < 25; round++) {
      SEEDS.forEach((seed, i) => {
        two[i] = Math.min(two[i], run(v2, seed));
        three[i] = Math.min(three[i], run(v3, seed));
      });
    }
    const sum = (xs: number[]): number => xs.reduce((a, b) => a + b, 0);
    console.log(
      `generation per chunk: generator 2 ${(sum(two) / 4).toFixed(3)} ms, generator 3 ${(sum(three) / 4).toFixed(3)} ms (${(sum(three) / sum(two)).toFixed(2)} ×)`,
    );
    expectFasterThan(sum(three), sum(two) * 1.35);
  });

  it('Phase 8B2a AC2.2 the first chunk of a world (spawn and spawn shaft) is measured and limited', () => {
    const first: number[] = [];
    for (let round = 0; round < 3; round++) {
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
