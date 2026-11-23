// Dev tool: terrain statistics per generator preset (plains, water, beach, high land, rock,
// trees, open land, ores, clay) over the plan's seeds, and the generation time.
// Run: npx vite-node scripts/terrainStats.ts [--quick] (quick: 3 seeds, no ores)
import { ALL_FEATURES, NO_FEATURES, Terrain, getTerrain } from '../src/world/generation/terrain';
import { TerrainV2 } from '../src/world/generation/terrainV2';
import {
  CLASSIC_GEN,
  TERRAIN_SHAPES,
  TREE_DENSITIES,
  type WorldGen,
} from '../src/world/generation/worldOptions';
import {
  MEASURED_HALF,
  MEASURED_SEEDS,
  type TerrainCounts,
  addCounts,
  emptyCounts,
  measureTerrain,
  sharesOf,
} from '../src/testing/terrainMeasure';

const quick = process.argv.includes('--quick');
const seeds = quick ? MEASURED_SEEDS.slice(0, 3) : MEASURED_SEEDS;

const presets: { name: string; gen: WorldGen; ores: boolean }[] = [
  { name: 'v1', gen: CLASSIC_GEN, ores: !quick },
];
for (const terrain of TERRAIN_SHAPES) {
  for (const trees of TREE_DENSITIES) {
    presets.push({
      name: `${terrain}/${trees}`,
      gen: { version: 2, options: { terrain, trees } },
      ores: !quick && trees === 'normal',
    });
  }
}

const f = (n: number, digits = 1): string => n.toFixed(digits).padStart(6);
console.log(
  `${seeds.length} seeds, ${MEASURED_HALF * 2} × ${MEASURED_HALF * 2} columns each\n` +
    'preset            plains  water  beach   high   rock  tr/1k   open   coal   iron   clay  ' +
    'plains per seed (min)',
);
for (const preset of presets) {
  const total = emptyCounts();
  let minPlains = Infinity;
  for (const seed of seeds) {
    const counts: TerrainCounts = measureTerrain(
      getTerrain(seed, preset.gen),
      MEASURED_HALF,
      preset.ores,
    );
    minPlains = Math.min(minPlains, sharesOf(counts).plains);
    addCounts(total, counts);
  }
  const s = sharesOf(total);
  const ores = preset.ores
    ? `${f(s.coal, 2)} ${f(s.iron, 2)} ${f(s.clay)}`
    : '     -      -      -';
  console.log(
    `${preset.name.padEnd(16)} ${f(s.plains)} ${f(s.water)} ${f(s.beach)} ${f(s.high)} ` +
      `${f(s.rock)} ${f(s.treesPer1000)} ${f(s.open)} ${ores}  ${f(minPlains)}`,
  );
}

// Generation time of a contiguous area, as the game loads it: fresh generators each round,
// the three in turn, the best round of each counts.
type Gen = (cx: number, cz: number) => Uint8Array;
const makers: Record<string, () => Gen> = {
  plain: () => {
    const t = new Terrain(5);
    return (cx, cz) => t.generateChunk(cx, cz, NO_FEATURES);
  },
  v1: () => {
    const t = new Terrain(5);
    return (cx, cz) => t.generateChunk(cx, cz, ALL_FEATURES);
  },
  v2: () => {
    const t = new TerrainV2(5, { terrain: 'balanced', trees: 'normal' });
    return (cx, cz) => t.generateChunk(cx, cz);
  },
};
const best: Record<string, number> = { plain: Infinity, v1: Infinity, v2: Infinity };
for (let round = 0; round < 100; round++) {
  for (const [name, make] of Object.entries(makers)) {
    const generate = make();
    const start = performance.now();
    for (let cz = 0; cz < 7; cz++) for (let cx = 0; cx < 7; cx++) generate(cx, cz);
    best[name] = Math.min(best[name], (performance.now() - start) / 49);
  }
}
console.log(
  `generation: Phase 1 terrain ${best.plain.toFixed(3)} ms/chunk, version 1 ${best.v1.toFixed(3)}, ` +
    `version 2 balanced/normal ${best.v2.toFixed(3)} ` +
    `(${((best.v2 / best.v1 - 1) * 100).toFixed(1)} % vs version 1)`,
);
