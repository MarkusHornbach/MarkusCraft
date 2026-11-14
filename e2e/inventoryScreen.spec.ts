// Phase 3 step 8: the inventory screen (Gathering) and the block palette (Creative).
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import {
  DEG,
  PLATFORM_Y,
  createWorld,
  getBlock,
  getState,
  give,
  inventory,
  openGame,
  openMenu,
  setPlayer,
  standOnPlatform,
  step,
  untilPlaying,
  whenIdle,
} from './game';
import { TOUCH_DEVICE, Fingers, centerOf, openTouchGame } from './touch';

const DIRT = 2;
const STONE = 3;
const SAND = 4;
const LOG = 5;
const PLANKS = 7;
const COAL_ORE = 12;
const CLAY = 14;
const COAL = 256;

const screen = (page: Page) => page.locator('.inventory-screen');
const slot = (page: Page, index: number) => page.locator(`.inv-slot[data-index="${index}"]`);

async function uiScreen(page: Page): Promise<string> {
  return (await getState(page)).ui.screen;
}

test('Phase 3 AC8.1: E opens and closes the screen; while open the player gets no input and time goes on', async ({
  page,
}) => {
  await openGame(page, { mode: 'gathering', freeze: false });
  await standOnPlatform(page);
  await expect(screen(page)).toBeHidden();
  expect(await uiScreen(page)).toBe('play');

  await page.keyboard.press('KeyE');
  await expect(screen(page)).toBeVisible();
  expect(await uiScreen(page)).toBe('inventory');
  await expect(page.locator('.inventory-title')).toHaveText('Inventory');
  await expect(page.locator('.inventory-grid .inv-slot')).toHaveCount(27);
  await expect(page.locator('.inventory-bar .inv-slot')).toHaveCount(9);
  await expect(page.locator('.inv-bin')).toBeVisible();
  await expect(page.locator('.inventory-palette')).toBeHidden();

  const before = await getState(page);
  await page.keyboard.down('KeyW');
  await page.keyboard.down('Space');
  await page.evaluate(() => window.__mc.look(200, 80));
  await page.mouse.move(480, 270);
  await page.mouse.down();
  await step(page, 30);
  await page.mouse.up();
  const during = await getState(page);
  expect(during.player.x).toBe(before.player.x);
  expect(during.player.y).toBe(before.player.y);
  expect(during.player.z).toBe(before.player.z);
  expect(during.player.yaw).toBe(before.player.yaw);
  expect(during.player.pitch).toBe(before.player.pitch);
  expect(during.breaking).toBeNull();
  // The world is not paused: the clock went on.
  expect(during.paused).toBe(false);
  expect(during.time).toBeGreaterThan(before.time);
  await page.keyboard.up('KeyW');
  await page.keyboard.up('Space');

  // E closes; keys work again.
  await page.keyboard.press('KeyE');
  await expect(screen(page)).toBeHidden();
  expect(await uiScreen(page)).toBe('play');
  await page.keyboard.down('KeyW');
  await step(page, 30);
  await page.keyboard.up('KeyW');
  expect((await getState(page)).player.z).toBeLessThan(before.player.z - 1);

  // Esc and the close button close as well.
  await page.keyboard.press('KeyE');
  await expect(screen(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(screen(page)).toBeHidden();
  await page.keyboard.press('KeyE');
  await expect(screen(page)).toBeVisible();
  await page.locator('.inventory-close').click();
  await expect(screen(page)).toBeHidden();
  expect(await uiScreen(page)).toBe('play');
});

test('Phase 3 AC8.2: slots move, merge, swap, go to the bin and can be released again', async ({
  page,
}) => {
  await openGame(page, { mode: 'gathering' });
  await give(page, DIRT, 40);
  await give(page, SAND, 5);
  await give(page, COAL, 3);
  await page.keyboard.press('KeyE');
  await expect(slot(page, 0)).toHaveAttribute('data-item', 'dirt');
  await expect(slot(page, 0).locator('.slot-count')).toHaveText('40');
  await expect(slot(page, 2)).toHaveAttribute('data-item', 'coal');

  // Move into an empty slot.
  await slot(page, 0).click();
  await expect(slot(page, 0)).toHaveClass(/picked/);
  await expect(page.locator('.inv-bin')).toHaveClass(/ready/);
  await slot(page, 20).click();
  await expect(page.locator('.inv-slot.picked')).toHaveCount(0);
  let slots = await inventory(page);
  expect(slots[0]).toBeNull();
  expect(slots[20]).toEqual({ item: DIRT, count: 40 });
  await expect(slot(page, 20).locator('.slot-count')).toHaveText('40');
  await expect(slot(page, 0).locator('canvas')).toHaveCount(0);

  // Merge onto the same item: the target fills up, the remainder stays behind.
  await give(page, DIRT, 70);
  slots = await inventory(page);
  expect(slots[20]).toEqual({ item: DIRT, count: 99 });
  expect(slots[0]).toEqual({ item: DIRT, count: 11 });
  await slot(page, 20).click();
  await slot(page, 0).click();
  slots = await inventory(page);
  expect(slots[0]).toEqual({ item: DIRT, count: 99 });
  expect(slots[20]).toEqual({ item: DIRT, count: 11 });

  // Swap with another item.
  await slot(page, 1).click();
  await slot(page, 2).click();
  slots = await inventory(page);
  expect(slots[1]).toEqual({ item: COAL, count: 3 });
  expect(slots[2]).toEqual({ item: SAND, count: 5 });
  await expect(slot(page, 1)).toHaveAttribute('data-item', 'coal');

  // The bin discards the picked stack; without a pick it does nothing.
  await page.locator('.inv-bin').click();
  expect(await inventory(page)).toEqual(slots);
  await slot(page, 2).click();
  await page.locator('.inv-bin').click();
  slots = await inventory(page);
  expect(slots[2]).toBeNull();
  await expect(page.locator('.inv-bin')).not.toHaveClass(/ready/);

  // Activating the picked slot again releases it; the next slot is then a new pick.
  await slot(page, 1).click();
  await expect(slot(page, 1)).toHaveClass(/picked/);
  await slot(page, 1).click();
  await expect(page.locator('.inv-slot.picked')).toHaveCount(0);
  await slot(page, 30).click();
  await expect(page.locator('.inv-slot.picked')).toHaveCount(0);
  await slot(page, 5).click();
  expect(await inventory(page)).toEqual(slots);

  // The bar of the HUD shows the same items after closing.
  await page.keyboard.press('KeyE');
  await expect(page.locator('.hotbar-slot[data-slot="1"] .slot-count')).toHaveText('99');
  await expect(page.locator('.hotbar-slot[data-slot="2"]')).toHaveAttribute('data-item', 'coal');
  await expect(page.locator('.hotbar-slot[data-slot="3"]')).toHaveAttribute('data-item', '');
  // Closing forgets a pick.
  await page.keyboard.press('KeyE');
  await slot(page, 1).click();
  await page.keyboard.press('KeyE');
  await page.keyboard.press('KeyE');
  await expect(page.locator('.inv-slot.picked')).toHaveCount(0);
});

test('Phase 3 AC8.3: opening sets the mouse free without pausing; the close button captures it again', async ({
  page,
}) => {
  test.setTimeout(180_000);
  await openMenu(page);
  await createWorld(page, { mode: 'gathering' });
  const locked = (): Promise<boolean> =>
    page.evaluate(() => document.pointerLockElement === document.querySelector('.game-canvas'));
  expect(await locked()).toBe(true);

  await page.keyboard.press('KeyE');
  await expect(screen(page)).toBeVisible();
  await page.waitForFunction(() => document.pointerLockElement === null);
  // Unlike Esc in the game, this does not pause.
  let state = await getState(page);
  expect(state.paused).toBe(false);
  expect(state.ui.screen).toBe('inventory');
  await expect(page.locator('.pause-screen')).toBeHidden();
  // Still not paused a moment later (the lock change has been handled by then).
  await page.waitForTimeout(300);
  expect((await getState(page)).paused).toBe(false);

  await page.locator('.inventory-close').click();
  await expect(screen(page)).toBeHidden();
  // The browser may refuse to capture the mouse right after it was released; the game
  // then offers its pause menu and `untilPlaying` clicks "Click to continue".
  await page.waitForFunction(
    () => document.pointerLockElement !== null || window.__mc.getState().paused,
  );
  await untilPlaying(page);
  await page.waitForFunction(() => document.pointerLockElement !== null);
  state = await getState(page);
  expect(state.paused).toBe(false);
  expect(state.ui.screen).toBe('play');
  expect(await locked()).toBe(true);

  // E does nothing in the pause menu.
  await page.evaluate(() => document.exitPointerLock());
  await page.waitForFunction(() => window.__mc.getState().paused);
  await page.keyboard.press('KeyE');
  await expect(screen(page)).toBeHidden();
  expect(await uiScreen(page)).toBe('pause');
});

test('Phase 3 AC8.4: the Creative screen shows every placeable block once; a block goes into the bar and can be placed', async ({
  page,
}) => {
  await openGame(page);
  const { px, pz } = await standOnPlatform(page);
  await setPlayer(page, { pitch: -50 * DEG });
  await page.keyboard.press('KeyE');
  await expect(page.locator('.inventory-title')).toHaveText('Blocks');
  await expect(page.locator('.inventory-grid')).toBeHidden();
  const names = await page
    .locator('.palette-slot')
    .evaluateAll((nodes) => nodes.map((node) => (node as HTMLElement).dataset.item));
  expect(names).toEqual([
    'grass',
    'dirt',
    'stone',
    'sand',
    'log',
    'leaves',
    'planks',
    'bricks',
    'glass',
    'coal_ore',
    'iron_ore',
    'clay',
    'workbench',
    'furnace',
    'stone_bricks',
    'iron_block',
  ]);
  // Every palette slot shows an icon; nothing shows a count.
  await expect(page.locator('.palette-slot canvas')).toHaveCount(names.length);
  await expect(page.locator('.inventory-screen .slot-count')).toHaveCount(0);
  // The selected bar slot is marked.
  await expect(slot(page, 0)).toHaveClass(/selected/);

  await page.locator('.palette-slot[data-item="clay"]').click();
  expect((await inventory(page))[0]).toEqual({ item: CLAY, count: 1 });
  await expect(slot(page, 0)).toHaveAttribute('data-item', 'clay');
  // A picked bar slot receives the block instead of the selected one.
  await slot(page, 4).click();
  await page.locator('.palette-slot[data-item="coal_ore"]').click();
  let slots = await inventory(page);
  expect(slots[4]).toEqual({ item: COAL_ORE, count: 1 });
  expect(slots[0]).toEqual({ item: CLAY, count: 1 });
  await expect(page.locator('.inv-slot.picked')).toHaveCount(0);
  // Bar slots can be rearranged and emptied.
  await slot(page, 8).click();
  await slot(page, 1).click();
  await slot(page, 2).click();
  await page.locator('.inv-bin').click();
  slots = await inventory(page);
  expect(slots.slice(0, 9).map((s) => s?.item ?? 0)).toEqual([
    CLAY,
    9,
    0,
    SAND,
    COAL_ORE,
    6,
    PLANKS,
    8,
    DIRT,
  ]);

  await page.keyboard.press('KeyE');
  await expect(page.locator('.hotbar-slot[data-slot="1"]')).toHaveAttribute('data-item', 'clay');
  await page.mouse.click(480, 270, { button: 'right' });
  await whenIdle(page);
  expect(await getBlock(page, px, PLATFORM_Y + 1, pz - 1)).toBe(CLAY);
  // Creative: placing uses nothing up.
  expect((await inventory(page))[0]).toEqual({ item: CLAY, count: 1 });
});

test.describe('touch', () => {
  test.use(TOUCH_DEVICE);

  async function tapBag(page: Page, fingers: Fingers): Promise<void> {
    const bag = await centerOf(page, '.touch-bag');
    await fingers.tap(9, bag.x, bag.y);
    await expect(screen(page)).toBeVisible();
  }

  test('Phase 3 AC8.6: opening releases stick and buttons, and no touch control reacts while the screen is open', async ({
    page,
  }) => {
    const fingers = await openTouchGame(page, { mode: 'gathering' });
    const { px, pz } = await standOnPlatform(page, DIRT);
    await setPlayer(page, { pitch: -50 * DEG });
    // In Gathering the bag button takes the place of the fly button.
    const bag = await page.locator('.touch-bag').boundingBox();
    expect(bag && bag.x + bag.width).toBeGreaterThan(960 - 12);

    // Thumb on the stick walking forward, a finger on break.
    await fingers.touchDown(1, 160, 400);
    await fingers.touchMove(1, 160, 350, 3);
    const breakButton = await centerOf(page, '.touch-break');
    await fingers.touchDown(2, breakButton.x, breakButton.y);
    await step(page, 5);
    expect((await getState(page)).breaking).not.toBeNull();
    await expect(page.locator('.touch-stick')).toBeVisible();

    await tapBag(page, fingers);
    await whenIdle(page);
    await expect(page.locator('.touch-stick')).toBeHidden();
    // The player slides to a halt within a few steps; from then on nothing moves.
    await step(page, 20);
    const opened = await getState(page);
    expect(opened.breaking).toBeNull();
    await step(page, 60);
    let state = await getState(page);
    expect(state.player.z).toBe(opened.player.z);
    expect(state.player.x).toBe(opened.player.x);
    expect(await getBlock(page, px, PLATFORM_Y, pz - 1)).toBe(DIRT);
    // The fingers that were down do nothing more, also when they move.
    await fingers.touchMove(1, 160, 320, 2);
    await step(page, 20);
    expect((await getState(page)).player.z).toBe(opened.player.z);
    await fingers.touchUp(1);
    await fingers.touchUp(2);

    // New touches where the stick, the look area and the buttons are: nothing reacts.
    // (Sideways drags: a vertical one would scroll the screen, were it taller than the view.)
    await fingers.touchDown(1, 160, 400);
    await fingers.touchMove(1, 220, 400, 3);
    await fingers.touchDown(2, 700, 100);
    await fingers.touchMove(2, 600, 100, 3);
    await fingers.touchDown(3, breakButton.x, breakButton.y);
    await step(page, 60);
    await whenIdle(page);
    state = await getState(page);
    await expect(page.locator('.touch-stick')).toBeHidden();
    expect(state.player.z).toBe(opened.player.z);
    expect(state.player.yaw).toBe(opened.player.yaw);
    expect(state.player.pitch).toBe(opened.player.pitch);
    expect(state.breaking).toBeNull();
    expect(state.ui.screen).toBe('inventory');
    expect(await getBlock(page, px, PLATFORM_Y, pz - 1)).toBe(DIRT);
    await fingers.touchUp(1);
    await fingers.touchUp(2);
    await fingers.touchUp(3);

    // Closed again by a tap: the controls work.
    await page.locator('.inventory-close').tap();
    await expect(screen(page)).toBeHidden();
    await fingers.touchDown(1, 160, 400);
    await fingers.touchMove(1, 160, 320, 3);
    await step(page, 30);
    await fingers.touchUp(1);
    expect((await getState(page)).player.z).toBeLessThan(opened.player.z - 1);
  });
});

test('Phase 3 AC8.7: matches the gathering-hud reference (bar with counts, break progress at stage 3)', async ({
  page,
}) => {
  await openGame(page, { mode: 'gathering' });
  await give(page, DIRT, 64);
  await give(page, STONE, 12);
  await give(page, LOG, 7);
  await give(page, SAND, 99);
  await give(page, COAL, 5);
  await give(page, PLANKS, 1);
  await page.keyboard.press('Digit3');
  // A patch of sand in front of the player, so the cracks are easy to judge.
  const { px, pz } = await standOnPlatform(page, SAND);
  await setPlayer(page, { pitch: -50 * DEG });
  await page.mouse.move(480, 270);
  await page.mouse.down();
  // Sand takes 36 steps; stage 3 runs from step 22 to step 28.
  await step(page, 25);
  await whenIdle(page);
  const state = await getState(page);
  expect(state.breaking).toMatchObject({ x: px, y: PLATFORM_Y, z: pz - 1 });
  expect(Math.floor((state.breaking?.progress ?? 0) * 5)).toBe(3);
  await expect(page.locator('.break-bar')).toBeVisible();
  await expect(page.locator('.hotbar-label')).toHaveText('Log');
  await expect(page).toHaveScreenshot('gathering-hud.png');
  await page.mouse.up();
});

test('Phase 3 AC8.7: matches the inventory reference (Gathering)', async ({ page }) => {
  await openGame(page, { mode: 'gathering' });
  await give(page, DIRT, 64);
  await give(page, STONE, 12);
  await give(page, LOG, 7);
  await give(page, SAND, 99);
  await give(page, COAL, 5);
  await give(page, PLANKS, 1);
  await give(page, CLAY, 30);
  await give(page, COAL_ORE, 2);
  await give(page, 13, 3);
  await give(page, 6, 48);
  await give(page, 9, 16);
  await give(page, 8, 99);
  await give(page, 1, 20);
  // Some of it behind the bar.
  for (const [from, to] of [
    [7, 9],
    [8, 10],
    [9, 22],
    [10, 23],
    [11, 35],
    [12, 17],
  ]) {
    await page.evaluate((a) => window.__mc.submit(a), { kind: 'moveStack', from, to });
  }
  await page.keyboard.press('Digit2');
  await page.keyboard.press('KeyE');
  await slot(page, 4).click();
  await whenIdle(page);
  await expect(slot(page, 4)).toHaveClass(/picked/);
  await expect(page).toHaveScreenshot('inventory.png');
});

test('Phase 3 AC8.7: matches the palette reference (Creative)', async ({ page }) => {
  await openGame(page);
  await page.keyboard.press('Digit5');
  await page.keyboard.press('KeyE');
  await whenIdle(page);
  await expect(page.locator('.palette-slot')).toHaveCount(16);
  await expect(page).toHaveScreenshot('palette.png');
});
