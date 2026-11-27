// Pins the progress tables: chapter and task ids, types, targets and recipe unlocks (AC1.1).
import { describe, expect, it } from 'vitest';
import { RECIPES } from '../items/recipes';
import { checkTables } from './check';
import {
  CHAPTERS,
  FEATURE_UNLOCKS,
  LEVELS,
  PROGRESS_TABLES,
  RECIPE_UNLOCKS,
  TASKS,
  getTask,
  levelIn,
  unlockOf,
} from './tables';

/** id → [chapter, type, target]. Ids are written into saves: never renumber, only append. */
const PINNED_TASKS: Record<number, [number, string, number]> = {
  1: [1, 'mine', 5],
  2: [1, 'craft', 7],
  3: [1, 'craft', 15],
  4: [1, 'place', 15],
  5: [2, 'craft', 259],
  6: [2, 'mine', 3],
  7: [2, 'craft', 262],
  8: [2, 'reachAbove', 64],
  9: [3, 'craft', 16],
  10: [3, 'place', 16],
  11: [3, 'craft', 256],
  12: [3, 'mine', 256],
  13: [4, 'craft', 19],
  14: [4, 'reachBelow', 30],
  15: [4, 'place', 19],
  16: [4, 'mine', 13],
  17: [5, 'craft', 258],
  18: [5, 'craft', 265],
  19: [5, 'craft', 9],
  20: [5, 'place', 17],
};

/** recipe id → its unlock. */
const PINNED_UNLOCKS: Record<number, string> = {
  1: 'L1',
  2: 'L1',
  3: 'L1',
  4: 'L1',
  5: 'L2',
  6: 'L2',
  7: 'L2',
  8: 'L3',
  9: 'L3',
  10: 'L3',
  11: 'L3',
  12: 'L5',
  13: 'L6',
  14: 'L6',
  15: 'L6',
  16: 'L4',
  17: 'L5',
  18: 'L4',
  19: 'L7',
  // Fix Adventure 1: the torch comes with task 11 "Make 16 coal" (was task 12).
  20: 'T11',
};

function pinTasks(tasks: typeof TASKS): Record<number, [number, string, number]> {
  return Object.fromEntries(tasks.map((t) => [t.id, [t.chapter, t.type, t.target]]));
}

function covers(tasks: typeof TASKS): boolean {
  // Every pinned id keeps its meaning; new ids may follow.
  const now = pinTasks(tasks);
  return Object.entries(PINNED_TASKS).every(
    ([id, pin]) => JSON.stringify(now[Number(id)]) === JSON.stringify(pin),
  );
}

describe('progress tables (Phase 8 AC1.1)', () => {
  it('pins chapter ids and titles in book order', () => {
    expect(CHAPTERS.map((c) => [c.id, c.title])).toEqual([
      [1, 'First wood'],
      [2, 'Tools'],
      [3, 'Stone and fire'],
      [4, 'Into the dark'],
      [5, 'Iron'],
    ]);
  });

  it('pins every task id, chapter, type and target', () => {
    expect(pinTasks(TASKS)).toEqual(PINNED_TASKS);
    expect(TASKS.map((t) => t.id)).toEqual(TASKS.map((_, i) => i + 1));
  });

  it('pins the unlock of every recipe id (Fix Adventure 1 AC1.1)', () => {
    const now = Object.fromEntries(
      RECIPE_UNLOCKS.map(({ recipe, unlock }) => [
        recipe,
        'level' in unlock ? `L${unlock.level}` : `T${unlock.task}`,
      ]),
    );
    expect(now).toEqual(PINNED_UNLOCKS);
    expect(RECIPES.every((r) => unlockOf(r.id) !== undefined)).toBe(true);
  });

  it('a task added at the end passes the pin; a renumbered one fails it', () => {
    const appended = [...TASKS, { ...TASKS[0], id: 21, chapter: 5, label: 'New' }];
    expect(covers(appended)).toBe(true);
    const renumbered = TASKS.map((t) =>
      t.id === 2 ? { ...t, id: 3 } : t.id === 3 ? { ...t, id: 2 } : t,
    );
    expect(covers(renumbered)).toBe(false);
  });

  it('pins the feature unlocks (Phase 8B1 AC2.1)', () => {
    expect(FEATURE_UNLOCKS).toEqual([{ feature: 'radar', unlock: { task: 8 } }]);
  });

  it('levels and lookups', () => {
    // Tuned with the goal bot (Phase 8 part A1 report); the plan started at 30, 80, 150, …
    expect(LEVELS).toEqual([0, 50, 125, 190, 270, 370, 460]);
    expect(levelIn(LEVELS, 0)).toBe(1);
    expect(levelIn(LEVELS, 49)).toBe(1);
    expect(levelIn(LEVELS, 50)).toBe(2);
    expect(levelIn(LEVELS, 10_000)).toBe(7);
    expect(getTask(12)?.label).toBe('Mine 32 coal');
    expect(getTask(99)).toBeUndefined();
    expect(unlockOf(999)).toEqual({ level: 1 });
  });

  it('the shipped tables pass the static check (AC1.2)', () => {
    const result = checkTables(PROGRESS_TABLES);
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
    expect(result.chapters.map((c) => c.level)).toEqual([2, 3, 4, 6, 7]);
  });
});
