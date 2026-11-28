import { describe, expect, it } from 'vitest';
import { BOOK_VERSION } from '../game/config';
import { BOOK_UPGRADES, type BookUpgrade, upgradeBook } from './book';
import { EMPTY_PROGRESS, type WorldProgress } from './progress';

/** Test tables: book 2 adds task 21 to chapter 3 (tasks 9–12), book 3 adds task 22. */
const UPGRADES: readonly BookUpgrade[] = [
  { from: 1, ifDone: [9, 10, 11, 12], markDone: [21] },
  { from: 2, ifDone: [21], markDone: [22] },
];

describe('book versions (Phase 8B3a 6.4)', () => {
  it('Phase 8B3a AC6.3: this build has book 2, whose rule marks task 21 done past tasks 9–12', () => {
    expect(BOOK_VERSION).toBe(2);
    expect(BOOK_UPGRADES).toEqual([{ from: 1, ifDone: [9, 10, 11, 12], markDone: [21] }]);
    // Chapter 3 still open: task 21 stays open.
    const open: WorldProgress = { done: [1, 2, 9], counts: [{ task: 10, count: 0 }] };
    expect(upgradeBook(open, 1)).toEqual({ progress: open, book: 2 });
    // Past chapter 3: task 21 is done, without XP (only the book changes).
    const past: WorldProgress = {
      done: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
      counts: [{ task: 13, count: 4 }],
    };
    expect(upgradeBook(past, 1)).toEqual({
      progress: { done: [...past.done, 21], counts: [{ task: 13, count: 4 }] },
      book: 2,
    });
    // A book 2 is never upgraded again.
    const current: WorldProgress = { done: [9, 10, 11, 12], counts: [] };
    expect(upgradeBook(current, 2).progress).toBe(current);
  });

  it('marks the new task done where the chapter was finished, without touching counts', () => {
    const past: WorldProgress = {
      done: [1, 2, 9, 10, 11, 12],
      counts: [{ task: 13, count: 5 }],
    };
    expect(upgradeBook(past, 1, UPGRADES, 2)).toEqual({
      progress: { done: [1, 2, 9, 10, 11, 12, 21], counts: [{ task: 13, count: 5 }] },
      book: 2,
    });
  });

  it('keeps the new task open in a world still in that chapter', () => {
    const inChapter: WorldProgress = { done: [9, 10], counts: [{ task: 11, count: 3 }] };
    const result = upgradeBook(inChapter, 1, UPGRADES, 2);
    expect(result.progress).toBe(inChapter);
    expect(result.book).toBe(2);
  });

  it('applies several steps in order and never upgrades a current book again', () => {
    const past: WorldProgress = { done: [9, 10, 11, 12], counts: [{ task: 21, count: 7 }] };
    const result = upgradeBook(past, 1, UPGRADES, 3);
    expect(result).toEqual({ progress: { done: [9, 10, 11, 12, 21, 22], counts: [] }, book: 3 });
    expect(upgradeBook(result.progress, 3, UPGRADES, 3).progress).toBe(result.progress);
    expect(upgradeBook(EMPTY_PROGRESS, 2, UPGRADES, 2).progress).toBe(EMPTY_PROGRESS);
  });
});
