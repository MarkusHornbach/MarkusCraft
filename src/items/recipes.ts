// Recipes: one table of what can be made from what, and where. Pure.
import type { ItemStack } from '../actions/playerRecord';
import { PLAYER_EYE_HEIGHT, STATION_REACH } from '../game/config';
import { Block } from '../world/blocks';
import { fits, takeItems, countItems, type Slots } from './inventory';
import { Item } from './items';

/** A station is a placed block; standing within reach of one unlocks its recipes. */
export type Station = 'workbench' | 'furnace';
export const STATIONS: readonly Station[] = ['workbench', 'furnace'];
export const STATION_BLOCKS: Readonly<Record<Station, number>> = {
  workbench: Block.WORKBENCH,
  furnace: Block.FURNACE,
};

export interface Recipe {
  /** Stable number an action names the recipe by. Never renumber; only append. */
  id: number;
  /** Lower-case key for code and tests. */
  name: string;
  station: Station | null;
  ingredients: readonly ItemStack[];
  result: ItemStack;
}

function recipe(
  id: number,
  name: string,
  station: Station | null,
  ingredients: readonly (readonly [number, number])[],
  result: readonly [number, number],
): Recipe {
  return {
    id,
    name,
    station,
    ingredients: ingredients.map(([item, count]) => ({ item, count })),
    result: { item: result[0], count: result[1] },
  };
}

/** Pickaxe, axe and shovel of one tier, from 3, 3 and 1 of its material plus 2 sticks. */
function tools(
  firstId: number,
  tier: string,
  materialItem: number,
  pickaxe: number,
  axe: number,
  shovel: number,
): Recipe[] {
  const sticks = [Item.STICK, 2] as const;
  return [
    recipe(firstId, `${tier}_pickaxe`, 'workbench', [[materialItem, 3], sticks], [pickaxe, 1]),
    recipe(firstId + 1, `${tier}_axe`, 'workbench', [[materialItem, 3], sticks], [axe, 1]),
    recipe(firstId + 2, `${tier}_shovel`, 'workbench', [[materialItem, 1], sticks], [shovel, 1]),
  ];
}

/**
 * The recipe table (plan 5.6), in the order a player meets the recipes: wood first, then
 * stone, the furnace and what it makes, then iron. The recipe list shows it in this order.
 */
export const RECIPES: readonly Recipe[] = [
  recipe(1, 'planks', null, [[Block.LOG, 1]], [Block.PLANKS, 4]),
  recipe(2, 'sticks', null, [[Block.PLANKS, 2]], [Item.STICK, 4]),
  recipe(3, 'workbench', null, [[Block.PLANKS, 4]], [Block.WORKBENCH, 1]),
  ...tools(4, 'wooden', Block.PLANKS, Item.WOODEN_PICKAXE, Item.WOODEN_AXE, Item.WOODEN_SHOVEL),
  ...tools(7, 'stone', Block.STONE, Item.STONE_PICKAXE, Item.STONE_AXE, Item.STONE_SHOVEL),
  recipe(10, 'furnace', 'workbench', [[Block.STONE, 8]], [Block.FURNACE, 1]),
  recipe(11, 'coal', 'furnace', [[Block.LOG, 2]], [Item.COAL, 1]),
  recipe(
    12,
    'iron_ingot',
    'furnace',
    [
      [Block.IRON_ORE, 1],
      [Item.COAL, 1],
    ],
    [Item.IRON_INGOT, 1],
  ),
  ...tools(13, 'iron', Item.IRON_INGOT, Item.IRON_PICKAXE, Item.IRON_AXE, Item.IRON_SHOVEL),
  recipe(16, 'stone_bricks', 'workbench', [[Block.STONE, 4]], [Block.STONE_BRICKS, 4]),
  recipe(
    17,
    'glass',
    'furnace',
    [
      [Block.SAND, 2],
      [Item.COAL, 1],
    ],
    [Block.GLASS, 2],
  ),
  recipe(
    18,
    'bricks',
    'furnace',
    [
      [Block.CLAY, 2],
      [Item.COAL, 1],
    ],
    [Block.BRICKS, 2],
  ),
  recipe(19, 'iron_block', 'workbench', [[Item.IRON_INGOT, 9]], [Block.IRON_BLOCK, 1]),
];

const BY_ID = new Map(RECIPES.map((r) => [r.id, r]));

export function getRecipe(id: number): Recipe | undefined {
  return BY_ID.get(id);
}

/** Which stations are within reach. */
export type StationsNear = Readonly<Record<Station, boolean>>;
export const NO_STATIONS: StationsNear = { workbench: false, furnace: false };

/**
 * Looks for station blocks around a player: a station counts when the centre of its block
 * lies within `STATION_REACH` of the eye. `pose` is the centre of the feet.
 */
export function stationsNear(
  world: { getBlock(x: number, y: number, z: number): number },
  pose: { x: number; y: number; z: number },
): StationsNear {
  const ex = pose.x;
  const ey = pose.y + PLAYER_EYE_HEIGHT;
  const ez = pose.z;
  const r = STATION_REACH;
  let workbench = false;
  let furnace = false;
  for (let y = Math.floor(ey - r); y <= Math.floor(ey + r); y++) {
    const dy = y + 0.5 - ey;
    for (let z = Math.floor(ez - r); z <= Math.floor(ez + r); z++) {
      const dz = z + 0.5 - ez;
      for (let x = Math.floor(ex - r); x <= Math.floor(ex + r); x++) {
        const dx = x + 0.5 - ex;
        if (dx * dx + dy * dy + dz * dz > r * r) continue;
        const block = world.getBlock(x, y, z);
        if (block === Block.WORKBENCH) workbench = true;
        else if (block === Block.FURNACE) furnace = true;
      }
    }
    if (workbench && furnace) break;
  }
  return { workbench, furnace };
}

/** One ingredient of a recipe against what the player has. */
export interface IngredientStatus {
  item: number;
  have: number;
  need: number;
}

export interface RecipeStatus {
  id: number;
  /** Everything is there: station, ingredients and room for the result. */
  craftable: boolean;
  /** The recipe needs a station that is not within reach. */
  stationMissing: boolean;
  /** Every ingredient with the count the player has; `have < need` marks a short one. */
  ingredients: IngredientStatus[];
  /** Ingredients the player is short of: the item and how many are missing. */
  missing: ItemStack[];
  /** The result would not fit into the inventory once the ingredients are taken. */
  full: boolean;
}

/** The slots after the ingredients were taken out, or null if one is short. */
export function takeIngredients(slots: Slots, recipe: Recipe): Slots | null {
  let next: Slots | null = slots;
  for (const { item, count } of recipe.ingredients) {
    next = takeItems(next, item, count);
    if (!next) return null;
  }
  return next;
}

/** What stands between the player and a recipe. */
export function recipeStatus(recipe: Recipe, slots: Slots, stations: StationsNear): RecipeStatus {
  const ingredients = recipe.ingredients.map(({ item, count }) => ({
    item,
    have: countItems(slots, item),
    need: count,
  }));
  const missing = ingredients
    .filter((i) => i.have < i.need)
    .map((i) => ({ item: i.item, count: i.need - i.have }));
  const stationMissing = recipe.station !== null && !stations[recipe.station];
  const taken = missing.length === 0 ? takeIngredients(slots, recipe) : null;
  const full = taken !== null && !fits(taken, recipe.result.item, recipe.result.count);
  return {
    id: recipe.id,
    craftable: !stationMissing && taken !== null && !full,
    stationMissing,
    ingredients,
    missing,
    full,
  };
}

export function craftable(recipe: Recipe, slots: Slots, stations: StationsNear): boolean {
  return recipeStatus(recipe, slots, stations).craftable;
}

/** The ingredients the player is short of. */
export function missing(recipe: Recipe, slots: Slots): ItemStack[] {
  return recipeStatus(recipe, slots, NO_STATIONS).missing;
}

/**
 * The recipes as the list shows them: craftable ones first, then the others, each group
 * in table order.
 */
export function listRecipes(slots: Slots, stations: StationsNear): RecipeStatus[] {
  const all = RECIPES.map((r) => recipeStatus(r, slots, stations));
  return [...all.filter((s) => s.craftable), ...all.filter((s) => !s.craftable)];
}
