// Progress engine: the world's task book state, levels, unlocks and the progress step. Pure.
import type { PlayerRecord } from '../actions/playerRecord';
import { RECIPES } from '../items/recipes';
import type { ProgressEvent } from './events';
import {
  PROGRESS_TABLES,
  type Chapter,
  type Feature,
  type ProgressTables,
  type Task,
  type Unlock,
  levelIn,
} from './tables';

/** The count of an open task that is above 0. */
export interface TaskCount {
  readonly task: number;
  readonly count: number;
}

/**
 * The task book of one world (shared by everyone in it). Immutable like `PlayerRecord`.
 * The open chapter is derived: the first chapter with a task not in `done`.
 */
export interface WorldProgress {
  readonly done: readonly number[];
  readonly counts: readonly TaskCount[];
}

export const EMPTY_PROGRESS: WorldProgress = Object.freeze({
  done: Object.freeze([]) as readonly number[],
  counts: Object.freeze([]) as readonly TaskCount[],
});

/** The highest XP a record can hold (the save format's limit). */
export const XP_MAX = 1_000_000_000;

/** Every task of the tables done: the test worlds' `progress=all`. */
export function completeProgress(tables: ProgressTables = PROGRESS_TABLES): WorldProgress {
  return { done: tables.tasks.map((t) => t.id), counts: [] };
}

/** The XP the maximum level starts at. */
export function maxLevelXp(tables: ProgressTables = PROGRESS_TABLES): number {
  return tables.levels[tables.levels.length - 1];
}

/** A player the step may give XP to: an id (a name in rooms, "local" alone) and its record. */
export interface ProgressPlayer {
  readonly id: string;
  readonly record: PlayerRecord;
}

/** What a step did, for notices and tests. */
export type ProgressOutcome =
  /** `by`: the name of the actor, shown in rooms ("Task done: Mine 4 logs (Anna)"). */
  | { kind: 'taskDone'; task: number; actor: string; by?: string }
  | { kind: 'chapterDone'; chapter: number }
  | { kind: 'xp'; player: string; amount: number }
  | { kind: 'firstFind'; player: string; block: number }
  /** `features`: only present when the level unlocks one. */
  | { kind: 'levelUp'; player: string; level: number; recipes: number[]; features?: Feature[] }
  /** `features`: only present when the task unlocks one (Phase 8 part B1). */
  | { kind: 'unlocked'; recipes: number[]; features?: Feature[] };

export interface ProgressStep {
  progress: WorldProgress;
  /** The new records of every player whose record changed. */
  records: readonly ProgressPlayer[];
  outcomes: readonly ProgressOutcome[];
}

const NO_RECORDS: readonly ProgressPlayer[] = Object.freeze([]);
const NO_OUTCOMES: readonly ProgressOutcome[] = Object.freeze([]);

/** The level of a total XP (1 to the maximum level). */
export function levelOf(xp: number, tables: ProgressTables = PROGRESS_TABLES): number {
  return levelIn(tables.levels, xp);
}

/** The total XP the next level starts at, or null at the maximum level. */
export function nextLevelXp(xp: number, tables: ProgressTables = PROGRESS_TABLES): number | null {
  const level = levelOf(xp, tables);
  return level < tables.levels.length ? tables.levels[level] : null;
}

/** The XP the current level started at. */
export function levelStartXp(xp: number, tables: ProgressTables = PROGRESS_TABLES): number {
  return tables.levels[levelOf(xp, tables) - 1];
}

export function maxLevel(tables: ProgressTables = PROGRESS_TABLES): number {
  return tables.levels.length;
}

function unlockIn(tables: ProgressTables, recipe: number): Unlock {
  return tables.recipeUnlocks.find((u) => u.recipe === recipe)?.unlock ?? { level: 1 };
}

/**
 * Whether a player may craft a recipe: crafted by this player before (a recipe is never
 * locked again, whatever the tables say now), its level reached, or its task done.
 */
export function recipeUnlocked(
  recipe: number,
  record: PlayerRecord,
  progress: WorldProgress,
  tables: ProgressTables = PROGRESS_TABLES,
): boolean {
  if (record.crafted.includes(recipe)) return true;
  const unlock = unlockIn(tables, recipe);
  if ('level' in unlock) return levelOf(record.xp, tables) >= unlock.level;
  return progress.done.includes(unlock.task);
}

/** What unlocks a recipe, as the screen says it: "Level 3", "Task: Make 2 coal". */
export function unlockText(recipe: number, tables: ProgressTables = PROGRESS_TABLES): string {
  const unlock = unlockIn(tables, recipe);
  if ('level' in unlock) return `Level ${unlock.level}`;
  const task = tables.tasks.find((t) => t.id === unlock.task);
  return `Task: ${task?.label ?? `#${unlock.task}`}`;
}

/**
 * Whether a feature is open to a player: its level reached (the player's record) or its
 * task done (the world's book, so in a room everyone has it). A feature without an unlock
 * in the tables is closed.
 */
export function featureUnlocked(
  feature: Feature,
  record: PlayerRecord,
  progress: WorldProgress,
  tables: ProgressTables = PROGRESS_TABLES,
): boolean {
  const unlock = tables.featureUnlocks.find((u) => u.feature === feature)?.unlock;
  if (!unlock) return false;
  if ('level' in unlock) return levelOf(record.xp, tables) >= unlock.level;
  return progress.done.includes(unlock.task);
}

/** The features a finished task unlocks, in table order. */
export function featuresOfTask(task: number, tables: ProgressTables = PROGRESS_TABLES): Feature[] {
  return tables.featureUnlocks
    .filter((u) => 'task' in u.unlock && u.unlock.task === task)
    .map((u) => u.feature);
}

/** The features a level unlocks, in table order. */
export function featuresOfLevel(
  level: number,
  tables: ProgressTables = PROGRESS_TABLES,
): Feature[] {
  return tables.featureUnlocks
    .filter((u) => 'level' in u.unlock && u.unlock.level === level)
    .map((u) => u.feature);
}

/** The `unlocked` outcome of a finished task, or null if it unlocks nothing. */
function unlockedByTask(task: number, tables: ProgressTables): ProgressOutcome | null {
  const recipes = recipesOfTask(task, tables);
  const features = featuresOfTask(task, tables);
  if (recipes.length === 0 && features.length === 0) return null;
  return features.length > 0
    ? { kind: 'unlocked', recipes, features }
    : { kind: 'unlocked', recipes };
}

/** The `levelUp` outcome of reaching `level`. */
function levelUpOutcome(player: string, level: number, tables: ProgressTables): ProgressOutcome {
  const recipes = recipesOfLevel(level, tables);
  const features = featuresOfLevel(level, tables);
  return features.length > 0
    ? { kind: 'levelUp', player, level, recipes, features }
    : { kind: 'levelUp', player, level, recipes };
}

/** The recipes a level unlocks, in table order. */
export function recipesOfLevel(level: number, tables: ProgressTables = PROGRESS_TABLES): number[] {
  return RECIPES.filter((r) => {
    const unlock = unlockIn(tables, r.id);
    return 'level' in unlock && unlock.level === level;
  }).map((r) => r.id);
}

/** The recipes a finished task unlocks, in table order. */
export function recipesOfTask(task: number, tables: ProgressTables = PROGRESS_TABLES): number[] {
  return RECIPES.filter((r) => {
    const unlock = unlockIn(tables, r.id);
    return 'task' in unlock && unlock.task === task;
  }).map((r) => r.id);
}

/** The open chapter: the first in book order with a task not done; null when the book is complete. */
export function openChapter(
  progress: WorldProgress,
  tables: ProgressTables = PROGRESS_TABLES,
): Chapter | null {
  for (const chapter of tables.chapters) {
    for (const task of tables.tasks) {
      if (task.chapter === chapter.id && !progress.done.includes(task.id)) return chapter;
    }
  }
  return null;
}

export function tasksOf(chapter: number, tables: ProgressTables = PROGRESS_TABLES): Task[] {
  return tables.tasks.filter((t) => t.chapter === chapter);
}

/** The count of a task towards its goal (its goal when done). */
export function countOf(progress: WorldProgress, task: Task): number {
  if (progress.done.includes(task.id)) return task.count;
  return progress.counts.find((c) => c.task === task.id)?.count ?? 0;
}

/** How much one event advances one task (0: not at all). Extension point for new types. */
function advance(task: Task, event: ProgressEvent): number {
  switch (task.type) {
    case 'mine':
      return event.kind === 'mine' && event.item === task.target ? event.count : 0;
    case 'craft':
      return event.kind === 'craft' && event.item === task.target ? event.count : 0;
    case 'place':
      return event.kind === 'place' && event.block === task.target ? 1 : 0;
    case 'reachBelow':
      return event.kind === 'pose' && event.y <= task.target ? 1 : 0;
    case 'reachAbove':
      return event.kind === 'pose' && event.y >= task.target ? 1 : 0;
    case 'store':
      return event.kind === 'store' && event.item === task.target ? event.count : 0;
  }
}

function isReach(task: Task): boolean {
  return task.type === 'reachBelow' || task.type === 'reachAbove';
}

/**
 * One event of `actor` against the world's progress (plan 5.3). Counts only for tasks of
 * the open chapter; a completed task gives its XP to everyone in `present`, a first find
 * or first craft gives XP to `actor` only. Never mutates its inputs. A pose event with no
 * open reach task returns `world` itself and shared empty lists.
 */
export function stepProgress(
  world: WorldProgress,
  actor: ProgressPlayer,
  event: ProgressEvent,
  present: readonly ProgressPlayer[],
  tables: ProgressTables = PROGRESS_TABLES,
): ProgressStep {
  const chapter = openChapter(world, tables);
  if (event.kind === 'pose') {
    // Called once per simulation step: nothing to do unless a reach task is open.
    const reach =
      chapter !== null &&
      tables.tasks.some(
        (t) => t.chapter === chapter.id && isReach(t) && !world.done.includes(t.id),
      );
    if (!reach) return { progress: world, records: NO_RECORDS, outcomes: NO_OUTCOMES };
  }

  const outcomes: ProgressOutcome[] = [];
  const records = new Map<string, PlayerRecord>();
  for (const player of present) records.set(player.id, player.record);
  if (!records.has(actor.id)) records.set(actor.id, actor.record);
  const gains = new Map<string, number>();
  const gain = (id: string, amount: number): void => {
    gains.set(id, (gains.get(id) ?? 0) + amount);
  };

  let progress = world;
  if (chapter !== null) {
    const open = tables.tasks.filter((t) => t.chapter === chapter.id);
    const finished: Task[] = [];
    const counts = new Map(world.counts.map((c) => [c.task, c.count]));
    let changed = false;
    for (const task of open) {
      if (world.done.includes(task.id)) continue;
      const amount = advance(task, event);
      if (amount <= 0) continue;
      changed = true;
      // No surplus: what is above the goal is not carried anywhere.
      const count = Math.min(task.count, (counts.get(task.id) ?? 0) + amount);
      if (count >= task.count) {
        finished.push(task);
        counts.delete(task.id);
      } else {
        counts.set(task.id, count);
      }
    }
    if (changed) {
      const done = [...world.done, ...finished.map((t) => t.id)];
      for (const task of finished) {
        outcomes.push({ kind: 'taskDone', task: task.id, actor: actor.id });
        for (const player of present) gain(player.id, task.xp);
        const unlocked = unlockedByTask(task.id, tables);
        if (unlocked) outcomes.push(unlocked);
      }
      const chapterDone = open.every((t) => done.includes(t.id));
      if (chapterDone) {
        outcomes.push({ kind: 'chapterDone', chapter: chapter.id });
        for (const task of open) counts.delete(task.id);
      }
      progress = {
        done,
        counts: tables.tasks
          .filter((t) => counts.has(t.id))
          .map((t) => ({ task: t.id, count: counts.get(t.id) ?? 0 })),
      };
    }
  }

  // First finds and first crafts: the actor's own, once per player.
  const actorRecord = records.get(actor.id) ?? actor.record;
  let found = actorRecord.found;
  let crafted = actorRecord.crafted;
  if (event.kind === 'mine') {
    const xp = tables.firstFindXp.get(event.block);
    if (xp !== undefined && !found.includes(event.block)) {
      found = [...found, event.block];
      outcomes.push({ kind: 'firstFind', player: actor.id, block: event.block });
      gain(actor.id, xp);
    }
  } else if (event.kind === 'craft' && !crafted.includes(event.recipe)) {
    crafted = [...crafted, event.recipe];
    gain(actor.id, tables.firstCraftOverrides.get(event.recipe) ?? tables.firstCraftXp);
  }

  const changedRecords: ProgressPlayer[] = [];
  const levelUps: ProgressOutcome[] = [];
  for (const [id, record] of records) {
    const amount = gains.get(id) ?? 0;
    const own = id === actor.id && (found !== record.found || crafted !== record.crafted);
    if (amount === 0 && !own) continue;
    const xp = Math.min(XP_MAX, record.xp + amount);
    const next: PlayerRecord =
      id === actor.id ? { ...record, xp, found, crafted } : { ...record, xp };
    changedRecords.push({ id, record: next });
    if (amount > 0) outcomes.push({ kind: 'xp', player: id, amount });
    const before = levelOf(record.xp, tables);
    const after = levelOf(xp, tables);
    for (let level = before + 1; level <= after; level++) {
      levelUps.push(levelUpOutcome(id, level, tables));
    }
  }
  outcomes.push(...levelUps);
  if (progress === world && changedRecords.length === 0) {
    return { progress: world, records: NO_RECORDS, outcomes: NO_OUTCOMES };
  }
  return { progress, records: changedRecords, outcomes };
}

/**
 * What a guest shows when the host reports a new book (Phase 8 part A2): each finished
 * task with the name of its player and the recipes it unlocks, then each chapter the new
 * book completes. `actor` of the outcomes is the player's name.
 */
export function outcomesOfBook(
  before: WorldProgress,
  after: WorldProgress,
  done: readonly { task: number; by: string }[],
  tables: ProgressTables = PROGRESS_TABLES,
): ProgressOutcome[] {
  const outcomes: ProgressOutcome[] = [];
  for (const { task, by } of done) {
    if (!tables.tasks.some((t) => t.id === task)) continue;
    outcomes.push({ kind: 'taskDone', task, actor: by, by });
    const unlocked = unlockedByTask(task, tables);
    if (unlocked) outcomes.push(unlocked);
  }
  for (const chapter of tables.chapters) {
    const tasks = tasksOf(chapter.id, tables);
    if (tasks.length === 0) continue;
    const complete = (p: WorldProgress) => tasks.every((t) => p.done.includes(t.id));
    if (complete(after) && !complete(before)) {
      outcomes.push({ kind: 'chapterDone', chapter: chapter.id });
    }
  }
  return outcomes;
}

/**
 * What a guest shows when the host reports a new record of its own player: the XP it
 * gained, its first finds and its level-ups, as the host's step reported them (`player`).
 */
export function outcomesOfRecord(
  before: PlayerRecord,
  after: PlayerRecord,
  player: string,
  tables: ProgressTables = PROGRESS_TABLES,
): ProgressOutcome[] {
  const outcomes: ProgressOutcome[] = [];
  for (const block of after.found) {
    if (!before.found.includes(block)) outcomes.push({ kind: 'firstFind', player, block });
  }
  if (after.xp > before.xp) {
    outcomes.push({ kind: 'xp', player, amount: after.xp - before.xp });
  }
  const from = levelOf(before.xp, tables);
  const to = levelOf(after.xp, tables);
  for (let level = from + 1; level <= to; level++) {
    outcomes.push(levelUpOutcome(player, level, tables));
  }
  return outcomes;
}
