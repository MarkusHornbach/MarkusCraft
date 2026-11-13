// Dev tool: prints statistics of the terrain (heights, water, trees, rock, ores, clay) and
// the generation time with and without the features of generator version 1.
// Run: npx vite-node scripts/terrainStats.ts
import {
  CHUNK_SIZE,
  COAL_MAX_Y,
  COAL_MIN_Y,
  IRON_MAX_Y,
  IRON_MIN_Y,
  SEA_LEVEL,
} from '../src/game/config';
import { Block } from '../src/world/blocks';
import { blockIndex } from '../src/world/chunk';
import { ALL_FEATURES, NO_FEATURES, Terrain } from '../src/world/generation/terrain';

const AREA = 16;
for (const seed of [1, 1337, 987654321, 42, 7]) {
  const t = new Terrain(seed);
  let min = Infinity;
  let max = -Infinity;
  let water = 0;
  let deepWater = 0;
  let clay = 0;
  let trees = 0;
  let grass = 0;
  let rock = 0;
  let land = 0;
  const stone = { coal: 0, iron: 0 };
  const ore = { coal: 0, iron: 0 };
  for (let cz = -AREA / 2; cz < AREA / 2; cz++) {
    for (let cx = -AREA / 2; cx < AREA / 2; cx++) {
      const blocks = t.generateChunk(cx, cz);
      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
        for (let lx = 0; lx < CHUNK_SIZE; lx++) {
          const x = cx * CHUNK_SIZE + lx;
          const z = cz * CHUNK_SIZE + lz;
          const h = t.heightAt(x, z);
          min = Math.min(min, h);
          max = Math.max(max, h);
          if (h < SEA_LEVEL) {
            water++;
            if (SEA_LEVEL - h >= 2) deepWater++;
            if (blocks[blockIndex(lx, h, lz)] === Block.CLAY) clay++;
          } else {
            land++;
            if (t.isRock(x, z)) rock++;
            else if (t.isGrass(x, z)) grass++;
          }
          if (t.treeAt(x, z) > 0) trees++;
          for (let y = 1; y <= h; y++) {
            const id = blocks[blockIndex(lx, y, lz)];
            const rocky = id === Block.STONE || id === Block.COAL_ORE || id === Block.IRON_ORE;
            if (!rocky) continue;
            if (y >= COAL_MIN_Y && y <= COAL_MAX_Y) stone.coal++;
            if (y >= IRON_MIN_Y && y <= IRON_MAX_Y) stone.iron++;
            if (id === Block.COAL_ORE) ore.coal++;
            if (id === Block.IRON_ORE) ore.iron++;
          }
        }
      }
    }
  }
  const total = AREA * AREA * CHUNK_SIZE * CHUNK_SIZE;
  const pct = (a: number, b: number): string => ((a / b) * 100).toFixed(2);
  console.log(
    `seed ${seed}: h ${min}..${max}, water ${pct(water, total)}%, ` +
      `trees/100 grass ${pct(trees, grass)}, rock ${pct(rock, land)}% of land, ` +
      `coal ${pct(ore.coal, stone.coal)}%, iron ${pct(ore.iron, stone.iron)}%, ` +
      `clay ${pct(clay, water)}% of underwater columns (${pct(deepWater, water)}% deep enough)`,
  );
}

// Generation time of a contiguous area, as the game loads it.
const terrain = new Terrain(5);
const time = (features: typeof ALL_FEATURES): number => {
  let best = Infinity;
  for (let round = 0; round < 7; round++) {
    const start = performance.now();
    for (let cz = 0; cz < 8; cz++)
      for (let cx = 0; cx < 8; cx++) terrain.generateChunk(cx, cz, features);
    best = Math.min(best, (performance.now() - start) / 64);
  }
  return best;
};
time(ALL_FEATURES);
const plain = time(NO_FEATURES);
const full = time(ALL_FEATURES);
console.log(
  `generation: Phase 1 terrain ${plain.toFixed(3)} ms/chunk, version 1 ${full.toFixed(3)} ms/chunk ` +
    `(+${((full / plain - 1) * 100).toFixed(1)} %)`,
);
