// Dev tool: runs the goal bot through the task book on 4 seeds × 3 terrain shapes (trees
// "Few", generator 3 as new worlds get it) and prints the estimated player minutes per
// task, chapter and level, the dark breaks before a light source (a report, never a
// failure), the radar and, on generator 3, the walk checks of entrances and the spawn shaft.
// Run: npx vite-node scripts/progressRun.ts [--quick] [--gen 2]
// (quick: seed 1337 balanced only; --gen 2: generator 2, for the comparison)
import { runBot } from '../src/bot/Bot';
import { type CaveCheck, checkCaves, formatCaveChecks } from '../src/bot/caveWalks';
import {
  buildReport,
  darkBreakRows,
  formatDarkBreaks,
  formatRadar,
  formatReport,
} from '../src/bot/report';
import { generatedWalkWorld } from '../src/testing/walkWorld';
import { findSpawn } from '../src/world/generation/spawn';
import { getTerrain } from '../src/world/generation/terrain';
import { TerrainV3 } from '../src/world/generation/terrainV3';
import { TERRAIN_SHAPES, type WorldGen } from '../src/world/generation/worldOptions';

const quick = process.argv.includes('--quick');
const genIndex = process.argv.indexOf('--gen');
const version = genIndex >= 0 && process.argv[genIndex + 1] === '2' ? 2 : 3;
const seeds = quick ? [1337] : [1, 1337, 42, 2024];
const shapes = quick ? (['balanced'] as const) : TERRAIN_SHAPES;

console.log(`Generator ${version}`);
const runs = [];
const caves: CaveCheck[] = [];
for (const seed of seeds) {
  for (const terrain of shapes) {
    const gen: WorldGen = { version, options: { terrain, trees: 'few' } };
    const start = performance.now();
    const run = runBot(seed, gen);
    const took = ((performance.now() - start) / 1000).toFixed(1);
    console.log(
      `seed ${seed} ${terrain}: ${run.completed ? 'complete' : `FAILED: ${run.error}`}, ` +
        `${(run.totalMs / 60000).toFixed(1)} bot min, ${run.actions} actions, ` +
        `${run.broken} broken, light errors ${run.lightErrors} (${took} s)`,
    );
    runs.push(run);
    const terrainSource = getTerrain(seed, gen);
    if (terrainSource instanceof TerrainV3) {
      const spawn = findSpawn(terrainSource);
      const r = 96;
      const entrances = terrainSource.caves
        .shapesIn(spawn.x - r, spawn.z - r, spawn.x + r, spawn.z + r)
        .filter(
          (s) => s.kind === 'entrance' && Math.hypot(s.startX - spawn.x, s.startZ - spawn.z) <= r,
        );
      const { walk } = generatedWalkWorld(seed, gen);
      caves.push(
        checkCaves(walk, spawn, entrances, terrainSource.shafts.spawnShaft(), terrainSource),
      );
    }
  }
}
console.log('');
console.log(formatReport(buildReport(runs)));
console.log('');
console.log(formatDarkBreaks(darkBreakRows(runs), runs.length));
console.log('');
console.log(formatRadar(runs));
if (caves.length > 0) {
  console.log('');
  console.log(formatCaveChecks(caves));
}
