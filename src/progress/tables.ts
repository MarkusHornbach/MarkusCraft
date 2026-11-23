// Progress tables: the task book, levels, recipe unlocks and XP sources, as plain data.
import { ACTION_REPEAT_MS, CRAFT_REPEAT_MS, SMELT_MS, WALK_SPEED } from '../game/config';
import { Item } from '../items/items';
import { Block } from '../world/blocks';

/** What a task counts (plan 5.1). A new type is one union member and one `case` in the step. */
export type TaskType = 'mine' | 'craft' | 'place' | 'reachBelow' | 'reachAbove';
export const TASK_TYPES: readonly TaskType[] = [
  'mine',
  'craft',
  'place',
  'reachBelow',
  'reachAbove',
];

export interface Chapter {
  /** Stable id, written into saves through its tasks. Append-only, never reused. */
  readonly id: number;
  readonly title: string;
}

export interface Task {
  /** Stable id, written into saves. Append-only, never reused. */
  readonly id: number;
  readonly chapter: number;
  /** The text shown ("Mine 4 logs"). */
  readonly label: string;
  readonly type: TaskType;
  /**
   * `mine`, `craft`: an item id; `place`: a block id; `reachBelow` / `reachAbove`: a feet Y.
   */
  readonly target: number;
  /** How many items or blocks; 1 for the reach tasks. */
  readonly count: number;
  readonly xp: number;
}

/** A recipe is unlocked by a level, or by a finished task: exactly one of them. */
export type Unlock = { readonly level: number } | { readonly task: number };

export interface RecipeUnlock {
  readonly recipe: number;
  readonly unlock: Unlock;
}

/** Time model of the goal bot (plan 5.10); estimated player time = bot time × `humanFactor`. */
export interface BotTime {
  /** Milliseconds per craft of the hand or the workbench. */
  readonly craftRepeatMs: number;
  /** Milliseconds per placed block. */
  readonly actionRepeatMs: number;
  /** Milliseconds per smelted item. */
  readonly smeltMs: number;
  /** Blocks per second of walking. */
  readonly walkSpeed: number;
  /** Blocks per second climbing a pillar (one jump and one place per block). */
  readonly pillarSpeed: number;
  /** Straight-line distance × this stands for the path actually walked. */
  readonly pathFactor: number;
  readonly humanFactor: number;
}

/** Blocks the generator puts into every world, which a player can break. */
export const NATURAL_BLOCKS: readonly number[] = [
  Block.GRASS,
  Block.DIRT,
  Block.STONE,
  Block.SAND,
  Block.LOG,
  Block.LEAVES,
  Block.CLAY,
  Block.COAL_ORE,
  Block.IRON_ORE,
];

/** Everything the engine and the static check read; tests build broken variants of it. */
export interface ProgressTables {
  readonly chapters: readonly Chapter[];
  readonly tasks: readonly Task[];
  /** Total XP each level starts at; index 0 is level 1 (at 0 XP). */
  readonly levels: readonly number[];
  readonly recipeUnlocks: readonly RecipeUnlock[];
  /** Block id → XP for the first block of that kind a player mines with a yield. */
  readonly firstFindXp: ReadonlyMap<number, number>;
  /** XP for the first craft of each recipe by a player. */
  readonly firstCraftXp: number;
  /** Per-recipe overrides of `firstCraftXp` (recipe id → XP). */
  readonly firstCraftOverrides: ReadonlyMap<number, number>;
}

export const CHAPTERS: readonly Chapter[] = [
  { id: 1, title: 'First wood' },
  { id: 2, title: 'Tools' },
  { id: 3, title: 'Stone and fire' },
  { id: 4, title: 'Into the dark' },
  { id: 5, title: 'Iron' },
];

function task(
  id: number,
  chapter: number,
  label: string,
  type: TaskType,
  target: number,
  count: number,
  xp: number,
): Task {
  return { id, chapter, label, type, target, count, xp };
}

/** The task book in book order. Counts and XP are tuned with the bot; ids and types stay. */
export const TASKS: readonly Task[] = [
  task(1, 1, 'Mine 32 logs', 'mine', Block.LOG, 32, 10),
  task(2, 1, 'Make 64 planks', 'craft', Block.PLANKS, 64, 10),
  task(3, 1, 'Make a workbench', 'craft', Block.WORKBENCH, 1, 10),
  task(4, 1, 'Place a workbench', 'place', Block.WORKBENCH, 1, 10),
  task(5, 2, 'Make a wooden pickaxe', 'craft', Item.WOODEN_PICKAXE, 1, 15),
  task(6, 2, 'Mine 64 stone', 'mine', Block.STONE, 64, 15),
  task(7, 2, 'Make a stone pickaxe', 'craft', Item.STONE_PICKAXE, 1, 15),
  task(8, 2, 'Climb to height 64', 'reachAbove', 64, 1, 15),
  task(9, 3, 'Make a furnace', 'craft', Block.FURNACE, 1, 20),
  task(10, 3, 'Place a furnace', 'place', Block.FURNACE, 1, 20),
  task(11, 3, 'Make 16 coal', 'craft', Item.COAL, 16, 20),
  task(12, 3, 'Mine 32 coal', 'mine', Item.COAL, 32, 20),
  task(13, 4, 'Make 32 torches', 'craft', Block.TORCH, 32, 25),
  task(14, 4, 'Reach depth 30', 'reachBelow', 30, 1, 25),
  task(15, 4, 'Place 32 torches', 'place', Block.TORCH, 32, 25),
  task(16, 4, 'Mine 20 iron ore', 'mine', Block.IRON_ORE, 20, 25),
  task(17, 5, 'Make 20 iron ingots', 'craft', Item.IRON_INGOT, 20, 30),
  task(18, 5, 'Make an iron pickaxe', 'craft', Item.IRON_PICKAXE, 1, 30),
  task(19, 5, 'Make 24 glass', 'craft', Block.GLASS, 24, 30),
  task(20, 5, 'Place 64 stone bricks', 'place', Block.STONE_BRICKS, 64, 30),
];

/** Total XP at which each level starts: level 1 at 0; the last entry is the maximum level. */
export const LEVELS: readonly number[] = [0, 60, 125, 190, 270, 370, 460];

function byLevel(level: number, recipes: readonly number[]): RecipeUnlock[] {
  return recipes.map((recipe) => ({ recipe, unlock: { level } }));
}

/** One unlock per recipe id (`src/items/recipes.ts`). Level 1 recipes are open from the start. */
export const RECIPE_UNLOCKS: readonly RecipeUnlock[] = [
  // planks, sticks, workbench, wooden pickaxe
  ...byLevel(1, [1, 2, 3, 4]),
  // wooden axe, wooden shovel, stone pickaxe
  ...byLevel(2, [5, 6, 7]),
  // stone axe, stone shovel, furnace, coal
  ...byLevel(3, [8, 9, 10, 11]),
  // stone bricks, bricks
  ...byLevel(4, [16, 18]),
  // iron ingot, glass
  ...byLevel(5, [12, 17]),
  // iron pickaxe, iron axe, iron shovel
  ...byLevel(6, [13, 14, 15]),
  // iron block
  ...byLevel(7, [19]),
  // The torch comes with "Mine 3 coal".
  { recipe: 20, unlock: { task: 12 } },
];

export const FIRST_FIND_XP: ReadonlyMap<number, number> = new Map([
  [Block.COAL_ORE, 20],
  [Block.IRON_ORE, 40],
]);

export const FIRST_CRAFT_XP = 5;
export const FIRST_CRAFT_OVERRIDES: ReadonlyMap<number, number> = new Map();

/** The shipped tables. */
export const PROGRESS_TABLES: ProgressTables = {
  chapters: CHAPTERS,
  tasks: TASKS,
  levels: LEVELS,
  recipeUnlocks: RECIPE_UNLOCKS,
  firstFindXp: FIRST_FIND_XP,
  firstCraftXp: FIRST_CRAFT_XP,
  firstCraftOverrides: FIRST_CRAFT_OVERRIDES,
};

/** The bot's time model (plan 5.10). `humanFactor` is calibrated by device test PROG-1. */
export const BOT_TIME: BotTime = {
  craftRepeatMs: CRAFT_REPEAT_MS,
  actionRepeatMs: ACTION_REPEAT_MS,
  smeltMs: SMELT_MS,
  walkSpeed: WALK_SPEED,
  pillarSpeed: 2,
  pathFactor: 1.3,
  humanFactor: 2.5,
};

const TASK_BY_ID = new Map(TASKS.map((t) => [t.id, t]));
const CHAPTER_BY_ID = new Map(CHAPTERS.map((c) => [c.id, c]));
const UNLOCK_BY_RECIPE = new Map(RECIPE_UNLOCKS.map((u) => [u.recipe, u.unlock]));

export function getTask(id: number): Task | undefined {
  return TASK_BY_ID.get(id);
}

export function getChapter(id: number): Chapter | undefined {
  return CHAPTER_BY_ID.get(id);
}

/** The unlock of a recipe; a recipe without one (a newer table) counts as level 1. */
export function unlockOf(recipe: number): Unlock {
  return UNLOCK_BY_RECIPE.get(recipe) ?? { level: 1 };
}

/** The level of a total XP in a level table: 1-based, at most `levels.length`. */
export function levelIn(levels: readonly number[], xp: number): number {
  let level = 1;
  for (let i = 1; i < levels.length; i++) {
    if (xp >= levels[i]) level = i + 1;
    else break;
  }
  return level;
}
