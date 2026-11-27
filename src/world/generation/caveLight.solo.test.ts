// Phase 8B2a AC2.3: light and meshing per chunk of generator 3 against generator 2. A solo
// file: two times with a tight ratio, both warmed up, the best of many rounds in turn.
import { describe, it } from 'vitest';
import { TIMING_ENFORCED, expectFasterThan } from '../../testing/timing';
import { lightChunk } from '../light/lightChunk';
import { meshChunk } from '../meshing/mesher';
import { World } from '../World';
import type { WorldGen } from './worldOptions';

const SEEDS = [1, 42, 1337, 2024];
const OPTIONS = { terrain: 'balanced', trees: 'few' } as const;
/** Under coverage the limits are not checked: one round runs the code. */
const WARMUP = TIMING_ENFORCED ? 5 : 0;
const ROUNDS = TIMING_ENFORCED ? 20 : 1;

/** Chunks -3..4 generated, -2..3 lit, around the origin. */
function worldOf(seed: number, gen: WorldGen): World {
  const world = new World(seed, gen);
  for (let cz = -3; cz <= 4; cz++) for (let cx = -3; cx <= 4; cx++) world.generate(cx, cz);
  for (let cz = -2; cz <= 3; cz++) for (let cx = -2; cx <= 3; cx++) world.light(cx, cz);
  return world;
}

function time(run: () => void): number {
  const start = performance.now();
  run();
  return performance.now() - start;
}

function compare(label: string, work: (world: World, cx: number, cz: number) => void): void {
  const twos = SEEDS.map((seed) => worldOf(seed, { version: 2, options: OPTIONS }));
  const threes = SEEDS.map((seed) => worldOf(seed, { version: 3, options: OPTIONS }));
  const all = (worlds: World[]) => () => {
    for (const world of worlds) {
      for (let cz = -1; cz <= 2; cz++) for (let cx = -1; cx <= 2; cx++) work(world, cx, cz);
    }
  };
  const a = all(twos);
  const b = all(threes);
  for (let i = 0; i < WARMUP; i++) {
    a();
    b();
  }
  let two = Infinity;
  let three = Infinity;
  for (let i = 0; i < ROUNDS; i++) {
    two = Math.min(two, time(a));
    three = Math.min(three, time(b));
  }
  const per = (ms: number): string => (ms / (16 * SEEDS.length)).toFixed(3);
  console.log(
    `${label} per chunk: generator 2 ${per(two)} ms, generator 3 ${per(three)} ms (${(three / two).toFixed(2)} ×)`,
  );
  expectFasterThan(three, two * 1.5);
}

describe('cave cost: light and meshing', () => {
  it('Phase 8B2a AC2.3 light per chunk at most 1.5 × generator 2', () => {
    compare('light', (world, cx, cz) => {
      lightChunk((dx, dz) => world.getChunk(cx + dx, cz + dz)?.blocks ?? null, world.lightTables);
    });
  });

  it('Phase 8B2a AC2.3 meshing with light per chunk at most 1.5 × generator 2', () => {
    compare('meshing', (world, cx, cz) => {
      const center = world.getChunk(cx, cz);
      if (!center) return;
      meshChunk(
        center.blocks,
        (dx, dz) => world.getChunk(cx + dx, cz + dz)?.blocks ?? null,
        (dx, dz) => world.getChunk(cx + dx, cz + dz)?.light ?? null,
      );
    });
  });
});
