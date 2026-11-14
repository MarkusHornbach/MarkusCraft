import { describe, expect, it } from 'vitest';
import type { ItemStack } from '../actions/playerRecord';
import { INVENTORY_SLOTS } from '../game/config';
import { BLOCKS, Block } from '../world/blocks';
import { dropOf } from './hardness';
import type { Slots } from './inventory';
import { ITEMS, Item, isItem, itemLabel } from './items';
import {
  NO_STATIONS,
  RECIPES,
  type Recipe,
  STATION_BLOCKS,
  craftable,
  getRecipe,
  listRecipes,
  missing,
  recipeStatus,
  stationsNear,
  takeIngredients,
} from './recipes';

function slotsWith(...stacks: [number, number][]): Slots {
  const slots: (ItemStack | null)[] = new Array<ItemStack | null>(INVENTORY_SLOTS).fill(null);
  stacks.forEach(([item, count], index) => {
    slots[index] = { item, count };
  });
  return slots;
}

function byName(name: string): Recipe {
  const found = RECIPES.find((r) => r.name === name);
  if (!found) throw new Error(`no recipe ${name}`);
  return found;
}

/** A recipe as one line: "station: 3 planks + 2 stick -> 1 wooden_pickaxe". */
function line(recipe: Recipe): string {
  const name = (id: number): string => ITEMS.find((i) => i.id === id)?.name ?? `?${id}`;
  const inputs = recipe.ingredients.map((i) => `${i.count} ${name(i.item)}`).join(' + ');
  return `${recipe.station ?? '-'}: ${inputs} -> ${recipe.result.count} ${name(recipe.result.item)}`;
}

describe('recipe table (Phase 3 AC10.1)', () => {
  it('holds every recipe of plan 5.6', () => {
    expect(RECIPES.map(line).sort()).toEqual(
      [
        '-: 1 log -> 4 planks',
        '-: 2 planks -> 4 stick',
        '-: 4 planks -> 1 workbench',
        'workbench: 3 planks + 2 stick -> 1 wooden_pickaxe',
        'workbench: 3 stone + 2 stick -> 1 stone_pickaxe',
        'workbench: 3 iron_ingot + 2 stick -> 1 iron_pickaxe',
        'workbench: 3 planks + 2 stick -> 1 wooden_axe',
        'workbench: 3 stone + 2 stick -> 1 stone_axe',
        'workbench: 3 iron_ingot + 2 stick -> 1 iron_axe',
        'workbench: 1 planks + 2 stick -> 1 wooden_shovel',
        'workbench: 1 stone + 2 stick -> 1 stone_shovel',
        'workbench: 1 iron_ingot + 2 stick -> 1 iron_shovel',
        'workbench: 8 stone -> 1 furnace',
        'workbench: 4 stone -> 4 stone_bricks',
        'workbench: 9 iron_ingot -> 1 iron_block',
        'furnace: 1 iron_ore + 1 coal -> 1 iron_ingot',
        'furnace: 2 sand + 1 coal -> 2 glass',
        'furnace: 2 clay + 1 coal -> 2 bricks',
        'furnace: 2 log -> 1 coal',
      ].sort(),
    );
  });

  it('pins the recipe ids: actions name recipes by them', () => {
    expect(Object.fromEntries(RECIPES.map((r) => [r.name, r.id]))).toEqual({
      planks: 1,
      sticks: 2,
      workbench: 3,
      wooden_pickaxe: 4,
      wooden_axe: 5,
      wooden_shovel: 6,
      stone_pickaxe: 7,
      stone_axe: 8,
      stone_shovel: 9,
      furnace: 10,
      coal: 11,
      iron_ingot: 12,
      iron_pickaxe: 13,
      iron_axe: 14,
      iron_shovel: 15,
      stone_bricks: 16,
      glass: 17,
      bricks: 18,
      iron_block: 19,
    });
    for (const recipe of RECIPES) expect(getRecipe(recipe.id)).toBe(recipe);
    expect(getRecipe(0)).toBeUndefined();
    expect(getRecipe(999)).toBeUndefined();
  });

  it('uses known items only, with sensible counts', () => {
    for (const recipe of RECIPES) {
      expect(recipe.ingredients.length, recipe.name).toBeGreaterThan(0);
      for (const stack of [...recipe.ingredients, recipe.result]) {
        expect(isItem(stack.item), `${recipe.name}: ${stack.item}`).toBe(true);
        expect(Number.isInteger(stack.count) && stack.count >= 1).toBe(true);
        expect(itemLabel(stack.item)).not.toBe('Unknown item');
      }
      // An ingredient is listed once, and nothing is made from itself.
      const items = recipe.ingredients.map((i) => i.item);
      expect(new Set(items).size).toBe(items.length);
      expect(items).not.toContain(recipe.result.item);
    }
  });

  it('has no two recipes that are the same', () => {
    const key = (r: Recipe, withResult: boolean): string =>
      JSON.stringify([
        r.station,
        [...r.ingredients].sort((a, b) => a.item - b.item),
        withResult ? r.result : null,
      ]);
    expect(new Set(RECIPES.map((r) => key(r, true))).size).toBe(RECIPES.length);
    expect(new Set(RECIPES.map((r) => r.name)).size).toBe(RECIPES.length);
    expect(new Set(RECIPES.map((r) => r.result.item)).size).toBe(RECIPES.length);
    // Plan 5.6 gives pickaxe and axe of a tier the same ingredients: the list tells them
    // apart by their result. No other two recipes share ingredients and station.
    const shared = new Map<string, string[]>();
    for (const r of RECIPES) {
      shared.set(key(r, false), [...(shared.get(key(r, false)) ?? []), r.name]);
    }
    expect([...shared.values()].filter((names) => names.length > 1)).toEqual([
      ['wooden_pickaxe', 'wooden_axe'],
      ['stone_pickaxe', 'stone_axe'],
      ['iron_pickaxe', 'iron_axe'],
    ]);
  });

  it('makes every item that is no block, and every new block, by a recipe or a drop', () => {
    const made = new Set(RECIPES.map((r) => r.result.item));
    for (const def of BLOCKS) {
      const drop = dropOf(def.id);
      if (drop) made.add(drop.item);
    }
    for (const item of ITEMS) {
      if (item.block === null) expect(made.has(item.id), item.name).toBe(true);
    }
    for (const block of [Block.WORKBENCH, Block.FURNACE, Block.STONE_BRICKS, Block.IRON_BLOCK]) {
      expect(RECIPES.some((r) => r.result.item === block)).toBe(true);
    }
    // The stations are blocks of the table.
    expect(STATION_BLOCKS).toEqual({ workbench: Block.WORKBENCH, furnace: Block.FURNACE });
  });
});

describe('recipe status', () => {
  const both = { workbench: true, furnace: true };

  it('says what is missing, with "have / need" for every ingredient', () => {
    const pickaxe = byName('wooden_pickaxe');
    const slots = slotsWith([Block.PLANKS, 2], [Item.STICK, 5], [Block.PLANKS, 0]);
    const status = recipeStatus(pickaxe, slots, both);
    expect(status).toEqual({
      id: pickaxe.id,
      craftable: false,
      stationMissing: false,
      ingredients: [
        { item: Block.PLANKS, have: 2, need: 3 },
        { item: Item.STICK, have: 5, need: 2 },
      ],
      missing: [{ item: Block.PLANKS, count: 1 }],
      full: false,
    });
    expect(missing(pickaxe, slots)).toEqual([{ item: Block.PLANKS, count: 1 }]);
    expect(craftable(pickaxe, slots, both)).toBe(false);
  });

  it('counts an ingredient across all slots', () => {
    const slots = slotsWith(
      [Block.PLANKS, 1],
      [Block.STONE, 5],
      [Block.PLANKS, 2],
      [Item.STICK, 2],
    );
    expect(craftable(byName('wooden_pickaxe'), slots, both)).toBe(true);
    const taken = takeIngredients(slots, byName('wooden_pickaxe'));
    expect(taken?.[0]).toBeNull();
    expect(taken?.[2]).toBeNull();
    expect(taken?.[3]).toBeNull();
    expect(taken?.[1]).toEqual({ item: Block.STONE, count: 5 });
    // The input was not changed.
    expect(slots[0]).toEqual({ item: Block.PLANKS, count: 1 });
  });

  it('needs the station of the recipe', () => {
    const pickaxe = byName('wooden_pickaxe');
    const slots = slotsWith([Block.PLANKS, 3], [Item.STICK, 2]);
    expect(craftable(pickaxe, slots, NO_STATIONS)).toBe(false);
    expect(recipeStatus(pickaxe, slots, NO_STATIONS).stationMissing).toBe(true);
    expect(recipeStatus(pickaxe, slots, NO_STATIONS).missing).toEqual([]);
    expect(craftable(pickaxe, slots, { workbench: false, furnace: true })).toBe(false);
    expect(craftable(pickaxe, slots, { workbench: true, furnace: false })).toBe(true);
    expect(craftable(byName('planks'), slotsWith([Block.LOG, 1]), NO_STATIONS)).toBe(true);
  });

  it('is not craftable when the result has no room', () => {
    const full: (ItemStack | null)[] = [];
    for (let i = 0; i < INVENTORY_SLOTS; i++) full.push({ item: Block.DIRT, count: 99 });
    full[0] = { item: Block.LOG, count: 2 };
    const planks = byName('planks');
    const status = recipeStatus(planks, full, NO_STATIONS);
    expect(status.full).toBe(true);
    expect(status.craftable).toBe(false);
    expect(status.missing).toEqual([]);
    // With the last log the slot becomes free for the planks.
    full[0] = { item: Block.LOG, count: 1 };
    expect(craftable(planks, full, NO_STATIONS)).toBe(true);
  });

  it('lists craftable recipes first, each group in table order', () => {
    const order = (slots: Slots, stations = NO_STATIONS): string[] =>
      listRecipes(slots, stations).map((s) => getRecipe(s.id)?.name ?? '?');
    const table = RECIPES.map((r) => r.name);
    expect(order(slotsWith())).toEqual(table);
    const oneLog = order(slotsWith([Block.LOG, 1]));
    expect(oneLog[0]).toBe('planks');
    expect(oneLog.slice(1)).toEqual(table.filter((n) => n !== 'planks'));
    const listed = listRecipes(slotsWith([Block.PLANKS, 4], [Block.STONE, 8]), {
      workbench: true,
      furnace: false,
    });
    const names = listed.filter((s) => s.craftable).map((s) => getRecipe(s.id)?.name);
    expect(names).toEqual(['sticks', 'workbench', 'furnace', 'stone_bricks']);
    expect(listed.length).toBe(RECIPES.length);
    expect(listed.slice(0, 4).every((s) => s.craftable)).toBe(true);
    expect(listed.slice(4).some((s) => s.craftable)).toBe(false);
  });
});

describe('stations within reach', () => {
  const world = (cells: Record<string, number>) => ({
    getBlock: (x: number, y: number, z: number): number => cells[`${x},${y},${z}`] ?? Block.AIR,
  });
  // The eye is at (0.5, 11.62, 0.5).
  const pose = { x: 0.5, y: 10, z: 0.5 };

  it('finds a station whose block centre is within 5 of the eye, and not at 7', () => {
    expect(stationsNear(world({}), pose)).toEqual({ workbench: false, furnace: false });
    expect(stationsNear(world({ '4,11,0': Block.WORKBENCH }), pose).workbench).toBe(true);
    // Centre 5.0 to the side and 0.12 below the eye: just outside.
    expect(stationsNear(world({ '5,11,0': Block.WORKBENCH }), pose).workbench).toBe(false);
    expect(stationsNear(world({ '6,11,0': Block.WORKBENCH }), pose).workbench).toBe(false);
    expect(stationsNear(world({ '7,11,0': Block.WORKBENCH }), pose).workbench).toBe(false);
    expect(stationsNear(world({ '-4,11,0': Block.FURNACE }), pose)).toEqual({
      workbench: false,
      furnace: true,
    });
    expect(stationsNear(world({ '0,11,-7': Block.FURNACE }), pose).furnace).toBe(false);
    // Above and below count the same; the distance is measured in all three directions.
    expect(stationsNear(world({ '0,16,0': Block.FURNACE }), pose).furnace).toBe(true);
    expect(stationsNear(world({ '0,6,0': Block.FURNACE }), pose).furnace).toBe(false);
    expect(stationsNear(world({ '3,13,3': Block.WORKBENCH }), pose).workbench).toBe(true);
    expect(stationsNear(world({ '4,14,3': Block.WORKBENCH }), pose).workbench).toBe(false);
  });

  it('reports both stations at once', () => {
    const cells = { '1,10,0': Block.WORKBENCH, '0,10,1': Block.FURNACE, '2,10,2': Block.STONE };
    expect(stationsNear(world(cells), pose)).toEqual({ workbench: true, furnace: true });
  });
});
