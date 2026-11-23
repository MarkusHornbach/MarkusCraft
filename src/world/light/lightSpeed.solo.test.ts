// Phase 4 AC1.7: the time of lighting against meshing and against a chunk of caves. Two
// times with a tight ratio: run alone (`*.solo.test.ts`), both sides warmed up, the best of
// many rounds taken with the two sides in turn. Moved here from `lightChunk.slow.test.ts`,
// whose files run side by side with the heavy light soak tests (Phase 6 part B, CI).
import { describe, expect, it } from 'vitest';
import { caveGroup } from '../../testing/lightScenes';
import { expectFasterThan } from '../../testing/timing';
import { generateChunk } from '../generation/terrain';
import { meshChunk } from '../meshing/mesher';
import { lightChunk } from './lightChunk';
import type { ChunkLookup } from './lightRules';
import { CLASSIC_GEN } from '../generation/worldOptions';

const SEED = 1337;
const terrain = new Map<string, Uint8Array>();
function terrainChunk(cx: number, cz: number): Uint8Array {
  const key = `${cx},${cz}`;
  let blocks = terrain.get(key);
  if (!blocks) {
    blocks = generateChunk(SEED, cx, cz, CLASSIC_GEN);
    terrain.set(key, blocks);
  }
  return blocks;
}
function around(cx: number, cz: number): ChunkLookup {
  return (dx, dz) => terrainChunk(cx + dx, cz + dz);
}

function time(run: () => void): number {
  const start = performance.now();
  run();
  return performance.now() - start;
}

/** The best of `rounds` rounds of each side, the two sides in turn, after a warm-up. */
function bestOfBoth(rounds: number, a: () => void, b: () => void): [number, number] {
  a();
  b();
  let bestA = Infinity;
  let bestB = Infinity;
  for (let i = 0; i < rounds; i++) {
    bestA = Math.min(bestA, time(a));
    bestB = Math.min(bestB, time(b));
  }
  return [bestA, bestB];
}

describe('light speed (Phase 4 AC1.7)', () => {
  it('lighting a terrain chunk takes at most 40 % of meshing it', () => {
    for (let cz = -1; cz <= 4; cz++) for (let cx = -1; cx <= 4; cx++) terrainChunk(cx, cz);
    const each = (run: (cx: number, cz: number) => void) => () => {
      for (let cz = 0; cz < 4; cz++) for (let cx = 0; cx < 4; cx++) run(cx, cz);
    };
    const [light, mesh] = bestOfBoth(
      12,
      each((cx, cz) => lightChunk(around(cx, cz))),
      each((cx, cz) => meshChunk(terrainChunk(cx, cz), around(cx, cz))),
    );
    console.log(
      `light ${(light / 16).toFixed(3)} ms/chunk, meshing ${(mesh / 16).toFixed(3)} ms/chunk`,
    );
    expectFasterThan(light, mesh * 0.4);
  });

  it('a chunk full of caves takes at most four times a terrain chunk', () => {
    const caves = caveGroup(SEED, 1, 1);
    expect(caves.carvedShare).toBeGreaterThan(0.25);
    const lookup: ChunkLookup = (dx, dz) => caves.at(dx + 1, dz + 1);
    const [cave, plain] = bestOfBoth(
      16,
      () => lightChunk(lookup),
      () => lightChunk(around(1, 1)),
    );
    console.log(`cave chunk ${cave.toFixed(3)} ms, terrain chunk ${plain.toFixed(3)} ms`);
    expectFasterThan(cave, plain * 4);
  });
});
