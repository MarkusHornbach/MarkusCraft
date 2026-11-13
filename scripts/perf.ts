// Dev tool: measures generation and meshing speed in Node. Run: npx vite-node scripts/perf.ts
import { GENERATOR_VERSION } from '../src/game/config';
import { ChunkManager } from '../src/world/ChunkManager';
import { generateChunk } from '../src/world/generation/terrain';
import { meshChunk } from '../src/world/meshing/mesher';
import { World } from '../src/world/World';

const SEED = 1337;
const N = 8;
const chunks = new Map<string, Uint8Array>();
let start = performance.now();
for (let cz = -1; cz <= N; cz++) {
  for (let cx = -1; cx <= N; cx++)
    chunks.set(`${cx},${cz}`, generateChunk(SEED, cx, cz, GENERATOR_VERSION));
}
const generation = (performance.now() - start) / chunks.size;

start = performance.now();
let triangles = 0;
for (let cz = 0; cz < N; cz++) {
  for (let cx = 0; cx < N; cx++) {
    const data = meshChunk(
      chunks.get(`${cx},${cz}`) as Uint8Array,
      (dx, dz) => chunks.get(`${cx + dx},${cz + dz}`) ?? null,
    );
    triangles +=
      (data.opaque.indices.length + data.cutout.indices.length + data.translucent.indices.length) /
      3;
  }
}
const meshing = (performance.now() - start) / (N * N);

for (const radius of [4, 8]) {
  const world = new World(SEED);
  const manager = new ChunkManager(world, { onMesh: () => {}, onUnload: () => {} }, radius);
  manager.setCenter(0, 0);
  start = performance.now();
  while (manager.pending > 0) manager.update(() => performance.now(), 1000);
  console.log(
    `render distance ${radius}: ${manager.loaded} chunks generated + meshed in ` +
      `${(performance.now() - start).toFixed(0)} ms`,
  );
}
console.log(`generation: ${generation.toFixed(2)} ms/chunk`);
console.log(
  `meshing: ${meshing.toFixed(2)} ms/chunk, ${(triangles / (N * N)).toFixed(0)} triangles/chunk`,
);
