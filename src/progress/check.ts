// Static check of the progress tables: ids, references and that the book can be finished.
import { WORLD_HEIGHT } from '../game/config';
import { dropOf } from '../items/hardness';
import { getItemDef, toolOf } from '../items/items';
import { RECIPES, type Recipe, STATION_BLOCKS } from '../items/recipes';
import { BLOCK_EMISSION, getBlockDef } from '../world/blocks';
import { NATURAL_BLOCKS, type ProgressTables, type Task, type Unlock, levelIn } from './tables';

/** XP and level at the end of one chapter, as the fixed point reaches them. */
export interface ChapterXp {
  chapter: number;
  xp: number;
  level: number;
}

export interface CheckResult {
  ok: boolean;
  /** One line per problem, naming the task, chapter, level or recipe. */
  errors: string[];
  /** Guaranteed XP after each chapter (empty when the structure is broken). */
  chapters: ChapterXp[];
}

const MAX_TASKS_PER_CHAPTER = 6;

/** Ids, references and table shapes (plan 5.10, first list). */
function checkStructure(tables: ProgressTables, recipes: readonly Recipe[]): string[] {
  const errors: string[] = [];
  const chapterIds = new Set<number>();
  for (const chapter of tables.chapters) {
    if (chapterIds.has(chapter.id)) errors.push(`chapter ${chapter.id} is listed twice`);
    chapterIds.add(chapter.id);
  }
  const taskIds = new Set<number>();
  const perChapter = new Map<number, number>();
  for (const task of tables.tasks) {
    const name = `task ${task.id} "${task.label}"`;
    if (taskIds.has(task.id)) errors.push(`${name}: id is used twice`);
    taskIds.add(task.id);
    if (!chapterIds.has(task.chapter)) errors.push(`${name}: unknown chapter ${task.chapter}`);
    perChapter.set(task.chapter, (perChapter.get(task.chapter) ?? 0) + 1);
    if (!Number.isInteger(task.count) || task.count < 1) errors.push(`${name}: bad count`);
    if (!Number.isInteger(task.xp) || task.xp < 0) errors.push(`${name}: bad XP`);
    switch (task.type) {
      case 'mine':
      case 'craft':
        if (!getItemDef(task.target)) errors.push(`${name}: unknown item ${task.target}`);
        break;
      case 'place':
        if ((getItemDef(task.target)?.block ?? null) === null) {
          errors.push(`${name}: unknown block ${task.target}`);
        }
        break;
      case 'reachBelow':
      case 'reachAbove':
        if (task.target < 1 || task.target >= WORLD_HEIGHT || task.count !== 1) {
          errors.push(`${name}: bad height`);
        }
        break;
    }
  }
  for (const chapter of tables.chapters) {
    const n = perChapter.get(chapter.id) ?? 0;
    if (n < 1 || n > MAX_TASKS_PER_CHAPTER) {
      errors.push(`chapter ${chapter.id} "${chapter.title}" has ${n} tasks (1–6)`);
    }
  }
  if (tables.levels.length === 0 || tables.levels[0] !== 0)
    errors.push('level 1 must start at 0 XP');
  for (let i = 1; i < tables.levels.length; i++) {
    if (!(tables.levels[i] > tables.levels[i - 1])) {
      errors.push(`level ${i + 1} does not rise above level ${i}`);
    }
  }
  const recipeIds = new Set(recipes.map((r) => r.id));
  const unlocks = new Map<number, number>();
  for (const { recipe, unlock } of tables.recipeUnlocks) {
    if (!recipeIds.has(recipe)) errors.push(`unlock of unknown recipe ${recipe}`);
    unlocks.set(recipe, (unlocks.get(recipe) ?? 0) + 1);
    if ('level' in unlock) {
      if (
        !Number.isInteger(unlock.level) ||
        unlock.level < 1 ||
        unlock.level > tables.levels.length
      ) {
        errors.push(`recipe ${recipe}: unknown level ${unlock.level}`);
      }
    } else if (!taskIds.has(unlock.task)) {
      errors.push(`recipe ${recipe}: unknown task ${unlock.task}`);
    }
  }
  for (const recipe of recipes) {
    const n = unlocks.get(recipe.id) ?? 0;
    if (n === 0) errors.push(`recipe ${recipe.id} (${recipe.name}) has no unlock`);
    if (n > 1) errors.push(`recipe ${recipe.id} (${recipe.name}) has ${n} unlocks`);
  }
  return errors;
}

/** What the player has reached in the fixed point. */
interface State {
  xp: number;
  done: Set<number>;
  crafted: Set<number>;
  found: Set<number>;
}

/**
 * Plays the book abstractly: in each open chapter complete every task whose requirement
 * can be produced from the natural blocks and the recipes unlocked so far, adding its XP
 * and the first crafts and finds it forces, until the chapter is done (plan 5.10).
 */
function checkReachability(
  tables: ProgressTables,
  recipes: readonly Recipe[],
): { errors: string[]; chapters: ChapterXp[] } {
  const state: State = { xp: 0, done: new Set(), crafted: new Set(), found: new Set() };
  const unlockOf = new Map<number, Unlock>(tables.recipeUnlocks.map((u) => [u.recipe, u.unlock]));
  const unlocked = (recipe: Recipe): boolean => {
    const unlock = unlockOf.get(recipe.id);
    if (!unlock) return false;
    if ('level' in unlock) return levelIn(tables.levels, state.xp) >= unlock.level;
    return state.done.has(unlock.task);
  };

  /** Recipes whose result is a block that emits light (the torch). */
  const lightSources = recipes.filter((r) => {
    const block = getItemDef(r.result.item)?.block ?? null;
    return block !== null && BLOCK_EMISSION[block] > 0;
  });
  const dark = new Set(tables.darkBlocks);
  /** Whether a light source is unlocked and can be made: then dark blocks count. */
  let lit = false;
  const sourceBlocks = (): readonly number[] =>
    lit ? NATURAL_BLOCKS : NATURAL_BLOCKS.filter((b) => !dark.has(b));

  /** Items the player can get now: mined with tools it can get, crafted from them. */
  const obtainable = (): Set<number> => {
    const have = obtainableFrom();
    if (!lit && lightSources.some((r) => have.has(r.result.item))) {
      lit = true;
      return obtainableFrom();
    }
    return have;
  };

  const obtainableFrom = (): Set<number> => {
    const have = new Set<number>();
    for (let changed = true; changed;) {
      changed = false;
      const add = (item: number): void => {
        if (!have.has(item)) {
          have.add(item);
          changed = true;
        }
      };
      const held = [null, ...[...have].filter((item) => toolOf(item) !== null)];
      for (const block of sourceBlocks()) {
        for (const tool of held) {
          const drop = dropOf(block, tool);
          if (drop) add(drop.item);
        }
      }
      for (const recipe of recipes) {
        if (!unlocked(recipe)) continue;
        if (recipe.station && !have.has(STATION_BLOCKS[recipe.station])) continue;
        if (recipe.ingredients.every((i) => have.has(i.item))) add(recipe.result.item);
      }
    }
    return have;
  };

  const sourcesOf = (item: number, have: Set<number>): number[] => {
    const held = [null, ...[...have].filter((i) => toolOf(i) !== null)];
    return sourceBlocks().filter((block) =>
      held.some((tool) => dropOf(block, tool)?.item === item),
    );
  };
  const makers = (item: number, have: Set<number>): Recipe[] =>
    recipes.filter(
      (r) =>
        r.result.item === item &&
        unlocked(r) &&
        (!r.station || have.has(STATION_BLOCKS[r.station])) &&
        r.ingredients.every((i) => have.has(i.item)),
    );

  /** The first crafts and finds that getting `item` cannot avoid. */
  const force = (
    item: number,
    have: Set<number>,
    out: { crafts: Set<number>; finds: Set<number> },
    seen: Set<number>,
    viaRecipe: boolean,
  ): void => {
    if (seen.has(item)) return;
    seen.add(item);
    if (!viaRecipe) {
      const sources = sourcesOf(item, have);
      if (sources.length > 0) {
        if (sources.length === 1 && tables.firstFindXp.has(sources[0])) out.finds.add(sources[0]);
        return;
      }
    }
    const options = makers(item, have);
    if (options.length !== 1) return;
    const recipe = options[0];
    out.crafts.add(recipe.id);
    for (const ingredient of recipe.ingredients) force(ingredient.item, have, out, seen, false);
    if (recipe.station) force(STATION_BLOCKS[recipe.station], have, out, seen, false);
  };

  const canDo = (task: Task, have: Set<number>): boolean => {
    switch (task.type) {
      case 'mine':
        return sourcesOf(task.target, have).length > 0;
      case 'craft':
        return makers(task.target, have).length > 0;
      case 'place':
        return have.has(task.target);
      case 'reachBelow':
        return lit;
      case 'reachAbove':
        return true;
    }
  };

  /** Why a stuck task would be possible with light ("coal ore", "depth 30"), else null. */
  const needsLight = (task: Task): string | null => {
    if (lit) return null;
    if (task.type === 'reachBelow') return `depth ${task.target}`;
    lit = true;
    const have = obtainableFrom();
    const possible = canDo(task, have);
    const sources = task.type === 'mine' ? sourcesOf(task.target, have) : [];
    lit = false;
    if (!possible) return null;
    const needed = sources.filter((b) => dark.has(b));
    return (needed.length > 0 ? needed : [...dark])
      .map((b) => getBlockDef(b).label.toLowerCase())
      .join(', ');
  };

  const complete = (task: Task, have: Set<number>): void => {
    const out = { crafts: new Set<number>(), finds: new Set<number>() };
    if (task.type === 'mine') {
      const sources = sourcesOf(task.target, have);
      if (sources.length === 1 && tables.firstFindXp.has(sources[0])) out.finds.add(sources[0]);
    } else if (task.type === 'craft') {
      force(task.target, have, out, new Set(), true);
    } else if (task.type === 'place') {
      force(task.target, have, out, new Set(), false);
    }
    let gain = task.xp;
    for (const recipe of out.crafts) {
      if (state.crafted.has(recipe)) continue;
      state.crafted.add(recipe);
      gain += tables.firstCraftOverrides.get(recipe) ?? tables.firstCraftXp;
    }
    for (const block of out.finds) {
      if (state.found.has(block)) continue;
      state.found.add(block);
      gain += tables.firstFindXp.get(block) ?? 0;
    }
    state.xp += gain;
    state.done.add(task.id);
  };

  const errors: string[] = [];
  const chapters: ChapterXp[] = [];
  for (const chapter of tables.chapters) {
    const tasks = tables.tasks.filter((t) => t.chapter === chapter.id);
    for (let progress = true; progress;) {
      progress = false;
      for (const task of tasks) {
        if (state.done.has(task.id)) continue;
        const have = obtainable();
        if (!canDo(task, have)) continue;
        complete(task, have);
        progress = true;
      }
    }
    const stuck = tasks.filter((t) => !state.done.has(t.id));
    if (stuck.length > 0) {
      for (const task of stuck) {
        const light = needsLight(task);
        const why = light === null ? '' : `: needs light (${light}), no light source before it`;
        errors.push(
          `chapter ${chapter.id} "${chapter.title}" cannot be finished: task ${task.id} "${task.label}"${why}`,
        );
      }
      return { errors, chapters };
    }
    chapters.push({ chapter: chapter.id, xp: state.xp, level: levelIn(tables.levels, state.xp) });
  }
  for (const recipe of recipes) {
    if (!unlocked(recipe)) {
      errors.push(`recipe ${recipe.id} (${recipe.name}) is never unlocked`);
    }
  }
  return { errors, chapters };
}

/** The whole static check (plan 5.10). Structure first; reachability only on a sound table. */
export function checkTables(
  tables: ProgressTables,
  recipes: readonly Recipe[] = RECIPES,
): CheckResult {
  const errors = checkStructure(tables, recipes);
  if (errors.length > 0) return { ok: false, errors, chapters: [] };
  const reach = checkReachability(tables, recipes);
  return { ok: reach.errors.length === 0, errors: reach.errors, chapters: reach.chapters };
}
