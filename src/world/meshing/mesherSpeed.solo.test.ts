// Meshing with light against meshing without. A solo file: it runs with nothing next to
// it, because a busy machine shifts the two times against each other.
import { describe, it } from 'vitest';
import { expectFasterThan } from '../../testing/timing';
import { World } from '../World';
import { type ChunkMeshData, meshChunk } from './mesher';

function meshOf(world: World, cx: number, cz: number, withLight: boolean): ChunkMeshData {
  const center = world.getChunk(cx, cz);
  if (!center) throw new Error('chunk missing');
  const blocks = (dx: number, dz: number) => world.getChunk(cx + dx, cz + dz)?.blocks ?? null;
  if (!withLight) return meshChunk(center.blocks, blocks);
  return meshChunk(
    center.blocks,
    blocks,
    (dx, dz) => world.getChunk(cx + dx, cz + dz)?.light ?? null,
  );
}

/** The terrain of seed 1337 around the origin: chunks -3..4 generated, -2..3 lit. */
function terrainWorld(): World {
  const world = new World(1337);
  for (let cz = -3; cz <= 4; cz++) for (let cx = -3; cx <= 4; cx++) world.generate(cx, cz);
  for (let cz = -2; cz <= 3; cz++) for (let cx = -2; cx <= 3; cx++) world.light(cx, cz);
  return world;
}

/** Share of extra time that meshing with light may take (see the test below). */
const LIMIT = 1.375;

describe('light in the mesh: speed (Phase 4 step 3)', () => {
  // The plan's limit was 25 %. Measured: 17–19 % on one machine, 20–25 % on another, where
  // the limit failed every few runs. The plan's fallback for that case is to relax the
  // limit by half and to record it (docs/phase-4a-report.md, deviation 18).
  it('AC3.4: meshing with light takes at most 37.5 % longer than without', () => {
    const world = terrainWorld();
    const round = (withLight: boolean): number => {
      const start = performance.now();
      for (let cz = -1; cz <= 2; cz++) {
        for (let cx = -1; cx <= 2; cx++) meshOf(world, cx, cz, withLight);
      }
      return (performance.now() - start) / 16;
    };
    // Warm both paths up first: the comparison is about optimised code.
    for (let i = 0; i < 6; i++) {
      round(true);
      round(false);
    }
    // The two take turns, so a busy moment of the machine hits both; the best round of
    // each counts. Now and then a whole measurement comes out slow on one side: then it
    // is taken again, up to three times.
    let plain = Infinity;
    let lit = Infinity;
    for (let attempt = 0; attempt < 3; attempt++) {
      for (let i = 0; i < 12; i++) {
        plain = Math.min(plain, round(false));
        lit = Math.min(lit, round(true));
      }
      if (lit < plain * LIMIT) break;
    }
    console.log(
      `meshing: ${plain.toFixed(3)} ms/chunk without light, ${lit.toFixed(3)} ms/chunk with light`,
    );
    expectFasterThan(lit, plain * LIMIT);
  });
});
