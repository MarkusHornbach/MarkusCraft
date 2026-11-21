import { describe, expect, it } from 'vitest';
import { INTERP_DELAY_MS } from '../game/config';
import { PoseBuffer, RemoteRoster, lerpAngle } from './interpolation';

const P = (x: number, yaw = 0) => ({ x, y: 70, z: 0, yaw, pitch: 0 });

describe('interpolation (Phase 6 AC4.12)', () => {
  it('is linear between two poses, drawn 100 ms in the past', () => {
    const b = new PoseBuffer();
    b.push(P(0), 1000, false);
    b.push(P(2), 1050, false);
    expect(b.sample(1000 + INTERP_DELAY_MS)?.x).toBe(0);
    expect(b.sample(1025 + INTERP_DELAY_MS)?.x).toBeCloseTo(1, 10);
    expect(b.sample(1050 + INTERP_DELAY_MS)?.x).toBe(2);
  });

  it('never overshoots and holds the last pose when starved', () => {
    const b = new PoseBuffer();
    b.push(P(0), 0, false);
    b.push(P(1), 50, false);
    for (let t = 0; t < 1000; t += 7) {
      const x = b.sample(t)?.x ?? NaN;
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(1);
    }
    expect(b.sample(5000)).toEqual(P(1));
    expect(new PoseBuffer().sample(0)).toBeNull();
    expect(b.latest).toEqual(P(1));
  });

  it('snaps beyond 8 blocks and on the teleport flag', () => {
    const b = new PoseBuffer();
    b.push(P(0), 0, false);
    b.push(P(20), 50, false);
    expect(b.sample(25 + INTERP_DELAY_MS)?.x).toBe(0);
    expect(b.sample(50 + INTERP_DELAY_MS)?.x).toBe(20);
    b.push(P(21), 100, true);
    expect(b.sample(75 + INTERP_DELAY_MS)?.x).toBe(20);
    expect(b.sample(100 + INTERP_DELAY_MS)?.x).toBe(21);
    b.push(P(22), 150, false);
    expect(b.sample(125 + INTERP_DELAY_MS)?.x).toBeCloseTo(21.5, 10);
  });

  it('takes the short way round for yaw', () => {
    expect(lerpAngle(3, -3, 0.5)).toBeCloseTo(Math.PI, 6);
    expect(lerpAngle(-3, 3, 0.5)).toBeCloseTo(Math.PI, 6);
    expect(lerpAngle(0.1, -0.1, 0.5)).toBeCloseTo(0, 10);
    const b = new PoseBuffer();
    b.push(P(0, 3.0), 0, false);
    b.push(P(0, -3.0), 50, false);
    const yaw = b.sample(25 + INTERP_DELAY_MS)?.yaw ?? 0;
    expect(Math.abs(yaw)).toBeGreaterThan(3.0);
  });

  it('keeps a bounded history and never goes back in time', () => {
    const b = new PoseBuffer();
    for (let i = 0; i < 100; i++) b.push(P(i * 0.1), i * 50, false);
    b.push(P(10), 10, false);
    expect(b.sample(10_000)?.x).toBe(10);
  });

  it('snapsAt counts the snaps of the drawn pose (Phase 6 part D)', () => {
    const b = new PoseBuffer();
    b.push(P(0), 0, false);
    b.push(P(1), 50, false);
    b.push(P(4), 100, true);
    b.push(P(20), 150, false);
    expect(b.snapsAt(100)).toBe(1);
    expect(b.snapsAt(190)).toBe(1);
    expect(b.snapsAt(200)).toBe(2);
    expect(b.snapsAt(250)).toBe(3);
    expect(new PoseBuffer().snapsAt(0)).toBe(0);
  });

  it('the roster lists players by id and draws a player only once it has a pose', () => {
    const r = new RemoteRoster();
    r.add(3, 'C', 2, 7, false, null, 0);
    r.add(1, 'A', 0, 1, true, P(1), 0);
    expect(r.list().map((p) => p.id)).toEqual([1, 3]);
    expect(r.get(3)?.poses.sample(500)).toBeNull();
    r.push(3, P(4), 10, false);
    expect(r.get(3)?.poses.sample(500)).toEqual(P(4));
    // Part D: profile, flags and block changes per player.
    r.setProfile(3, 'Cleo', 2);
    r.setFlags(3, true, true);
    r.noteEdit(3);
    r.noteEdit(3);
    r.setProfile(9, 'Nobody', 1);
    r.setFlags(9, true, true);
    r.noteEdit(9);
    expect(r.get(3)).toMatchObject({ name: 'Cleo', look: 2, fly: true, busy: true, edits: 2 });
    expect(r.get(1)).toMatchObject({ look: 1, fly: false, busy: false, edits: 0 });
    expect(r.remove(3)?.name).toBe('Cleo');
    expect(r.remove(3)).toBeNull();
    r.clear();
    expect(r.list()).toEqual([]);
  });
});
