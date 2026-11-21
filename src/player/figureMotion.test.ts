// Phase 6 part D: the motion rule of other players' figures.
import { describe, expect, it } from 'vitest';
import { FIGURE_HEAD_YAW_MAX, FIGURE_LEG_SWING, FIGURE_SWING_MS, WALK_SPEED } from '../game/config';
import { expectFasterThan } from '../testing/timing';
import { mulberry32 } from '../util/rng';
import {
  type FigureAngles,
  FigureMotion,
  type MotionInput,
  createAngles,
  wrapAngle,
} from './figureMotion';

const FRAME_MS = 1000 / 60;

/** A figure driven frame by frame; `walk` moves it at a speed in a direction. */
class Rig {
  readonly motion = new FigureMotion();
  readonly out: FigureAngles = createAngles();
  readonly input: MotionInput = {
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

  frame(ms = FRAME_MS): FigureAngles {
    this.input.nowMs += ms;
    this.motion.step(this.input, this.out);
    return this.out;
  }

  /** Frames of walking at `speed` towards `direction` (a yaw), with a callback per frame. */
  walk(frames: number, speed: number, direction: number, each?: (a: FigureAngles) => void): void {
    for (let i = 0; i < frames; i++) {
      this.input.x += (-Math.sin(direction) * speed * FRAME_MS) / 1000;
      this.input.z += (-Math.cos(direction) * speed * FRAME_MS) / 1000;
      const angles = this.frame();
      each?.(angles);
    }
  }
}

const LIMBS = ['leftArm', 'rightArm', 'leftLeg', 'rightLeg'] as const;

/** Frames from one upward zero crossing of `pick` to the next, averaged over a run. */
function period(
  rig: Rig,
  frames: number,
  pick: (a: FigureAngles) => number,
  speed: number,
): number {
  const ups: number[] = [];
  let last = pick(rig.out);
  let frame = 0;
  rig.walk(frames, speed, 0, (a) => {
    frame++;
    const now = pick(a);
    if (last < 0 && now >= 0) ups.push(frame);
    last = now;
  });
  return (ups[ups.length - 1] - ups[0]) / (ups.length - 1);
}

describe('figure motion: walking', () => {
  it('Phase 6 AC11.3: a figure standing still has all limb angles 0', () => {
    const rig = new Rig();
    for (let i = 0; i < 60; i++) rig.frame();
    for (const limb of LIMBS) expect(rig.out[limb]).toBe(0);
  });

  it('Phase 6 AC11.3: legs swing in opposite directions with the right amplitude', () => {
    const rig = new Rig();
    rig.walk(60, WALK_SPEED, 0);
    let max = 0;
    rig.walk(120, WALK_SPEED, 0, (a) => {
      expect(Math.sign(a.leftLeg)).toBe(-Math.sign(a.rightLeg));
      // The arms swing against the legs.
      if (a.leftLeg !== 0) expect(Math.sign(a.leftArm)).toBe(-Math.sign(a.leftLeg));
      max = Math.max(max, Math.abs(a.leftLeg));
    });
    expect(max).toBeGreaterThanOrEqual(0.8 * FIGURE_LEG_SWING);
    expect(max).toBeLessThanOrEqual(FIGURE_LEG_SWING);
    for (const speed of [WALK_SPEED * 2, WALK_SPEED * 4, 30]) {
      const fast = new Rig();
      fast.walk(240, speed, 0, (a) => {
        expect(Math.abs(a.leftLeg)).toBeLessThanOrEqual(FIGURE_LEG_SWING + 1e-9);
      });
    }
  });

  it('Phase 6 AC11.3: the step period halves when the speed doubles', () => {
    const slow = new Rig();
    slow.walk(30, WALK_SPEED / 2, 0);
    const fast = new Rig();
    fast.walk(30, WALK_SPEED, 0);
    const p1 = period(slow, 600, (a) => a.leftLeg, WALK_SPEED / 2);
    const p2 = period(fast, 600, (a) => a.leftLeg, WALK_SPEED);
    expect(p2 / p1).toBeGreaterThan(0.47);
    expect(p2 / p1).toBeLessThan(0.53);
  });

  it('Phase 6 AC11.3: after stopping all limbs rest within 200 ms', () => {
    for (let start = 30; start < 60; start += 7) {
      const rig = new Rig();
      rig.walk(start, WALK_SPEED, 0.4);
      for (let t = 0; t < 200 - 1e-6; t += FRAME_MS) rig.frame();
      for (const limb of LIMBS) expect(Math.abs(rig.out[limb])).toBeLessThan(0.01);
    }
  });

  it('a teleport (a snap of the drawn pose) gives no swing either', () => {
    const rig = new Rig();
    rig.frame();
    rig.input.x += 3;
    rig.input.snaps = 1;
    for (let i = 0; i < 30; i++) {
      const a = rig.frame();
      for (const limb of LIMBS) expect(a[limb]).toBe(0);
    }
  });

  it('Phase 6 AC11.3: a snap of 20 blocks gives no swing', () => {
    const rig = new Rig();
    rig.frame();
    rig.input.x += 20;
    for (let i = 0; i < 30; i++) {
      const a = rig.frame();
      for (const limb of LIMBS) expect(a[limb]).toBe(0);
    }
  });
});

describe('figure motion: head and body', () => {
  it('Phase 6 AC11.4: the head is never more than 45° off the body', () => {
    const rng = mulberry32(11);
    for (let run = 0; run < 10_000; run++) {
      const rig = new Rig();
      for (let f = 0; f < 6; f++) {
        rig.input.yaw = wrapAngle(rig.input.yaw + (rng() - 0.5) * 4);
        rig.input.pitch = (rng() - 0.5) * 3;
        rig.input.x += (rng() - 0.5) * 0.6;
        rig.input.z += (rng() - 0.5) * 0.6;
        rig.input.fly = rng() < 0.2;
        const a = rig.frame(rng() * 40);
        expect(Math.abs(a.headYaw)).toBeLessThanOrEqual(FIGURE_HEAD_YAW_MAX + 1e-9);
        expect(Math.abs(wrapAngle(a.bodyYaw + a.headYaw - rig.input.yaw))).toBeLessThan(1e-9);
      }
    }
  });

  it('Phase 6 AC11.4: standing, a 30° turn leaves the body; 90° turns it until 45° remain', () => {
    const rig = new Rig();
    rig.frame();
    rig.input.yaw = Math.PI / 6;
    for (let i = 0; i < 60; i++) rig.frame();
    expect(rig.out.bodyYaw).toBeCloseTo(0, 9);
    expect(rig.out.headYaw).toBeCloseTo(Math.PI / 6, 9);
    rig.input.yaw = Math.PI / 2;
    for (let i = 0; i < 60; i++) rig.frame();
    expect(rig.out.bodyYaw).toBeCloseTo(Math.PI / 4, 9);
    expect(rig.out.headYaw).toBeCloseTo(Math.PI / 4, 9);
    expect(rig.out.headPitch).toBe(0);
  });

  it('Phase 6 AC11.4: walking, the body faces the walking direction within 0.5 s', () => {
    const rig = new Rig();
    rig.frame();
    // The head looks 30° to the side of where the figure walks.
    const direction = 2;
    rig.input.yaw = direction + Math.PI / 6;
    rig.frame();
    rig.walk(30, WALK_SPEED, direction);
    expect(Math.abs(wrapAngle(rig.out.bodyYaw - direction))).toBeLessThan(0.02);
  });

  it('Phase 6 AC11.4: walking backwards, the body faces the head’s direction', () => {
    const rig = new Rig();
    rig.input.yaw = 1;
    rig.frame();
    rig.walk(30, WALK_SPEED, 1 + Math.PI);
    expect(Math.abs(wrapAngle(rig.out.bodyYaw - 1))).toBeLessThan(0.02);
  });

  it('Phase 6 AC11.4: flying keeps the legs at 0', () => {
    const rig = new Rig();
    rig.input.fly = true;
    rig.walk(120, 10, 0.3, (a) => {
      expect(a.leftLeg).toBe(0);
      expect(a.rightLeg).toBe(0);
    });
  });

  it('the head takes the received pitch', () => {
    const rig = new Rig();
    rig.input.pitch = -0.6;
    expect(rig.frame().headPitch).toBe(-0.6);
  });
});

describe('figure motion: swing', () => {
  /** Times (ms) at which the right arm crosses zero upwards. */
  function upCrossings(rig: Rig, frames: number): number[] {
    const out: number[] = [];
    let last = rig.out.rightArm;
    for (let i = 0; i < frames; i++) {
      const now = rig.frame().rightArm;
      if (last <= 0 && now > 0) out.push(rig.input.nowMs);
      last = now;
    }
    return out;
  }

  it('Phase 6 AC11.5: while busy the right arm swings with a period of 300 ms', () => {
    const rig = new Rig();
    rig.frame();
    rig.input.busy = true;
    const ups = upCrossings(rig, 180);
    expect(ups.length).toBeGreaterThanOrEqual(9);
    for (let i = 1; i < ups.length; i++) {
      expect(Math.abs(ups[i] - ups[i - 1] - FIGURE_SWING_MS)).toBeLessThanOrEqual(FRAME_MS + 1e-6);
    }
  });

  it('Phase 6 AC11.5: one block change starts exactly one swing; a second during it none', () => {
    const rig = new Rig();
    rig.frame();
    rig.input.edits = 1;
    let moving = 0;
    let lastMoving = false;
    let starts = 0;
    for (let i = 0; i < 90; i++) {
      // A second change in the middle of the swing.
      if (i === 6) rig.input.edits = 2;
      const a = rig.frame();
      const now = a.rightArm !== 0;
      if (now && !lastMoving) starts++;
      if (now) moving++;
      lastMoving = now;
    }
    expect(starts).toBe(1);
    expect(moving * FRAME_MS).toBeLessThanOrEqual(FIGURE_SWING_MS + FRAME_MS);
    expect(rig.out.rightArm).toBe(0);
  });
});

describe('figure motion: cost', () => {
  it('Phase 6 AC11.6: 30 000 steps take less than 20 ms; a step writes into its object', () => {
    const rigs = [new Rig(), new Rig(), new Rig()];
    const run = (): number => {
      const start = performance.now();
      for (let f = 0; f < 10_000; f++) {
        for (let r = 0; r < 3; r++) {
          const rig = rigs[r];
          rig.input.x += 0.07;
          rig.input.yaw += 0.01;
          rig.input.busy = (f & 64) !== 0;
          rig.input.nowMs += FRAME_MS;
          rig.motion.step(rig.input, rig.out);
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
