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
} from './game';
import { capture, centerRegion, colorDistance, meanColor, shareOf, type Rgb } from './helpers';

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
