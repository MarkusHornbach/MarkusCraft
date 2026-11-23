// What the screens show of the book: the Tasks tab, notices, the F3 row, lock texts. Pure.
import type { PlayerRecord } from '../actions/playerRecord';
import { itemLabel } from '../items/items';
import { getRecipe } from '../items/recipes';
import { getBlockDef } from '../world/blocks';
import {
  type ProgressOutcome,
  type WorldProgress,
  countOf,
  levelOf,
  levelStartXp,
  nextLevelXp,
  openChapter,
  recipesOfLevel,
  tasksOf,
} from './progress';
import { CHAPTERS, FIRST_FIND_XP, getChapter, getTask, unlockOf } from './tables';

/** One row of the open chapter on the Tasks tab. */
export interface TaskRowView {
  id: number;
  label: string;
  /** "3 / 8", "–" for a reach task not done, "✓" when done. */
  status: string;
  done: boolean;
}

/** Everything the Tasks tab shows, top to bottom (plan 5.7). */
export interface BookView {
  level: number;
  /** "120 / 150 XP", or "Max level". */
  xpText: string;
  /** How full the XP bar is within the level (0..1; 1 at the maximum level). */
  xpFraction: number;
  /** "Next level: Stone axe, Stone shovel, Furnace"; null at the maximum level. */
  nextText: string | null;
  /** Titles of the finished chapters, in book order. */
  finished: string[];
  /** "Chapter 3 · Stone and fire"; null when the book is complete. */
  chapterTitle: string | null;
  tasks: TaskRowView[];
  /** "2 more chapters", "1 more chapter", "All tasks done." or null (the last chapter). */
  footer: string | null;
}

/** The names of the results of some recipes ("Stone axe, Stone shovel, Furnace"). */
export function recipeNames(recipes: readonly number[]): string {
  return recipes
    .map((id) => {
      const recipe = getRecipe(id);
      return recipe ? itemLabel(recipe.result.item) : `#${id}`;
    })
    .join(', ');
}

export function bookView(progress: WorldProgress, record: PlayerRecord): BookView {
  const xp = record.xp;
  const level = levelOf(xp);
  const next = nextLevelXp(xp);
  const start = levelStartXp(xp);
  const chapter = openChapter(progress);
  const finished = CHAPTERS.filter((c) =>
    tasksOf(c.id).every((t) => progress.done.includes(t.id)),
  ).map((c) => c.title);
  const index = chapter ? CHAPTERS.findIndex((c) => c.id === chapter.id) : CHAPTERS.length;
  const later = chapter ? CHAPTERS.length - index - 1 : 0;
  const nextRecipes = next === null ? [] : recipesOfLevel(level + 1);
  return {
    level,
    xpText: next === null ? 'Max level' : `${xp} / ${next} XP`,
    xpFraction: next === null ? 1 : Math.max(0, Math.min(1, (xp - start) / (next - start))),
    nextText:
      next === null
        ? null
        : `Next level: ${nextRecipes.length > 0 ? recipeNames(nextRecipes) : 'nothing new'}`,
    finished,
    chapterTitle: chapter ? `Chapter ${index + 1} · ${chapter.title}` : null,
    tasks: chapter
      ? tasksOf(chapter.id).map((task) => {
          const done = progress.done.includes(task.id);
          const reach = task.type === 'reachBelow' || task.type === 'reachAbove';
          const status = done ? '✓' : reach ? '–' : `${countOf(progress, task)} / ${task.count}`;
          return { id: task.id, label: task.label, status, done };
        })
      : [],
    footer: !chapter
      ? 'All tasks done.'
      : later > 0
        ? `${later} more chapter${later === 1 ? '' : 's'}`
        : null,
  };
}

/** The F3 row "Progress": "Chapter 3 · Task 2/4 done · Level 4 · 160/240 XP". */
export function progressRow(progress: WorldProgress, record: PlayerRecord): string {
  const xp = record.xp;
  const level = levelOf(xp);
  const next = nextLevelXp(xp);
  const chapter = openChapter(progress);
  const levelText = next === null ? `Level ${level} · Max` : `Level ${level} · ${xp}/${next} XP`;
  if (!chapter) return `Book complete · ${levelText}`;
  const index = CHAPTERS.findIndex((c) => c.id === chapter.id) + 1;
  const tasks = tasksOf(chapter.id);
  const done = tasks.filter((t) => progress.done.includes(t.id)).length;
  return `Chapter ${index} · Task ${done}/${tasks.length} done · ${levelText}`;
}

/**
 * The notice lines of a step's outcomes for the player `self`, in order (plan 5.7). XP of
 * first crafts is silent; level-ups and first finds of other players are not shown.
 */
export function noticeTexts(outcomes: readonly ProgressOutcome[], self: string): string[] {
  const texts: string[] = [];
  for (const outcome of outcomes) {
    switch (outcome.kind) {
      case 'taskDone': {
        const task = getTask(outcome.task);
        if (task) texts.push(`Task done: ${task.label} · +${task.xp} XP`);
        break;
      }
      case 'chapterDone': {
        const chapter = getChapter(outcome.chapter);
        if (chapter) texts.push(`Chapter done: ${chapter.title}`);
        break;
      }
      case 'levelUp':
        if (outcome.player !== self) break;
        texts.push(
          outcome.recipes.length > 0
            ? `Level ${outcome.level} · Unlocked: ${recipeNames(outcome.recipes)}`
            : `Level ${outcome.level}`,
        );
        break;
      case 'unlocked':
        texts.push(`Unlocked: ${recipeNames(outcome.recipes)}`);
        break;
      case 'firstFind': {
        if (outcome.player !== self) break;
        const xp = FIRST_FIND_XP.get(outcome.block) ?? 0;
        texts.push(`First find: ${getBlockDef(outcome.block).label} · +${xp} XP`);
        break;
      }
      case 'xp':
        break;
    }
  }
  return texts;
}

/** The HUD text of a `locked` refusal: "Locked: Level 3", "Locked: Mine 3 coal". */
export function lockedText(recipe: number): string {
  const unlock = unlockOf(recipe);
  if ('level' in unlock) return `Locked: Level ${unlock.level}`;
  return `Locked: ${getTask(unlock.task)?.label ?? `task ${unlock.task}`}`;
}
