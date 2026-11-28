// Dev tool: runs the goal bot through the task book on 4 seeds × 3 terrain shapes (trees
// "Few", generator 4 as new worlds get it) and prints the estimated player minutes per
// task, chapter and level, the dark breaks before a light source (a report, never a
// failure), the radar (with its places from generator 3 on) and, from generator 3 on, the
// walk checks of entrances and the spawn shaft.
// Run: npx vite-node scripts/progressRun.ts [--quick] [--gen 2|3] [--loot]
// (quick: seed 1337 balanced only; --gen: an older generator, for comparisons; --loot: the
// loot run (Phase 8 part B3b) besides the plain run on the same worlds, and their limits)
import { type BotRun, runBot } from '../src/bot/Bot';
import { type CaveCheck, checkCaves, formatCaveChecks } from '../src/bot/caveWalks';
import {
  buildReport,
  compareLoot,
  darkBreakRows,
  formatDarkBreaks,
  formatPlaces,
  formatRadar,
  formatReport,
  type SpawnPlaces,
  spawnPlaces,
} from '../src/bot/report';
import { RADAR_PLACE_FAR_RADIUS } from '../src/game/config';
import { generatedWalkWorld } from '../src/testing/walkWorld';
import { findSpawn } from '../src/world/generation/spawn';
import { getTerrain } from '../src/world/generation/terrain';
import { TerrainV3 } from '../src/world/generation/terrainV3';
import { TERRAIN_SHAPES, type WorldGen } from '../src/world/generation/worldOptions';

const quick = process.argv.includes('--quick');
const loot = process.argv.includes('--loot');
const genIndex = process.argv.indexOf('--gen');
const genArg = genIndex >= 0 ? process.argv[genIndex + 1] : '4';
const version = genArg === '2' ? 2 : genArg === '3' ? 3 : 4;
const seeds = quick ? [1337] : [1, 1337, 42, 2024];
const shapes = quick ? (['balanced'] as const) : TERRAIN_SHAPES;

console.log(`Generator ${version}${loot ? ', plain and loot runs' : ''}`);
const runs: BotRun[] = [];
const lootRuns: BotRun[] = [];
const caves: CaveCheck[] = [];
const places: SpawnPlaces[] = [];
const line = (kind: string, seed: number, terrain: string, run: BotRun, took: string): string =>
  `${kind}seed ${seed} ${terrain}: ${run.completed ? 'complete' : `FAILED: ${run.error}`}, ` +
  `${(run.totalMs / 60000).toFixed(1)} bot min, ${run.actions} actions, ` +
  `${run.broken} broken, light errors ${run.lightErrors}, accidental loots ${run.accidentalLoots} (${took} s)`;
for (const seed of seeds) {
  for (const terrain of shapes) {
    const gen: WorldGen = { version, options: { terrain, trees: 'few' } };
    let start = performance.now();
    const run = runBot(seed, gen);
    console.log(line('', seed, terrain, run, ((performance.now() - start) / 1000).toFixed(1)));
    runs.push(run);
    if (loot) {
      start = performance.now();
      const looted = runBot(seed, gen, { loot: true });
      console.log(
        line('loot ', seed, terrain, looted, ((performance.now() - start) / 1000).toFixed(1)),
      );
      lootRuns.push(looted);
    }
    const terrainSource = getTerrain(seed, gen);
    if (terrainSource instanceof TerrainV3) {
      places.push(spawnPlaces(seed, gen, RADAR_PLACE_FAR_RADIUS));
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
if (loot) {
  console.log('');
  console.log('Loot run:');
  console.log(formatReport(buildReport(lootRuns)));
  console.log('');
  console.log('Loot run, d' + formatDarkBreaks(darkBreakRows(lootRuns), lootRuns.length).slice(1));
  console.log('');
  console.log(compareLoot(runs, lootRuns).markdown);
}
console.log('');
console.log(formatRadar(runs));
if (places.length > 0) {
  console.log('');
  console.log(formatPlaces(runs, places));
}
if (caves.length > 0) {
  console.log('');
  console.log(formatCaveChecks(caves));
}
