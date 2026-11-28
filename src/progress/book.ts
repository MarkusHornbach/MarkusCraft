// Book versions: an older world's task book is brought up to the build's book, once.
import { BOOK_VERSION } from '../game/config';
import type { WorldProgress } from './progress';

/**
 * How a book of version `from` becomes `from + 1`: if every task of `ifDone` is done, the
 * tasks of `markDone` are done too (without XP or notice). A task added to a chapter that
 * a world has already finished would otherwise send the world back into that chapter.
 */
export interface BookUpgrade {
  readonly from: number;
  readonly ifDone: readonly number[];
  readonly markDone: readonly number[];
}

/**
 * The upgrade rules of this build, one per version step. Book 2 (Phase 8 part B3a2) adds
 * task 21 "Store 32 stone in a chest" to chapter 3: a world past the chapter's tasks 9–12
 * gets it done, so it stays in its chapter.
 */
export const BOOK_UPGRADES: readonly BookUpgrade[] = [
  { from: 1, ifDone: [9, 10, 11, 12], markDone: [21] },
];

export interface UpgradedBook {
  progress: WorldProgress;
  book: number;
}

/**
 * Upgrades a book step by step to `version`. A step without a rule changes nothing but
 * the version; a book at or above `version` is returned as it is.
 */
export function upgradeBook(
  progress: WorldProgress,
  book: number,
  upgrades: readonly BookUpgrade[] = BOOK_UPGRADES,
  version: number = BOOK_VERSION,
): UpgradedBook {
  let current = progress;
  let at = book;
  while (at < version) {
    const rule = upgrades.find((u) => u.from === at);
    if (rule && rule.ifDone.every((task) => current.done.includes(task))) {
      const added = rule.markDone.filter((task) => !current.done.includes(task));
      if (added.length > 0) {
        current = {
          done: [...current.done, ...added],
          // A task marked done has no count any more.
          counts: current.counts.filter((c) => !added.includes(c.task)),
        };
      }
    }
    at++;
  }
  return { progress: current, book: at };
}
