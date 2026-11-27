// Dev tool: runs the goal bot through the task book on 4 seeds × 3 terrain shapes (trees
// "Few", generator 2) and prints the estimated player minutes per task, chapter and level,
// then the dark breaks before a light source (a report, never a failure) and the radar.
// Run: npx vite-node scripts/progressRun.ts [--quick] (quick: seed 1337 balanced only)
import { runBot } from '../src/bot/Bot';
import {
  buildReport,
  darkBreakRows,
  formatDarkBreaks,
  formatRadar,
  formatReport,
} from '../src/bot/report';
import { TERRAIN_SHAPES } from '../src/world/generation/worldOptions';

const quick = process.argv.includes('--quick');
const seeds = quick ? [1337] : [1, 1337, 42, 2024];
const shapes = quick ? (['balanced'] as const) : TERRAIN_SHAPES;

const runs = [];
for (const seed of seeds) {
  for (const terrain of shapes) {
    const start = performance.now();
    const run = runBot(seed, { version: 2, options: { terrain, trees: 'few' } });
    const took = ((performance.now() - start) / 1000).toFixed(1);
    console.log(
      `seed ${seed} ${terrain}: ${run.completed ? 'complete' : `FAILED: ${run.error}`}, ` +
        `${(run.totalMs / 60000).toFixed(1)} bot min, ${run.actions} actions, ` +
        `${run.broken} broken, light errors ${run.lightErrors} (${took} s)`,
    );
    runs.push(run);
  }
}
console.log('');
console.log(formatReport(buildReport(runs)));
console.log('');
console.log(formatDarkBreaks(darkBreakRows(runs), runs.length));
console.log('');
console.log(formatRadar(runs));
