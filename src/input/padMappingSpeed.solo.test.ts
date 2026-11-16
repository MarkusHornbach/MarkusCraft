// Cost of the controller mapping per poll. A solo file: it runs with nothing next to it,
// because a wall-clock limit on a busy machine (49 test files side by side) says nothing.
import { describe, it } from 'vitest';
import { expectFasterThan } from '../testing/timing';
import { PadMapper } from './padMapping';

/** A full snapshot: 17 buttons and four axes. */
function snapshot(buttons: Record<number, number>, axes: number[]) {
  const values: number[] = [];
  for (let i = 0; i < 17; i++) values.push(buttons[i] ?? 0);
  return { buttons: values, axes };
}

describe('cost (Phase 5 AC1.6)', () => {
  it('10 000 updates with a full snapshot take less than 20 ms', () => {
    const snapshots = [
      snapshot({ 0: 1, 6: 0.7, 7: 0.4, 10: 1, 12: 1 }, [0.4, -0.9, 1, 0.3]),
      snapshot({ 1: 1, 5: 1, 7: 1, 15: 1 }, [-0.2, 0.6, -0.97, -0.5]),
    ];
    const run = (): number => {
      const mapper = new PadMapper();
      const start = performance.now();
      for (let i = 0; i < 10_000; i++) mapper.update(snapshots[i & 1], 16);
      return performance.now() - start;
    };
    // Warm up, so the first rounds do not measure the compiler; then the best of many.
    for (let round = 0; round < 5; round++) run();
    let best = Infinity;
    for (let round = 0; round < 15; round++) best = Math.min(best, run());
    expectFasterThan(best, 20);
  });
});
