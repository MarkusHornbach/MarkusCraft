// Dev tool: measures generation, light and meshing speed in Node.
// Run: npx vite-node scripts/perf.ts
import { CHUNK_SIZE } from '../src/game/config';
import { Block } from '../src/world/blocks';
import { ChunkManager } from '../src/world/ChunkManager';
import { createChunk } from '../src/world/chunk';
import { generateChunk } from '../src/world/generation/terrain';
import { CLASSIC_GEN } from '../src/world/generation/worldOptions';
import { lightChunk } from '../src/world/light/lightChunk';
import { meshChunk } from '../src/world/meshing/mesher';
import { mulberry32, randInt } from '../src/util/rng';
import { World } from '../src/world/World';

const SEED = 1337;
const N = 8;
const ROUNDS = 5;

/** Best of a few rounds, per chunk: the first round also warms the code up. */
function best(run: () => void, chunks: number): number {
  let time = Infinity;
  for (let round = 0; round < ROUNDS; round++) {
    const start = performance.now();
    run();
    time = Math.min(time, performance.now() - start);
  }
  return time / chunks;
}

const blocks = new Map<string, Uint8Array>();
const generation = best(
  () => {
    for (let cz = -2; cz <= N + 1; cz++) {
      for (let cx = -2; cx <= N + 1; cx++) {
        blocks.set(`${cx},${cz}`, generateChunk(SEED, cx, cz, CLASSIC_GEN));
      }
    }
  },
  (N + 4) ** 2,
);
const blocksAt = (cx: number, cz: number) => blocks.get(`${cx},${cz}`) ?? null;

const lights = new Map<string, Uint8Array>();
const lighting = best(
  () => {
    for (let cz = -1; cz <= N; cz++) {
      for (let cx = -1; cx <= N; cx++) {
        lights.set(
          `${cx},${cz}`,
          lightChunk((dx, dz) => blocksAt(cx + dx, cz + dz)),
        );
      }
    }
  },
  (N + 2) ** 2,
);
const lightAt = (cx: number, cz: number) => lights.get(`${cx},${cz}`) ?? null;

let triangles = 0;
const meshAll = (withLight: boolean) => () => {
  triangles = 0;
  for (let cz = 0; cz < N; cz++) {
    for (let cx = 0; cx < N; cx++) {
      const data = meshChunk(
        blocks.get(`${cx},${cz}`) as Uint8Array,
        (dx, dz) => blocksAt(cx + dx, cz + dz),
        withLight ? (dx, dz) => lightAt(cx + dx, cz + dz) : undefined,
      );
      triangles +=
        (data.opaque.indices.length +
          data.cutout.indices.length +
          data.translucent.indices.length) /
        3;
    }
  }
};
const meshingPlain = best(meshAll(false), N * N);
const meshingLit = best(meshAll(true), N * N);

for (const radius of [4, 8]) {
  const world = new World(SEED);
  const manager = new ChunkManager(world, { onMesh: () => {}, onUnload: () => {} }, radius);
  manager.setCenter(0, 0);
  const start = performance.now();
  while (manager.pending > 0) manager.update(() => performance.now(), 1000);
  const { generate, light, mesh } = manager.jobs;
  let bytes = 0;
  for (const chunk of world.allChunks()) bytes += chunk.blocks.length + (chunk.light?.length ?? 0);
  console.log(
    `render distance ${radius}: ${generate} chunks generated, ${light} lit, ${mesh} meshed in ` +
      `${(performance.now() - start).toFixed(0)} ms; ` +
      `${(bytes / 1024 / 1024).toFixed(1)} MB of blocks and light`,
  );
}
console.log(`generation: ${generation.toFixed(2)} ms/chunk`);
console.log(`light from scratch: ${lighting.toFixed(2)} ms/chunk`);
console.log(
  `meshing: ${meshingPlain.toFixed(2)} ms/chunk without light, ${meshingLit.toFixed(2)} ms/chunk ` +
    `with light, ${(triangles / (N * N)).toFixed(0)} triangles/chunk`,
);

// Single edits (Phase 4 AC2.6): random blocks set and removed around the surface near
// the origin, and the roof of a dark hall of 31 × 31 × 4 cells opened in its middle.
{
  const world = new World(SEED);
  for (let cz = -2; cz <= 2; cz++) for (let cx = -2; cx <= 2; cx++) world.generate(cx, cz);
  for (let cz = -1; cz <= 1; cz++) for (let cx = -1; cx <= 1; cx++) world.light(cx, cz);
  const rng = mulberry32(1);
  const edits: [number, number, number, number][] = [];
  for (let i = 0; i < 2000; i++) {
    const x = randInt(rng, CHUNK_SIZE);
    const z = randInt(rng, CHUNK_SIZE);
    const y = world.surfaceY(x, z) - 3 + randInt(rng, 8);
    edits.push([x, y, z, rng() < 0.5 ? Block.AIR : Block.STONE]);
  }
  let worst = 0;
  const start = performance.now();
  for (const [x, y, z, id] of edits) {
    const before = performance.now();
    world.setBlock(x, y, z, id);
    worst = Math.max(worst, performance.now() - before);
  }
  const average = (performance.now() - start) / edits.length;
  console.log(
    `light update of an edit: ${average.toFixed(4)} ms on average, ${worst.toFixed(3)} ms at worst ` +
      `(${edits.length} edits at the surface)`,
  );
}
{
  const world = new World(1);
  for (let cz = 0; cz < 5; cz++) {
    for (let cx = 0; cx < 5; cx++) {
      const data = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE * 128);
      // Ground up to y = 10, and a slab of stone above it that holds the hall.
      data.fill(Block.STONE, 0, 256 * 11);
      for (let i = 0; i < 256 * 5; i++) {
        const x = cx * CHUNK_SIZE + (i & 15);
        const z = cz * CHUNK_SIZE + ((i >> 4) & 15);
        const y = 11 + (i >> 8);
        const inHall = y < 15 && x >= 25 && x <= 55 && z >= 25 && z <= 55;
        const inSlab = x >= 24 && x <= 56 && z >= 24 && z <= 56;
        if (inSlab && !inHall) data[i + 256 * 11] = Block.STONE;
      }
      world.addChunk(createChunk(cx, cz, data));
    }
  }
  for (let cz = 1; cz <= 3; cz++) for (let cx = 1; cx <= 3; cx++) world.light(cx, cz);
  let open = Infinity;
  for (let round = 0; round < 10; round++) {
    const start = performance.now();
    world.setBlock(40, 15, 40, Block.AIR);
    open = Math.min(open, performance.now() - start);
    world.setBlock(40, 15, 40, Block.STONE);
  }
  console.log(`light update of the worst edit tested (roof of a dark hall): ${open.toFixed(3)} ms`);
}
