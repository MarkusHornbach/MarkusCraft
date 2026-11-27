// Feature unlocks: the radar comes with task 8 (Phase 8B1 AC2.1–AC2.3).
import { describe, expect, it } from 'vitest';
import { type PlayerRecord, createPlayerRecord } from '../actions/playerRecord';
import { checkTables } from './check';
import {
  type ProgressPlayer,
  type WorldProgress,
  featureUnlocked,
  featuresOfLevel,
  featuresOfTask,
  outcomesOfBook,
  outcomesOfRecord,
  stepProgress,
} from './progress';
import { FEATURE_UNLOCKS, FEATURES, PROGRESS_TABLES, type ProgressTables } from './tables';
import { featureLockText, noticeTexts } from './view';

const atTask8: WorldProgress = { done: [1, 2, 3, 4, 5, 6, 7], counts: [] };
const record = (xp = 0): PlayerRecord => ({ ...createPlayerRecord('gathering'), xp });
const me = (r: PlayerRecord = record()): ProgressPlayer => ({ id: 'me', record: r });

function variant(change: Partial<ProgressTables>): ProgressTables {
  return { ...PROGRESS_TABLES, ...change };
}

describe('feature unlocks', () => {
  it('Phase 8B1 AC2.1 pins the radar on task 8 and passes the static check', () => {
    expect(FEATURES).toEqual(['radar']);
    expect(FEATURE_UNLOCKS).toEqual([{ feature: 'radar', unlock: { task: 8 } }]);
    const shipped = checkTables(PROGRESS_TABLES);
    expect(shipped.errors).toEqual([]);
    const without = checkTables(variant({ featureUnlocks: [] }));
    // The guaranteed XP per chapter does not depend on features.
    expect(shipped.chapters).toEqual(
      checkTables(variant({ featureUnlocks: [{ feature: 'radar', unlock: { level: 2 } }] }))
        .chapters,
    );
    expect(without.errors).toEqual(['feature radar has no unlock']);
    expect(
      checkTables(variant({ featureUnlocks: [{ feature: 'radar', unlock: { task: 99 } }] })).errors,
    ).toEqual(['feature radar: unknown task 99']);
    expect(
      checkTables(variant({ featureUnlocks: [{ feature: 'radar', unlock: { level: 99 } }] }))
        .errors,
    ).toEqual(['feature radar: unknown level 99']);
    expect(
      checkTables(
        variant({
          featureUnlocks: [...FEATURE_UNLOCKS, { feature: 'radar', unlock: { level: 2 } }],
        }),
      ).errors,
    ).toEqual(['feature radar has 2 unlocks']);
    // A task that is never done: its chapter is stuck, and the feature is named.
    const stuck = checkTables(
      variant({
        tasks: PROGRESS_TABLES.tasks.map((t) =>
          t.id === 8 ? { ...t, type: 'reachBelow' as const, target: 2 } : t,
        ),
        recipeUnlocks: PROGRESS_TABLES.recipeUnlocks.map((u) =>
          u.recipe === 20 ? { ...u, unlock: { level: 7 } } : u,
        ),
      }),
    );
    expect(stuck.ok).toBe(false);
    expect(stuck.errors).toContain('feature radar: task 8 is never done');
    expect(featuresOfTask(8)).toEqual(['radar']);
    expect(featuresOfTask(9)).toEqual([]);
    expect(featuresOfLevel(3)).toEqual([]);
  });

  it('Phase 8B1 AC2.2 finishing task 8 queues "Unlocked: Radar", for a guest too', () => {
    const step = stepProgress(atTask8, me(), { kind: 'pose', y: 64 }, [me()]);
    expect(step.progress.done).toContain(8);
    expect(step.outcomes).toContainEqual({ kind: 'unlocked', recipes: [], features: ['radar'] });
    expect(noticeTexts(step.outcomes, 'me')).toContain('Unlocked: Radar');
    const guest = outcomesOfBook(atTask8, step.progress, [{ task: 8, by: 'Anna' }]);
    expect(noticeTexts(guest, 'Bea')).toContain('Unlocked: Radar');
    // Texts with recipes and after a level.
    expect(noticeTexts([{ kind: 'unlocked', recipes: [20], features: ['radar'] }], 'me')).toEqual([
      'Unlocked: Torch, Radar',
    ]);
    expect(
      noticeTexts(
        [{ kind: 'levelUp', player: 'me', level: 3, recipes: [10], features: ['radar'] }],
        'me',
      ),
    ).toEqual(['Level 3 · Unlocked: Furnace, Radar']);
    expect(
      noticeTexts(
        [{ kind: 'levelUp', player: 'me', level: 3, recipes: [], features: ['radar'] }],
        'me',
      ),
    ).toEqual(['Level 3 · Unlocked: Radar']);
    // A feature on a level shows in the level-up of steps and of guests' records.
    const onLevel = variant({ featureUnlocks: [{ feature: 'radar', unlock: { level: 2 } }] });
    const ups = outcomesOfRecord(record(0), record(60), 'me', onLevel);
    expect(ups).toContainEqual({
      kind: 'levelUp',
      player: 'me',
      level: 2,
      recipes: [5, 6, 7],
      features: ['radar'],
    });
    expect(featureLockText('radar')).toBe('Task: Climb to height 64');
    expect(featureLockText('radar', onLevel)).toBe('Level 2');
  });

  it('Phase 8B1 AC2.3 is closed before task 8 and open after, at any level', () => {
    for (const xp of [0, 60, 500]) {
      expect(featureUnlocked('radar', record(xp), atTask8)).toBe(false);
      expect(featureUnlocked('radar', record(xp), { done: [...atTask8.done, 8], counts: [] })).toBe(
        true,
      );
    }
    expect(
      featureUnlocked(
        'radar',
        record(),
        { done: [8], counts: [] },
        variant({ featureUnlocks: [] }),
      ),
    ).toBe(false);
  });
});
