// The action `track`: choosing the task of the HUD tracker (Polish 2 plan 5.1).
import { describe, expect, it } from 'vitest';
import { Block } from '../world/blocks';
import { EMPTY_PROGRESS, type WorldProgress, completeProgress } from '../progress/progress';
import { decodeAction } from './actions';
import { type ActionContext, type ActionResult, applyAction } from './apply';
import { type GameMode, type PlayerRecord, createPlayerRecord } from './playerRecord';

/** Freezes a value and everything in it, so a mutation throws. */
function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const inner of Object.values(value)) deepFreeze(inner);
  }
  return value;
}

const pose = { x: 0.5, y: 10, z: 0.5 };

function context(
  progress: WorldProgress = EMPTY_PROGRESS,
  mode: GameMode = 'gathering',
  record: PlayerRecord = createPlayerRecord(mode),
): ActionContext {
  return deepFreeze({
    world: { getBlock: () => Block.AIR },
    mode,
    pose,
    record: { ...record, breaking: { x: 1, y: 2, z: 3, startMs: 5 } },
    players: [pose],
    progress,
  });
}

function track(ctx: ActionContext, task: number): ActionResult {
  return applyAction(ctx, { kind: 'track', task }, 100);
}

function reason(result: ActionResult): string | null {
  return result.ok ? null : result.reason;
}

describe('the action track (Polish 2 AC1.1)', () => {
  it('Polish 2 AC1.1: Creative refuses mode, before anything else', () => {
    expect(reason(track(context(EMPTY_PROGRESS, 'creative'), 2))).toBe('mode');
    expect(reason(track(context(EMPTY_PROGRESS, 'creative'), 0))).toBe('mode');
    expect(reason(track(context(EMPTY_PROGRESS, 'creative'), -1))).toBe('mode');
  });

  it('Polish 2 AC1.1: an unknown id, a done task, a later chapter and 0 are invalid', () => {
    const ctx = context({ done: [1], counts: [] });
    expect(reason(track(ctx, 999))).toBe('invalid');
    expect(reason(track(ctx, 1))).toBe('invalid');
    // Task 5 belongs to chapter 2; chapter 1 is open.
    expect(reason(track(ctx, 5))).toBe('invalid');
    expect(reason(track(ctx, 0))).toBe('invalid');
    // A complete book has no task to choose.
    expect(reason(track(context(completeProgress()), 20))).toBe('invalid');
  });

  it('Polish 2 AC1.1: an open task and -1 are accepted; only track changes', () => {
    const ctx = context({ done: [1], counts: [{ task: 2, count: 3 }] });
    for (const task of [2, 4, -1]) {
      const result = track(ctx, task);
      expect(result.ok).toBe(true);
      if (!result.ok) continue;
      expect(result.blocks).toEqual([]);
      expect(result.notices).toEqual([]);
      // Everything but track is the same, a running break too.
      expect(result.player).toEqual({ ...ctx.record, track: task });
    }
    expect(ctx.record.track).toBe(0);
  });

  it('decodeAction checks the field: an integer from -1 to 65 535', () => {
    expect(decodeAction({ kind: 'track', task: -1 })).toEqual({
      ok: true,
      action: { kind: 'track', task: -1 },
    });
    expect(decodeAction({ kind: 'track', task: 65535 }).ok).toBe(true);
    for (const task of [-2, 65536, 1.5, '2', null]) {
      expect(decodeAction({ kind: 'track', task }).ok).toBe(false);
    }
    expect(decodeAction({ kind: 'track' }).ok).toBe(false);
    expect(decodeAction({ kind: 'track', task: 2, extra: 1 }).ok).toBe(false);
  });
});
