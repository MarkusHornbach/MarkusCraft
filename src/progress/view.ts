// What the screens show of the book: Tasks tab, tracker, notices, F3 row, lock texts. Pure.
import { type PlayerRecord, TRACK_HIDDEN } from '../actions/playerRecord';
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
import { PROGRESS_TABLES, type ProgressTables, type Task } from './tables';

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

export function bookView(
  progress: WorldProgress,
  record: PlayerRecord,
  tables: ProgressTables = PROGRESS_TABLES,
): BookView {
  const chapters = tables.chapters;
  const xp = record.xp;
  const level = levelOf(xp, tables);
  const next = nextLevelXp(xp, tables);
  const start = levelStartXp(xp, tables);
  const chapter = openChapter(progress, tables);
  const finished = chapters
    .filter((c) => tasksOf(c.id, tables).every((t) => progress.done.includes(t.id)))
    .map((c) => c.title);
  const index = chapter ? chapters.findIndex((c) => c.id === chapter.id) : chapters.length;
  const later = chapter ? chapters.length - index - 1 : 0;
  const nextRecipes = next === null ? [] : recipesOfLevel(level + 1, tables);
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
      ? tasksOf(chapter.id, tables).map((task) => {
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

/**
 * The task the HUD tracker shows (Polish 2 plan 5.2), or null (hidden): the chosen task
 * while it is open; otherwise the next open task of the open chapter after the chosen one
 * in table order, wrapping around (with nothing chosen: the chapter's first open task).
 * Nothing is written when the shown task moves on; the record keeps the chosen id.
 */
export function trackedTask(
  record: PlayerRecord,
  progress: WorldProgress,
  tables: ProgressTables = PROGRESS_TABLES,
): Task | null {
  if (record.track === TRACK_HIDDEN) return null;
  const chapter = openChapter(progress, tables);
  if (!chapter) return null;
  const open = tasksOf(chapter.id, tables).filter((t) => !progress.done.includes(t.id));
  const chosen = open.find((t) => t.id === record.track);
  if (chosen) return chosen;
  // The chosen task is done or gone: the first open one after its place in the table.
  const place = tables.tasks.findIndex((t) => t.id === record.track);
  if (place >= 0) {
    const after = open.find((t) => tables.tasks.indexOf(t) > place);
    if (after) return after;
  }
  return open[0] ?? null;
}

/** The tracker's line: "Mine 32 logs  12 / 32", "Reach depth 30  –". */
export function trackerText(task: Task, progress: WorldProgress): string {
  const reach = task.type === 'reachBelow' || task.type === 'reachAbove';
  return `${task.label}  ${reach ? '–' : `${countOf(progress, task)} / ${task.count}`}`;
}

/** The F3 row "Progress": "Chapter 3 · Task 2/4 done · Level 4 · 160/240 XP". */
export function progressRow(
  progress: WorldProgress,
  record: PlayerRecord,
  tables: ProgressTables = PROGRESS_TABLES,
): string {
  const xp = record.xp;
  const level = levelOf(xp, tables);
  const next = nextLevelXp(xp, tables);
  const chapter = openChapter(progress, tables);
  const levelText = next === null ? `Level ${level} · Max` : `Level ${level} · ${xp}/${next} XP`;
  if (!chapter) return `Book complete · ${levelText}`;
  const index = tables.chapters.findIndex((c) => c.id === chapter.id) + 1;
  const tasks = tasksOf(chapter.id, tables);
  const done = tasks.filter((t) => progress.done.includes(t.id)).length;
  return `Chapter ${index} · Task ${done}/${tasks.length} done · ${levelText}`;
}

/**
 * The notice lines of a step's outcomes for the player `self`, in order (plan 5.7). XP of
 * first crafts is silent; level-ups and first finds of other players are not shown.
 */
export function noticeTexts(
  outcomes: readonly ProgressOutcome[],
  self: string,
  tables: ProgressTables = PROGRESS_TABLES,
): string[] {
  const getTask = (id: number) => tables.tasks.find((t) => t.id === id);
  const texts: string[] = [];
  for (const outcome of outcomes) {
    switch (outcome.kind) {
      case 'taskDone': {
        const task = getTask(outcome.task);
        const by = outcome.by === undefined ? '' : ` (${outcome.by})`;
        if (task) texts.push(`Task done: ${task.label}${by} · +${task.xp} XP`);
        break;
      }
      case 'chapterDone': {
        const chapter = tables.chapters.find((c) => c.id === outcome.chapter);
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
        const xp = tables.firstFindXp.get(outcome.block) ?? 0;
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
export function lockedText(recipe: number, tables: ProgressTables = PROGRESS_TABLES): string {
  const unlock = tables.recipeUnlocks.find((u) => u.recipe === recipe)?.unlock ?? { level: 1 };
  if ('level' in unlock) return `Locked: Level ${unlock.level}`;
  const task = tables.tasks.find((t) => t.id === unlock.task);
  return `Locked: ${task?.label ?? `task ${unlock.task}`}`;
}
