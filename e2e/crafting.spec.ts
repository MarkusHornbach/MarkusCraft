// Phase 3 part C: the crafted blocks, tools, the recipe list and the way to a stone pickaxe.
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import {
  DEG,
  PLATFORM_Y,
  getBlock,
  getState,
  give,
  inventory,
  openGame,
  setBlock,
  setPlayer,
  standOnPlatform,
  step,
  submit,
  whenIdle,
} from './game';
import { capture, centerRegion, colorDistance, meanColor, shareOf, type Rgb } from './helpers';
import { TOUCH_DEVICE, centerOf, openTouchGame, swipe } from './touch';

const STONE = 3;
const PLANKS = 7;
const WORKBENCH = 15;
const FURNACE = 16;
const STONE_BRICKS = 17;
const IRON_BLOCK = 18;
const AIR = 0;
const DIRT = 2;
const IRON_ORE = 13;
const WOODEN_PICKAXE = 259;
const STONE_PICKAXE = 262;
const IRON_SHOVEL = 267;
const LOG = 5;
const COAL = 256;
const STICK = 257;
const RECIPE_COUNT = 20;
const COAL_RECIPE = 11;

/** A Gathering world; the player stands on a platform of `block`, looking at the cell ahead. */
async function onPlatform(page: Page, block: number): Promise<{ px: number; pz: number }> {
  await openGame(page, { mode: 'gathering' });
  const at = await standOnPlatform(page, block);
  await setPlayer(page, { pitch: -50 * DEG });
  expect((await getState(page)).target).toMatchObject({ x: at.px, y: PLATFORM_Y, z: at.pz - 1 });
  return at;
}

async function hold(page: Page): Promise<void> {
  await page.mouse.move(480, 270);
  await page.mouse.down();
}

test('Phase 3 AC10.5: workbench, furnace, stone bricks and iron block have their own tiles and are in the palette', async ({
  page,
}) => {
  await openGame(page);
  const { px, pz } = await standOnPlatform(page);
  const wall = async (
    id: number,
  ): Promise<{ mean: Rgb; dark: number; glow: number; bright: number }> => {
    // A wall that fills the centre of the view, two blocks in front of the player.
    await page.evaluate(
      async ([x0, y0, z0, block]) => {
        for (let dy = 0; dy < 4; dy++) {
          for (let dx = -3; dx <= 3; dx++) window.__mc.setBlock(x0 + dx, y0 + dy, z0, block);
        }
        await window.__mc.whenIdle();
      },
      [px, PLATFORM_Y + 1, pz - 3, id],
    );
    const image = await capture(page);
    const region = centerRegion(image, 0.3);
    return {
      mean: meanColor(image, region),
      dark: shareOf(image, (r, g, b) => r + g + b < 150, region),
      glow: shareOf(image, (r, g, b) => r > 150 && r > g + 40 && g > b + 20, region),
      bright: shareOf(image, (r, g, b) => r + g + b > 480, region),
    };
  };

  const stone = await wall(STONE);
  const planks = await wall(PLANKS);
  const workbench = await wall(WORKBENCH);
  const furnace = await wall(FURNACE);
  const bricks = await wall(STONE_BRICKS);
  const iron = await wall(IRON_BLOCK);

  // Workbench: wood like the planks, but darker through its rails and legs.
  expect(workbench.mean.r).toBeGreaterThan(workbench.mean.b + 30);
  expect(colorDistance(workbench.mean, planks.mean)).toBeGreaterThan(10);
  expect(colorDistance(workbench.mean, stone.mean)).toBeGreaterThan(30);
  // Furnace: grey stone with a black opening and glowing embers.
  expect(furnace.dark).toBeGreaterThan(stone.dark + 0.03);
  expect(furnace.glow).toBeGreaterThan(0.01);
  expect(stone.glow).toBeLessThan(0.002);
  expect(bricks.glow).toBeLessThan(0.002);
  // Stone bricks: grey as stone, with dark grooves between the blocks.
  expect(Math.abs(bricks.mean.r - bricks.mean.b)).toBeLessThan(14);
  expect(bricks.dark).toBeGreaterThan(stone.dark + 0.01);
  expect(bricks.dark).toBeLessThan(furnace.dark);
  // Iron block: by far the brightest of them.
  expect(iron.bright).toBeGreaterThan(0.6);
  expect(iron.bright).toBeGreaterThan(stone.bright + 0.5);
  const all = [stone, planks, workbench, furnace, bricks, iron];
  for (let a = 0; a < all.length; a++) {
    for (let b = a + 1; b < all.length; b++) {
      expect(colorDistance(all[a].mean, all[b].mean), `${a} against ${b}`).toBeGreaterThan(4);
    }
  }

  // All four are in the Creative palette and go into the bar from there.
  await page.keyboard.press('KeyE');
  for (const name of ['workbench', 'furnace', 'stone_bricks', 'iron_block']) {
    await expect(page.locator(`.palette-slot[data-item="${name}"]`)).toHaveCount(1);
    await expect(page.locator(`.palette-slot[data-item="${name}"] canvas`)).toHaveCount(1);
  }
  await page.locator('.palette-slot[data-item="furnace"]').click();
  await expect(page.locator('.inv-slot[data-index="0"]')).toHaveAttribute('data-item', 'furnace');
});

test('Phase 3 AC11.3: stone takes 180 steps by hand and 45 with a stone pickaxe', async ({
  page,
}) => {
  const { px, pz } = await onPlatform(page, STONE);
  const ahead = (n: number): Promise<number> => getBlock(page, px, PLATFORM_Y, pz - n);

  // By hand: three seconds, and the stone is lost.
  await hold(page);
  await step(page, 179);
  expect(await ahead(1)).toBe(STONE);
  expect((await getState(page)).breaking?.progress).toBeGreaterThan(0.98);
  await step(page, 2);
  expect(await ahead(1)).toBe(AIR);
  await page.mouse.up();
  expect((await inventory(page)).every((slot) => slot === null)).toBe(true);
  await expect(page.locator('.pickup-notice')).toBeHidden();

  // With a stone pickaxe in the hand: a quarter of the time, and the stone is kept.
  await give(page, STONE_PICKAXE, 1);
  expect((await getState(page)).target).toMatchObject({ x: px, y: PLATFORM_Y, z: pz - 2 });
  await hold(page);
  await step(page, 44);
  expect(await ahead(2)).toBe(STONE);
  await step(page, 2);
  expect(await ahead(2)).toBe(AIR);
  expect((await inventory(page))[1]).toEqual({ item: STONE, count: 1 });
  await expect(page.locator('.pickup-notice')).toHaveText('+1 Stone');
  await page.mouse.up();

  // A tool of another class is as slow as the hand, and yields no stone either.
  await setBlock(page, px, PLATFORM_Y, pz - 1, STONE);
  await setBlock(page, px, PLATFORM_Y, pz - 2, STONE);
  await page.evaluate(() => window.__mc.clearInventory());
  await give(page, IRON_SHOVEL, 1);
  await hold(page);
  await step(page, 179);
  expect(await ahead(1)).toBe(STONE);
  await step(page, 2);
  expect(await ahead(1)).toBe(AIR);
  await page.mouse.up();
  expect(await inventory(page)).toEqual([{ item: IRON_SHOVEL, count: 1 }, ...Array(35).fill(null)]);
});

test('Phase 3 AC11.4: the HUD says which tool a block needs, before and during breaking', async ({
  page,
}) => {
  const { px, pz } = await onPlatform(page, STONE);
  const message = page.locator('.hud-message');
  // Empty hand on stone.
  await expect(message).toBeVisible();
  await expect(message).toHaveText('Needs a pickaxe');
  // During breaking as well.
  await hold(page);
  await step(page, 20);
  expect((await getState(page)).breaking).not.toBeNull();
  await expect(message).toHaveText('Needs a pickaxe');
  await page.mouse.up();
  await step(page, 1);

  // With any pickaxe the hint is gone.
  await give(page, WOODEN_PICKAXE, 1);
  await step(page, 1);
  await expect(message).toBeHidden();

  // Iron ore asks for a stone pickaxe; a wooden one is not enough.
  await setBlock(page, px, PLATFORM_Y, pz - 1, IRON_ORE);
  await step(page, 1);
  await expect(message).toHaveText('Needs a stone pickaxe');
  await hold(page);
  await step(page, 20);
  await expect(message).toHaveText('Needs a stone pickaxe');
  await page.mouse.up();
  await give(page, STONE_PICKAXE, 1);
  await page.keyboard.press('Digit2');
  await step(page, 1);
  await expect(message).toBeHidden();
  // Back to the wooden one, then to an empty slot.
  await page.keyboard.press('Digit1');
  await step(page, 1);
  await expect(message).toHaveText('Needs a stone pickaxe');
  await page.keyboard.press('Digit5');
  await step(page, 1);
  await expect(message).toHaveText('Needs a stone pickaxe');

  // A block that needs no tool shows nothing, and neither does looking at the sky.
  await setBlock(page, px, PLATFORM_Y, pz - 1, DIRT);
  await step(page, 1);
  await expect(message).toBeHidden();
  await setBlock(page, px, PLATFORM_Y, pz - 1, STONE);
  await step(page, 1);
  await expect(message).toHaveText('Needs a pickaxe');
  await setPlayer(page, { pitch: 60 * DEG });
  await step(page, 1);
  await expect(message).toBeHidden();
});

test('Phase 3 AC11.4: Creative shows no tool hint', async ({ page }) => {
  await openGame(page);
  await standOnPlatform(page, STONE);
  await setPlayer(page, { pitch: -50 * DEG });
  await step(page, 1);
  expect((await getState(page)).target?.id).toBe(STONE);
  await expect(page.locator('.hud-message')).toBeHidden();
});

test('Phase 3 AC11.5: a tool in the selected slot cannot be placed and shows no count', async ({
  page,
}) => {
  const { px, pz } = await onPlatform(page, DIRT);
  await give(page, STONE_PICKAXE, 1);
  await give(page, STONE_PICKAXE, 1);
  await give(page, DIRT, 2);
  // Tools do not stack: two pickaxes take two slots.
  const slots = await inventory(page);
  expect(slots.slice(0, 3)).toEqual([
    { item: STONE_PICKAXE, count: 1 },
    { item: STONE_PICKAXE, count: 1 },
    { item: DIRT, count: 2 },
  ]);
  const first = page.locator('.hotbar-slot[data-slot="1"]');
  await expect(first).toHaveAttribute('data-item', 'stone_pickaxe');
  await expect(first.locator('canvas')).toHaveCount(1);
  await expect(first.locator('.slot-count')).toHaveCount(0);
  await expect(page.locator('.hotbar-slot[data-slot="3"] .slot-count')).toHaveText('2');
  // Selecting it names it.
  await page.keyboard.press('Digit2');
  await expect(page.locator('.hotbar-label')).toHaveText('Stone pickaxe');
  await page.keyboard.press('Digit1');

  // A right click with the tool in the hand places nothing.
  await page.mouse.move(480, 270);
  await page.mouse.click(480, 270, { button: 'right' });
  await step(page, 2);
  expect(await getBlock(page, px, PLATFORM_Y + 1, pz - 1)).toBe(AIR);
  expect(await inventory(page)).toEqual(slots);
  expect(await submit(page, { kind: 'place', x: px, y: PLATFORM_Y + 1, z: pz - 1, slot: 0 })).toBe(
    'invalid',
  );
  // The dirt next to it can be placed as before.
  await page.keyboard.press('Digit3');
  await page.mouse.click(480, 270, { button: 'right' });
  await step(page, 2);
  expect(await getBlock(page, px, PLATFORM_Y + 1, pz - 1)).toBe(DIRT);

  // Two pickaxes do not merge in the inventory either.
  expect(await submit(page, { kind: 'moveStack', from: 0, to: 1 })).toBe(true);
  expect((await inventory(page)).slice(0, 2)).toEqual(slots.slice(0, 2));
});

// --- Step 12: the recipe list ----------------------------------------------------------

const row = (page: Page, name: string) => page.locator(`.recipe-row[data-recipe="${name}"]`);
const craftButton = (page: Page, name: string) => row(page, name).locator('.recipe-craft');
const note = (page: Page, name: string) => row(page, name).locator('.recipe-note');
const ingredient = (page: Page, name: string, item: string) =>
  row(page, name).locator(`.recipe-ingredient[data-item="${item}"]`);

/** Opens the inventory screen with the keyboard and chooses the "Crafting" tab. */
async function openCrafting(page: Page): Promise<void> {
  await page.keyboard.press('KeyE');
  await page.locator('.inventory-tab[data-tab="crafting"]').click();
  await expect(page.locator('.recipe-list')).toBeVisible();
  expect((await getState(page)).ui).toEqual({ screen: 'inventory', tab: 'crafting' });
}

/** The recipes from top to bottom as the list shows them. */
function listOrder(page: Page): Promise<string[]> {
  return page
    .locator('.recipe-row')
    .evaluateAll((nodes) => nodes.map((node) => (node as HTMLElement).dataset.recipe ?? ''));
}

/** The recipes that show a "Craft" button. */
function withButton(page: Page): Promise<string[]> {
  return page
    .locator('.recipe-row:has(.recipe-craft:not([hidden]))')
    .evaluateAll((nodes) => nodes.map((node) => (node as HTMLElement).dataset.recipe ?? ''));
}

/** How many of an item the player has in all slots. */
async function have(page: Page, item: number): Promise<number> {
  return (await inventory(page)).reduce((sum, s) => sum + (s?.item === item ? s.count : 0), 0);
}

/** Places the block from the given slot (0-based) through the action layer. */
async function place(page: Page, x: number, y: number, z: number, item: number): Promise<void> {
  const slot = (await inventory(page)).findIndex((s) => s?.item === item);
  expect(slot).toBeGreaterThanOrEqual(0);
  expect(slot).toBeLessThan(9);
  expect(await submit(page, { kind: 'selectSlot', slot })).toBe(true);
  expect(await submit(page, { kind: 'place', x, y, z, slot })).toBe(true);
}

test('Phase 3 AC12.1: the Crafting tab lists every recipe; one log makes planks craftable and first, and crafting reorders the list', async ({
  page,
}) => {
  await openGame(page, { mode: 'gathering' });
  await give(page, LOG, 1);
  await page.keyboard.press('KeyE');
  // The screen opens on the items page; the list is the second tab.
  expect((await getState(page)).ui).toEqual({ screen: 'inventory', tab: 'items' });
  await expect(page.locator('.inventory-tab')).toHaveText(['Items', 'Crafting']);
  await expect(page.locator('.recipe-list')).toBeHidden();
  await page.locator('.inventory-tab[data-tab="crafting"]').click();
  await expect(page.locator('.recipe-list')).toBeVisible();
  await expect(page.locator('.inventory-grid')).toBeHidden();
  await expect(page.locator('.inventory-tab.active')).toHaveText('Crafting');

  // Every recipe has a row with the icon and the name of its result.
  await expect(page.locator('.recipe-row')).toHaveCount(RECIPE_COUNT);
  await expect(page.locator('.recipe-row .recipe-result canvas')).toHaveCount(RECIPE_COUNT);
  let state = await getState(page);
  expect(state.recipes).toHaveLength(RECIPE_COUNT);
  expect(await listOrder(page)).toEqual(state.recipes.map((r) => r.name));
  await expect(row(page, 'planks').locator('.recipe-name')).toHaveText('Planks');
  await expect(row(page, 'planks').locator('.recipe-result-count')).toHaveText('4');
  await expect(row(page, 'iron_pickaxe').locator('.recipe-name')).toHaveText('Iron pickaxe');
  await expect(row(page, 'iron_pickaxe').locator('.recipe-result-count')).toHaveCount(0);

  // With one log only the planks can be made, and they stand first.
  expect(state.recipes.filter((r) => r.craftable).map((r) => r.name)).toEqual(['planks']);
  expect((await listOrder(page))[0]).toBe('planks');
  expect(await withButton(page)).toEqual(['planks']);
  await expect(ingredient(page, 'planks', 'log')).toHaveText('1 / 1');
  await expect(ingredient(page, 'planks', 'log')).not.toHaveClass(/short/);

  await craftButton(page, 'planks').click();
  expect(await have(page, LOG)).toBe(0);
  expect(await have(page, PLANKS)).toBe(4);
  // Four planks: sticks and the workbench come first now, the planks have gone down.
  state = await getState(page);
  expect(state.recipes.filter((r) => r.craftable).map((r) => r.name)).toEqual([
    'sticks',
    'workbench',
  ]);
  const order = await listOrder(page);
  expect(order).toEqual(state.recipes.map((r) => r.name));
  expect(order.slice(0, 3)).toEqual(['sticks', 'workbench', 'planks']);
  expect(await withButton(page)).toEqual(['sticks', 'workbench']);
  await expect(ingredient(page, 'planks', 'log')).toHaveText('0 / 1');
  await expect(ingredient(page, 'planks', 'log')).toHaveClass(/short/);

  // The list has reordered under the mouse: a second quick click on the same spot, where
  // "Sticks" stands now, crafts nothing. A quarter of a second later it does.
  await craftButton(page, 'sticks').click();
  expect(await have(page, STICK)).toBe(0);
  await step(page, 15);
  await craftButton(page, 'sticks').click();
  expect(await have(page, STICK)).toBe(4);
  expect(await have(page, PLANKS)).toBe(2);

  // Back on the items page the slots show what was made.
  await page.locator('.inventory-tab[data-tab="items"]').click();
  await expect(page.locator('.recipe-list')).toBeHidden();
  await expect(page.locator('.inv-slot[data-item="stick"] .slot-count')).toHaveText('4');
});

test('Phase 3 AC12.2: short ingredients are marked; station recipes need a workbench or a furnace within reach', async ({
  page,
}) => {
  await openGame(page, { mode: 'gathering' });
  const { px, pz } = await standOnPlatform(page);
  await give(page, WORKBENCH, 1);
  await give(page, FURNACE, 1);
  await give(page, PLANKS, 2);
  await give(page, STICK, 2);
  await give(page, IRON_ORE, 1);
  await give(page, COAL, 1);
  await openCrafting(page);

  // Two of three planks: "have / need", the short one marked, no button.
  const pickaxe = 'wooden_pickaxe';
  await expect(ingredient(page, pickaxe, 'planks')).toHaveText('2 / 3');
  await expect(ingredient(page, pickaxe, 'planks')).toHaveClass(/short/);
  await expect(ingredient(page, pickaxe, 'stick')).toHaveText('2 / 2');
  await expect(ingredient(page, pickaxe, 'stick')).not.toHaveClass(/short/);
  await expect(craftButton(page, pickaxe)).toBeHidden();
  await expect(note(page, pickaxe)).toHaveText('Needs a workbench nearby');
  // The marked ingredient is red, the other one is not.
  const color = (item: string): Promise<string> =>
    ingredient(page, pickaxe, item).evaluate((node) => getComputedStyle(node).color);
  expect(await color('planks')).toBe('rgb(255, 138, 120)');
  expect(await color('stick')).not.toBe('rgb(255, 138, 120)');
  // Sticks need no station: two planks are enough for them. Torches need none either
  // (Phase 4 part B), and a stick and the coal are there.
  expect(await withButton(page)).toEqual(['sticks', 'torch']);

  // Enough planks, but still no workbench.
  await give(page, PLANKS, 1);
  await expect(ingredient(page, pickaxe, 'planks')).toHaveText('3 / 3');
  await expect(ingredient(page, pickaxe, 'planks')).not.toHaveClass(/short/);
  await expect(craftButton(page, pickaxe)).toBeHidden();
  await expect(note(page, pickaxe)).toHaveText('Needs a workbench nearby');
  expect(await submit(page, { kind: 'craft', recipe: 4 })).toBe('station');

  // A workbench placed two blocks ahead unlocks it while the list is open.
  await place(page, px, PLATFORM_Y + 1, pz - 2, WORKBENCH);
  await expect(note(page, pickaxe)).toBeHidden();
  await expect(craftButton(page, pickaxe)).toBeVisible();
  expect((await listOrder(page)).slice(0, 4)).toEqual([
    'sticks',
    'wooden_pickaxe',
    'wooden_axe',
    'wooden_shovel',
  ]);
  // With the workbench near, a recipe short of ingredients still has no button.
  await expect(ingredient(page, 'furnace', 'stone')).toHaveText('0 / 8');
  await expect(craftButton(page, 'furnace')).toBeHidden();
  await expect(note(page, 'furnace')).toBeHidden();
  await craftButton(page, pickaxe).click();
  expect(await have(page, WOODEN_PICKAXE)).toBe(1);
  expect(await have(page, PLANKS)).toBe(0);
  expect(await have(page, STICK)).toBe(0);

  // The same for the furnace.
  await expect(ingredient(page, 'iron_ingot', 'iron_ore')).toHaveText('1 / 1');
  await expect(ingredient(page, 'iron_ingot', 'coal')).toHaveText('1 / 1');
  await expect(note(page, 'iron_ingot')).toHaveText('Needs a furnace nearby');
  await expect(craftButton(page, 'iron_ingot')).toBeHidden();
  await place(page, px + 1, PLATFORM_Y + 1, pz - 2, FURNACE);
  await expect(note(page, 'iron_ingot')).toBeHidden();
  await expect(craftButton(page, 'iron_ingot')).toBeVisible();
  expect(await withButton(page)).toEqual(['iron_ingot']);

  // Eight blocks away from both, the stations do not count any more.
  await setPlayer(page, { z: pz - 9.5 });
  await step(page, 15);
  await expect(note(page, 'iron_ingot')).toHaveText('Needs a furnace nearby');
  await expect(craftButton(page, 'iron_ingot')).toBeHidden();
  expect(await withButton(page)).toEqual([]);
});

test('Phase 3 AC12.3: a furnace recipe shows a progress bar and delivers after 120 steps; closing the screen cancels it', async ({
  page,
}) => {
  await openGame(page, { mode: 'gathering' });
  const { px, pz } = await standOnPlatform(page);
  await setBlock(page, px, PLATFORM_Y + 1, pz - 2, FURNACE);
  await give(page, LOG, 4);
  await openCrafting(page);
  const progress = row(page, 'coal').locator('.recipe-progress');
  const fill = row(page, 'coal').locator('.recipe-progress-fill');
  const fillWidth = (): Promise<number> =>
    fill.evaluate((node) => parseFloat((node as HTMLElement).style.width));
  await expect(progress).toBeHidden();
  expect((await getState(page)).smelting).toBeNull();

  await craftButton(page, 'coal').click();
  await step(page, 1);
  await expect(progress).toBeVisible();
  await expect(craftButton(page, 'coal')).toBeHidden();
  expect((await getState(page)).smelting?.recipe).toBe(COAL_RECIPE);
  // Nothing is taken while the bar runs, and a click on another furnace row starts nothing.
  await step(page, 59);
  expect((await getState(page)).smelting?.progress).toBeCloseTo(0.5, 5);
  expect(await fillWidth()).toBe(50);
  expect(await have(page, LOG)).toBe(4);
  await step(page, 59);
  expect(await have(page, LOG)).toBe(4);
  expect(await have(page, COAL)).toBe(0);
  expect((await getState(page)).smelting?.progress).toBeGreaterThan(0.98);
  // The 120th step delivers.
  await step(page, 1);
  expect(await have(page, LOG)).toBe(2);
  expect(await have(page, COAL)).toBe(1);
  expect((await getState(page)).smelting).toBeNull();
  await expect(progress).toBeHidden();
  await expect(craftButton(page, 'coal')).toBeVisible();

  // Closing the screen while the bar runs: nothing was taken, and nothing arrives later.
  await craftButton(page, 'coal').click();
  await step(page, 60);
  await expect(progress).toBeVisible();
  const before = await inventory(page);
  await page.keyboard.press('KeyE');
  await expect(page.locator('.inventory-screen')).toBeHidden();
  expect((await getState(page)).smelting).toBeNull();
  await step(page, 120);
  expect(await inventory(page)).toEqual(before);
  await openCrafting(page);
  await expect(progress).toBeHidden();
  await expect(craftButton(page, 'coal')).toBeVisible();
  await step(page, 120);
  expect(await inventory(page)).toEqual(before);
});

test('Phase 3 AC12.4: holding "Craft" on sticks crafts four times a second until the planks run out', async ({
  page,
}) => {
  await openGame(page, { mode: 'gathering' });
  await give(page, PLANKS, 5);
  await openCrafting(page);
  const at = await centerOf(page, '.recipe-row[data-recipe="sticks"] .recipe-craft');
  await page.mouse.move(at.x, at.y);
  await page.mouse.down();
  // A quarter of a second per craft.
  await step(page, 14);
  expect(await have(page, STICK)).toBe(0);
  await step(page, 1);
  expect(await have(page, STICK)).toBe(4);
  expect(await have(page, PLANKS)).toBe(3);
  await step(page, 14);
  expect(await have(page, STICK)).toBe(4);
  await step(page, 1);
  expect(await have(page, STICK)).toBe(8);
  expect(await have(page, PLANKS)).toBe(1);
  // One plank is not enough: the button is gone and the hold has ended.
  await expect(craftButton(page, 'sticks')).toBeHidden();
  await step(page, 60);
  expect(await have(page, STICK)).toBe(8);
  // More planks do not wake the old hold, and letting go crafts nothing.
  await give(page, PLANKS, 4);
  await step(page, 60);
  await page.mouse.up();
  await step(page, 30);
  expect(await have(page, STICK)).toBe(8);
  expect(await have(page, PLANKS)).toBe(5);

  // Letting go after a hold that crafted does not craft once more; a short click crafts once.
  await page.mouse.down();
  await step(page, 15);
  await page.mouse.up();
  await step(page, 30);
  expect(await have(page, STICK)).toBe(12);
  expect(await have(page, PLANKS)).toBe(3);
  await craftButton(page, 'sticks').click();
  await step(page, 30);
  expect(await have(page, STICK)).toBe(16);
  expect(await have(page, PLANKS)).toBe(1);
});

test('Phase 3 AC12.5: Creative has no Crafting tab and refuses to craft', async ({ page }) => {
  await openGame(page);
  await page.keyboard.press('KeyE');
  await expect(page.locator('.inventory-screen')).toBeVisible();
  await expect(page.locator('.inventory-tabs')).toBeHidden();
  await expect(page.locator('.inventory-tab')).toHaveCount(2);
  await expect(page.locator('.inventory-tab:visible')).toHaveCount(0);
  await expect(page.locator('.recipe-list')).toBeHidden();
  await expect(page.locator('.inventory-palette')).toBeVisible();
  expect((await getState(page)).ui).toEqual({ screen: 'inventory', tab: 'items' });
  expect(await submit(page, { kind: 'craft', recipe: 1 })).toBe('mode');
});

test.describe('touch', () => {
  test.use(TOUCH_DEVICE);

  test('Phase 3 AC12.6: a finger that scrolls the list from a "Craft" button crafts nothing; a tap crafts once', async ({
    page,
  }) => {
    const fingers = await openTouchGame(page, { mode: 'gathering' });
    await give(page, LOG, 3);
    await give(page, PLANKS, 6);
    const bag = await centerOf(page, '.touch-bag');
    await fingers.tap(9, bag.x, bag.y);
    await page.locator('.inventory-tab[data-tab="crafting"]').tap();
    const list = page.locator('.recipe-list');
    await expect(list).toBeVisible();
    const before = await inventory(page);
    expect(await list.evaluate((node) => node.scrollTop)).toBe(0);

    // Down on the third button ("Workbench"), then up the screen: the browser scrolls.
    const button = await centerOf(page, '.recipe-row[data-recipe="workbench"] .recipe-craft');
    await swipe(page, button, { x: button.x, y: button.y - 110 });
    await step(page, 60);
    await expect.poll(() => list.evaluate((node) => node.scrollTop)).toBeGreaterThan(40);
    expect(await inventory(page)).toEqual(before);

    // A tap on a button crafts once.
    await list.evaluate((node) => node.scrollTo(0, 0));
    await craftButton(page, 'planks').tap();
    await step(page, 30);
    expect(await have(page, LOG)).toBe(2);
    expect(await have(page, PLANKS)).toBe(10);
    // A finger held on the button repeats.
    const planks = await centerOf(page, '.recipe-row[data-recipe="planks"] .recipe-craft');
    await fingers.touchDown(1, planks.x, planks.y);
    await step(page, 30);
    await fingers.touchUp(1);
    await step(page, 30);
    expect(await have(page, LOG)).toBe(0);
    expect(await have(page, PLANKS)).toBe(18);
  });
});

// --- Step 12: reference screenshots ------------------------------------------------------

test('Phase 3 AC12.7: matches the recipe-list reference (craftable rows, the furnace at work, short ingredients, a missing station)', async ({
  page,
}) => {
  await openGame(page, { mode: 'gathering' });
  const { player } = await getState(page);
  // A furnace behind the player, out of the picture.
  await setBlock(
    page,
    Math.floor(player.x),
    Math.floor(player.y) + 1,
    Math.floor(player.z) + 2,
    FURNACE,
  );
  await give(page, LOG, 2);
  await give(page, PLANKS, 3);
  await openCrafting(page);
  await craftButton(page, 'coal').click();
  await step(page, 60);
  await whenIdle(page);
  expect((await listOrder(page)).slice(0, 5)).toEqual([
    'planks',
    'sticks',
    'coal',
    'workbench',
    'wooden_pickaxe',
  ]);
  expect((await getState(page)).smelting?.progress).toBeCloseTo(0.5, 5);
  // Mostly text, and CI has other fonts than the cloud session: the looser limit of the
  // text references. The assertions above and AC12.1–AC12.3 check what the rows say.
  await expect(page).toHaveScreenshot('recipe-list.png', { maxDiffPixelRatio: 0.05 });
});

test('Phase 3 AC12.7: matches the item-icons reference (every item once)', async ({ page }) => {
  await openGame(page, { mode: 'gathering' });
  // The sixteen placeable blocks, then coal, stick, iron ingot and the nine tools.
  const blocks = [1, 2, 3, 4, 5, 6, 7, 8, 9, 12, 13, 14, 15, 16, 17, 18];
  const items = Array.from({ length: 12 }, (_, index) => COAL + index);
  for (const item of [...blocks, ...items]) await give(page, item, 1);
  const slots = await inventory(page);
  expect(slots.filter((s) => s !== null)).toHaveLength(28);
  await page.keyboard.press('KeyE');
  await expect(page.locator('.inv-slot[data-item="unknown"]')).toHaveCount(0);
  await expect(page.locator('.inventory-grid .inv-slot canvas')).toHaveCount(19);
  // The icons are the subject: no world behind the panel.
  await page.locator('canvas.game-canvas').evaluate((node) => {
    (node as HTMLElement).style.visibility = 'hidden';
  });
  // Only slots and icons, whose sizes are fixed in pixels: header and hint are text, and
  // another font would change the height of the panel.
  await page.locator('.inventory-header, .inventory-hint').evaluateAll((nodes) => {
    for (const node of nodes) (node as HTMLElement).style.display = 'none';
  });
  await expect(page.locator('.inventory-panel')).toHaveScreenshot('item-icons.png');
});

test('Phase 3 AC12.7: matches the stations reference (workbench and furnace placed)', async ({
  page,
}) => {
  await openGame(page, { mode: 'gathering' });
  const { px, pz } = await standOnPlatform(page, 1);
  await give(page, WORKBENCH, 1);
  await give(page, FURNACE, 1);
  await place(page, px - 1, PLATFORM_Y + 1, pz - 3, WORKBENCH);
  await place(page, px + 1, PLATFORM_Y + 1, pz - 3, FURNACE);
  await setPlayer(page, { pitch: -18 * DEG });
  await step(page, 2);
  await whenIdle(page);
  expect(await getBlock(page, px - 1, PLATFORM_Y + 1, pz - 3)).toBe(WORKBENCH);
  expect(await getBlock(page, px + 1, PLATFORM_Y + 1, pz - 3)).toBe(FURNACE);
  // Both stations within reach: their recipes only wait for ingredients.
  const state = await getState(page);
  expect(state.recipes.every((r) => !r.stationMissing)).toBe(true);
  await expect(page).toHaveScreenshot('stations.png');
});
