// Dev tool: where the time of an edit goes, on the route of the performance test's `edit`
// scenario (seed 1337, corner of four chunks). Run it bundled (see docs/phase-4-edit-cost.md);
// an optional argument replaces the chunk budget in ms, e.g. 0.6 to act like a device ten
// times slower than this one.
import { BENCH_SEED, CHUNK_BUDGET_MS } from '../src/game/config';
import { EDIT_CELLS, EDIT_HOVER } from '../src/bench/scenarios';
import { Block } from '../src/world/blocks';
import { ChunkManager } from '../src/world/ChunkManager';
import { World } from '../src/world/World';

const RADIUS = 5;
const ROUNDS = 5;
const BUDGET = Number(process.argv[2] ?? CHUNK_BUDGET_MS);
const y = EDIT_HOVER.y - 2;
const edits = [
  ...EDIT_CELLS.map((c) => ({ ...c, id: Block.STONE })),
  ...[...EDIT_CELLS].reverse().map((c) => ({ ...c, id: Block.AIR })),
];

interface Sample {
  light: number;
  direct: number;
  directN: number;
  urgent: number;
  urgentN: number;
  frame: number;
  frameMeshes: number;
}
const best: Sample[] = edits.map(() => ({
  light: 1e9,
  direct: 1e9,
  directN: 0,
  urgent: 1e9,
  urgentN: 0,
  frame: 1e9,
  frameMeshes: 0,
}));
let meshCount = 0;

for (let round = 0; round < ROUNDS; round++) {
  const world = new World(BENCH_SEED);
  const manager = new ChunkManager(
    world,
    { onMesh: () => meshCount++, onUnload: () => {} },
    RADIUS,
  );
  manager.setCenter(0, 0);
  while (manager.pending > 0) manager.update(() => performance.now(), 1000);
  edits.forEach((e, i) => {
    const t0 = performance.now();
    world.setBlock(e.x, y, e.z, e.id);
    const t1 = performance.now();
    const before = meshCount;
    // As `Game` does it: the edited block's chunk at once, its neighbours queued.
    manager.remeshAfterEdit(e.x, e.z);
    const t2 = performance.now();
    const direct = meshCount - before;
    // The rest of the edit's frame gets what is left of the budget, then the next frames.
    let firstFrame = 0;
    let frameMeshes = direct;
    const left = BUDGET - (t2 - t0);
    if (left > 0 && manager.relight > 0) {
      const s = performance.now();
      manager.update(() => performance.now(), left);
      firstFrame = performance.now() - s;
      frameMeshes = meshCount - before;
    }
    while (manager.relight > 0) manager.update(() => performance.now(), BUDGET);
    const t3 = performance.now();
    const b = best[i];
    b.light = Math.min(b.light, t1 - t0);
    b.direct = Math.min(b.direct, t2 - t1);
    b.directN = direct;
    b.urgent = Math.min(b.urgent, t3 - t2);
    b.urgentN = meshCount - before - direct;
    b.frame = Math.min(b.frame, t2 - t0 + firstFrame);
    b.frameMeshes = frameMeshes;
  });
}

const sum = (f: (s: Sample) => number) => best.reduce((a, s) => a + f(s), 0);
const max = (f: (s: Sample) => number) => Math.max(...best.map(f));
const n = best.length;
const meshMs = sum((s) => s.direct) / sum((s) => s.directN);
console.log(`${n} edits, best of ${ROUNDS} rounds, render distance ${RADIUS}, budget ${BUDGET} ms`);
console.log(
  `light update:   avg ${(sum((s) => s.light) / n).toFixed(2)} ms, max ${max((s) => s.light).toFixed(2)} ms`,
);
console.log(
  `direct remesh:  avg ${(sum((s) => s.direct) / n).toFixed(2)} ms, max ${max((s) => s.direct).toFixed(2)} ms, ` +
    `chunks per edit avg ${(sum((s) => s.directN) / n).toFixed(2)}, ${meshMs.toFixed(2)} ms per chunk mesh`,
);
console.log(
  `urgent remesh:  avg ${(sum((s) => s.urgent) / n).toFixed(2)} ms, max ${max((s) => s.urgent).toFixed(2)} ms, ` +
    `chunks per edit avg ${(sum((s) => s.urgentN) / n).toFixed(2)}, max ${max((s) => s.urgentN)}`,
);
console.log(
  `edit frame (light + direct + rest of the budget): avg ${(sum((s) => s.frame) / n).toFixed(2)} ms, max ${max((s) => s.frame).toFixed(2)} ms`,
);
const hist = new Map<number, number>();
for (const s of best) hist.set(s.frameMeshes, (hist.get(s.frameMeshes) ?? 0) + 1);
console.log(
  `edits by chunks meshed in their frame: ${[...hist]
    .sort()
    .map(([k, v]) => `${k}→${v}`)
    .join(', ')}`,
);
const total = (s: Sample) => s.light + s.direct + s.urgent;
console.log(
  `total chunk work per edit: avg ${(sum(total) / n).toFixed(2)} ms; share light ${((100 * sum((s) => s.light)) / sum(total)).toFixed(0)} %, direct ${((100 * sum((s) => s.direct)) / sum(total)).toFixed(0)} %, urgent ${((100 * sum((s) => s.urgent)) / sum(total)).toFixed(0)} %`,
);
