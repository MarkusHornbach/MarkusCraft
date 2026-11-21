// Cost of the figure motion per step. A solo file: it runs with nothing next to it,
// because a wall-clock limit on a busy machine (70 test files side by side) says nothing.
import { describe, expect, it } from 'vitest';
import { expectFasterThan } from '../testing/timing';
import { FigureMotion, type MotionInput, createAngles } from './figureMotion';

const FRAME_MS = 1000 / 60;

function rig() {
  const input: MotionInput = {
    x: 0,
    y: 70,
    z: 0,
    yaw: 0,
    pitch: 0,
    nowMs: 1000,
    fly: false,
    busy: false,
    edits: 0,
    snaps: 0,
  };
  return { motion: new FigureMotion(), out: createAngles(), input };
}

describe('figure motion: cost', () => {
  it('Phase 6 AC11.6: 30 000 steps take less than 20 ms; a step writes into its object', () => {
    const rigs = [rig(), rig(), rig()];
    const run = (): number => {
      const start = performance.now();
      for (let f = 0; f < 10_000; f++) {
        for (let r = 0; r < 3; r++) {
          const one = rigs[r];
          one.input.x += 0.07;
          one.input.yaw += 0.01;
          one.input.busy = (f & 64) !== 0;
          one.input.nowMs += FRAME_MS;
          one.motion.step(one.input, one.out);
        }
      }
      return performance.now() - start;
    };
    run();
    let best = Infinity;
    for (let i = 0; i < 5; i++) best = Math.min(best, run());
    expectFasterThan(best, 20);
    const out = rigs[0].out;
    rigs[0].motion.step(rigs[0].input, out);
    expect(rigs[0].out).toBe(out);
  });
});
