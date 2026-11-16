// The controller on the inventory, the Creative palette and the Crafting tab (Phase 5 part B,
// steps 5 and 6): the focus system over slots, palette, bin, tabs and "Craft" buttons.
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import {
  PLATFORM_Y,
  createWorld,
  getState,
  give,
  inventory,
  openGame,
  openMenu,
  setBlock,
  standOnPlatform,
  step,
  whenIdle,
} from './game';
import { BUTTON, Pad, installFakePads, polls } from './gamepad';

const DIRT = 2;
const STONE = 3;
const LOG = 5;
const PLANKS = 7;
const FURNACE = 16;
const COAL = 256;
const STICK = 257;
const COAL_RECIPE = 11;

test.describe.configure({ timeout: 120_000 });

/** The test world with the fake pads installed and a pad connected (not used yet). */
async function padGame(page: Page, mode: 'creative' | 'gathering'): Promise<Pad> {
  await installFakePads(page);
  await openGame(page, { mode });
  const pad = new Pad(page);
  await pad.connect();
  return pad;
}

async function focusOf(page: Page): Promise<string | null> {
  return (await getState(page)).ui.focus ?? null;
}

async function have(page: Page, item: number): Promise<number> {
  return (await inventory(page)).reduce((sum, s) => sum + (s?.item === item ? s.count : 0), 0);
}

/**
 * Moves the focus with the D-pad onto the element `selector` names, one tap at a time
 * towards it (the larger distance first). Knows nothing of the layout, as a player.
 */
async function focusOn(page: Page, pad: Pad, selector: string): Promise<void> {
  for (let i = 0; i < 24; i++) {
    const move = await page.evaluate((sel) => {
      const target = document.querySelector(sel);
      const focused = document.querySelector('.pad-focused');
      if (!target || !focused) throw new Error(`no ${target ? 'focus' : sel}`);
      if (target === focused) return null;
      const a = focused.getBoundingClientRect();
      const b = target.getBoundingClientRect();
      const dx = b.left + b.width / 2 - (a.left + a.width / 2);
      const dy = b.top + b.height / 2 - (a.top + a.height / 2);
      // Rows first when the target lies in another row: the grid is walked as a player would.
      if (Math.abs(dy) > Math.min(a.height, b.height) / 2) return dy < 0 ? 'up' : 'down';
      return dx < 0 ? 'left' : 'right';
    }, selector);
    if (move === null) return;
    const button = { up: BUTTON.UP, down: BUTTON.DOWN, left: BUTTON.LEFT, right: BUTTON.RIGHT };
    await pad.tap(button[move]);
  }
  throw new Error(`the focus did not reach ${selector}`);
}

const slot = (index: number): string => `.inv-slot[data-index="${index}"]`;
const craft = (recipe: string): string => `.recipe-row[data-recipe="${recipe}"] .recipe-craft`;

/** The focus frame's rectangle and the focused element's, in page pixels. */
async function frameAndFocus(page: Page) {
  return page.evaluate(() => {
    const frame = document.querySelector('.pad-focus-frame');
    const focused = document.querySelector('.pad-focused');
    const box = (e: Element | null) => {
      if (!e) return null;
      const r = e.getBoundingClientRect();
      return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
    };
    return { frame: box(frame), focused: box(focused) };
  });
}

/** The frame lies 3 px outside the focused element: within 4 px of its rectangle. */
async function expectFrameOnFocus(page: Page): Promise<void> {
  const { frame, focused } = await frameAndFocus(page);
  expect(frame).not.toBeNull();
  expect(focused).not.toBeNull();
  if (!frame || !focused) return;
  for (const side of ['left', 'top', 'right', 'bottom'] as const) {
    expect(Math.abs(frame[side] - focused[side])).toBeLessThanOrEqual(4);
  }
  const view = page.viewportSize() ?? { width: 1280, height: 720 };
  expect(frame.top).toBeGreaterThanOrEqual(0);
  expect(frame.bottom).toBeLessThanOrEqual(view.height);
}

test('Phase 5 AC5.1: the pad alone moves, merges and swaps stacks and uses the bin', async ({
  page,
}) => {
  const pad = await padGame(page, 'gathering');
  await give(page, DIRT, 105);
  await give(page, LOG, 4);
  await give(page, STONE, 3);
  const start = await inventory(page);
  expect(start.slice(0, 4)).toEqual([
    { item: DIRT, count: 99 },
    { item: DIRT, count: 6 },
    { item: LOG, count: 4 },
    { item: STONE, count: 3 },
  ]);
  await pad.tap(BUTTON.Y);
  expect((await getState(page)).ui).toMatchObject({ screen: 'inventory', tab: 'items' });
  // The focus starts on the selected bar slot.
  expect(await focusOf(page)).toBe('Slot 1: Dirt');

  // Move: bar slot 1 onto the first grid slot.
  await pad.tap(BUTTON.A);
  await expect(page.locator('.inv-slot.picked')).toHaveCount(1);
  await expect(page.locator(slot(0))).toHaveClass(/picked/);
  await focusOn(page, pad, slot(9));
  await pad.tap(BUTTON.A);
  let slots = await inventory(page);
  expect(slots[0]).toBeNull();
  expect(slots[9]).toEqual({ item: DIRT, count: 99 });

  // Merge: the 99 onto the 6 fills that stack; the rest stays behind.
  await pad.tap(BUTTON.A);
  await focusOn(page, pad, slot(1));
  await pad.tap(BUTTON.A);
  slots = await inventory(page);
  expect(slots[1]).toEqual({ item: DIRT, count: 99 });
  expect(slots[9]).toEqual({ item: DIRT, count: 6 });

  // Swap: the 6 dirt with the logs.
  await focusOn(page, pad, slot(9));
  await pad.tap(BUTTON.A);
  await focusOn(page, pad, slot(2));
  await pad.tap(BUTTON.A);
  slots = await inventory(page);
  expect(slots[2]).toEqual({ item: DIRT, count: 6 });
  expect(slots[9]).toEqual({ item: LOG, count: 4 });

  // The bin: the stone goes.
  await focusOn(page, pad, slot(3));
  await pad.tap(BUTTON.A);
  await focusOn(page, pad, '.inv-bin');
  expect(await focusOf(page)).toBe('Bin');
  await pad.tap(BUTTON.A);
  slots = await inventory(page);
  expect(slots[3]).toBeNull();
  expect(await have(page, STONE)).toBe(0);
  // What the mouse would have made of the same four actions.
  const expected = start.slice();
  expected[9] = { item: LOG, count: 4 };
  expected[0] = null;
  expected[1] = { item: DIRT, count: 99 };
  expected[2] = { item: DIRT, count: 6 };
  expected[3] = null;
  expect(slots).toEqual(expected);
  await expect(page.locator('.inv-slot.picked')).toHaveCount(0);
  expect((await getState(page)).ui.screen).toBe('inventory');
});

test('Phase 5 AC5.2: Creative: A on a block fills the selected bar slot; a picked bar slot first takes it there', async ({
  page,
}) => {
  const pad = await padGame(page, 'creative');
  await pad.tap(BUTTON.Y);
  const first = page.locator('.palette-slot').first();
  const firstName = await first.getAttribute('data-item');
  expect(await focusOf(page)).toBe(await first.getAttribute('aria-label'));
  const selected = (await getState(page)).selectedSlot - 1;
  await pad.tap(BUTTON.A);
  await expect(page.locator(slot(selected))).toHaveAttribute('data-item', firstName ?? '');

  // Pick bar slot 3, then the fifth block of the palette: it goes into slot 3.
  const target = 2;
  expect((await inventory(page))[target]).not.toBeNull();
  await focusOn(page, pad, slot(target));
  await pad.tap(BUTTON.A);
  await expect(page.locator(slot(target))).toHaveClass(/picked/);
  const fifth = page.locator('.palette-slot').nth(4);
  const fifthName = await fifth.getAttribute('data-item');
  await focusOn(page, pad, '.palette-slot:nth-child(5)');
  await pad.tap(BUTTON.A);
  await expect(page.locator(slot(target))).toHaveAttribute('data-item', fifthName ?? '');
  await expect(page.locator(slot(selected))).toHaveAttribute('data-item', firstName ?? '');
  await expect(page.locator('.inv-slot.picked')).toHaveCount(0);
  // Creative has no tabs: no tab hints.
  await expect(page.locator('.pad-hints')).not.toContainText('Tabs');
});

test('Phase 5 AC5.3: the opening Y does not act inside; B cancels a pick first; LB/RB change the tab; the hints', async ({
  page,
}) => {
  const pad = await padGame(page, 'gathering');
  await give(page, DIRT, 5);
  // Y held over the opening: the inventory stays open until Y is pressed again.
  await pad.press(BUTTON.Y);
  await polls(page, 4);
  await pad.release(BUTTON.Y);
  await polls(page, 2);
  expect((await getState(page)).ui.screen).toBe('inventory');
  await expect(page.locator('.pad-hints')).toHaveText(/Pick \/ Put.*Back.*Close.*Tabs/);

  // B with a picked slot only puts it down.
  await pad.tap(BUTTON.A);
  await expect(page.locator('.inv-slot.picked')).toHaveCount(1);
  await pad.tap(BUTTON.B);
  await expect(page.locator('.inv-slot.picked')).toHaveCount(0);
  expect((await getState(page)).ui.screen).toBe('inventory');
  expect((await inventory(page))[0]).toEqual({ item: DIRT, count: 5 });

  // LB/RB: the tabs, no wrap-around; the focus starts on the Crafting tab there.
  await pad.tap(BUTTON.RB);
  expect((await getState(page)).ui).toMatchObject({ tab: 'crafting', focus: 'Crafting' });
  await pad.tap(BUTTON.RB);
  expect((await getState(page)).ui.tab).toBe('crafting');
  await pad.tap(BUTTON.LB);
  expect((await getState(page)).ui).toMatchObject({ tab: 'items', focus: 'Slot 1: Dirt' });
  await pad.tap(BUTTON.LB);
  expect((await getState(page)).ui.tab).toBe('items');

  // B without a pick closes; Y opens and closes.
  await pad.tap(BUTTON.B);
  expect((await getState(page)).ui.screen).toBe('play');
  await pad.tap(BUTTON.Y);
  expect((await getState(page)).ui.screen).toBe('inventory');
  await pad.tap(BUTTON.Y);
  expect((await getState(page)).ui.screen).toBe('play');
  await expect(page.locator('.pad-hints')).toHaveCount(0);
});

test('Phase 5 AC5.3: closing with Y goes back to play without pointer lock; Start pauses', async ({
  page,
}) => {
  await installFakePads(page);
  await openMenu(page);
  await createWorld(page, { mode: 'gathering' });
  const pad = new Pad(page);
  await pad.connect();
  await pad.tap(BUTTON.Y);
  let state = await getState(page);
  expect(state.ui.screen).toBe('inventory');
  expect(state.pad.active).toBe(true);
  await pad.tap(BUTTON.Y);
  // Longer than the wait for the pointer lock after closing (POINTER_LOCK_WAIT_MS).
  await polls(page, 20);
  state = await getState(page);
  expect(state.ui.screen).toBe('play');
  expect(state.paused).toBe(false);
  expect(await page.evaluate(() => document.pointerLockElement)).toBeNull();

  // Start on the inventory closes it and opens the pause menu.
  await pad.tap(BUTTON.Y);
  await pad.tap(BUTTON.START);
  state = await getState(page);
  expect(state.paused).toBe(true);
  expect(state.ui.screen).toBe('pause');
});

test('Phase 5 AC6.1: A on "Craft" makes the recipe once; held, it repeats after 500 ms, then every 250 ms', async ({
  page,
}) => {
  const pad = await padGame(page, 'gathering');
  await give(page, PLANKS, 9);
  await pad.tap(BUTTON.Y);
  await pad.tap(BUTTON.RB);
  await focusOn(page, pad, craft('sticks'));
  expect(await focusOf(page)).toBe('Craft Stick');
  await expect(page.locator('.pad-hints')).toContainText('Craft');

  await pad.tap(BUTTON.A);
  expect(await have(page, STICK)).toBe(4);
  expect(await have(page, PLANKS)).toBe(7);

  // Held: 30 steps to the first craft of the hold, then 15 per craft.
  await pad.press(BUTTON.A);
  await step(page, 29);
  expect(await have(page, STICK)).toBe(4);
  await step(page, 1);
  expect(await have(page, STICK)).toBe(8);
  await step(page, 30);
  expect(await have(page, STICK)).toBe(16);
  expect(await have(page, PLANKS)).toBe(1);
  // Releasing makes nothing more, also not by the click that follows.
  await pad.release(BUTTON.A);
  await step(page, 60);
  expect(await have(page, STICK)).toBe(16);
  expect(await have(page, PLANKS)).toBe(1);
});

test('Phase 5 AC6.2: a furnace recipe starts its bar with A; the bar fills; Y cancels it', async ({
  page,
}) => {
  const pad = await padGame(page, 'gathering');
  const { px, pz } = await standOnPlatform(page);
  await setBlock(page, px, PLATFORM_Y + 1, pz - 2, FURNACE);
  await give(page, LOG, 4);
  await pad.tap(BUTTON.Y);
  await pad.tap(BUTTON.RB);
  await focusOn(page, pad, craft('coal'));
  await pad.tap(BUTTON.A);
  await step(page, 1);
  expect((await getState(page)).smelting?.recipe).toBe(COAL_RECIPE);
  // The button hides under the bar: the focus goes to the nearest one, on screen.
  expect(await focusOf(page)).not.toBe('Craft Coal');
  await expectFrameOnFocus(page);
  await step(page, 119);
  expect(await have(page, COAL)).toBe(1);
  expect(await have(page, LOG)).toBe(2);
  expect((await getState(page)).smelting).toBeNull();

  await focusOn(page, pad, craft('coal'));
  await pad.tap(BUTTON.A);
  await step(page, 60);
  expect((await getState(page)).smelting?.progress).toBeCloseTo(0.5, 5);
  await pad.tap(BUTTON.Y);
  expect((await getState(page)).ui.screen).toBe('play');
  expect((await getState(page)).smelting).toBeNull();
  await step(page, 120);
  expect(await have(page, COAL)).toBe(1);
  expect(await have(page, LOG)).toBe(2);
});

test('Phase 5 AC6.3: after a craft the focus stays on its button, or goes to the nearest; down skips rows without a button; the right stick scrolls', async ({
  page,
}) => {
  const pad = await padGame(page, 'gathering');
  await give(page, PLANKS, 6);
  await give(page, LOG, 1);
  await pad.tap(BUTTON.Y);
  await pad.tap(BUTTON.RB);

  // Down from the first "Craft" visits the craftable recipes in table order.
  const craftable = (await getState(page)).recipes.filter((r) => r.craftable).map((r) => r.name);
  expect(craftable.length).toBeGreaterThan(2);
  await focusOn(page, pad, craft(craftable[0]));
  const visited = [await focusOf(page)];
  for (let i = 1; i < craftable.length; i++) {
    await pad.tap(BUTTON.DOWN);
    visited.push(await focusOf(page));
  }
  expect(visited).toEqual(
    await page.evaluate(
      (names) =>
        names.map(
          (name) =>
            document
              .querySelector(`.recipe-row[data-recipe="${name}"] .recipe-craft`)
              ?.getAttribute('aria-label') ?? null,
        ),
      craftable,
    ),
  );

  // A craft keeps the focus on its button: the list does not move.
  await focusOn(page, pad, craft('sticks'));
  const before = await page.locator(craft('sticks')).boundingBox();
  await pad.tap(BUTTON.A);
  expect(await have(page, STICK)).toBe(4);
  expect(await focusOf(page)).toBe('Craft Stick');
  expect(await page.locator(craft('sticks')).boundingBox()).toEqual(before);
  await expectFrameOnFocus(page);

  // The last two planks make the sticks once more; then the button goes and the focus
  // moves to the nearest one.
  await page.evaluate(() => window.__mc.clearInventory());
  await give(page, PLANKS, 2);
  await give(page, LOG, 1);
  await whenIdle(page);
  await pad.tap(BUTTON.A);
  expect(await have(page, STICK)).toBe(4);
  await expect(page.locator(craft('sticks'))).toBeHidden();
  await polls(page, 2);
  expect(await focusOf(page)).not.toBe('Craft Stick');
  expect(await focusOf(page)).not.toBeNull();
  await expectFrameOnFocus(page);

  // The right stick scrolls the list, also where no row has a button.
  const list = page.locator('.recipe-list');
  const top = await list.evaluate((node) => node.scrollTop);
  await pad.stick('right', 0, 1);
  await polls(page, 10);
  await pad.stick('right', 0, 0);
  expect(await list.evaluate((node) => node.scrollTop)).toBeGreaterThan(top + 20);
  // The focus never stays on a button scrolled out of the list.
  const focusInList = await page.evaluate(() => {
    const focused = document.querySelector('.pad-focused');
    const box = document.querySelector('.recipe-list')?.getBoundingClientRect();
    if (!focused || !box) return null;
    if (!focused.closest('.recipe-list')) return 'outside the list';
    const r = focused.getBoundingClientRect();
    return r.top >= box.top - 1 && r.bottom <= box.bottom + 1 ? 'in view' : 'hidden';
  });
  expect(focusInList).not.toBe('hidden');
  expect((await getState(page)).ui.tab).toBe('crafting');
});

test('Phase 5 AC6.4: matches the pad-inventory and pad-recipe-list references', async ({
  page,
}) => {
  const pad = await padGame(page, 'gathering');
  await give(page, DIRT, 20);
  await give(page, LOG, 3);
  await give(page, PLANKS, 6);
  await give(page, STONE, 12);
  await pad.tap(BUTTON.Y);
  // A picked bar slot, the focus on a grid slot.
  await focusOn(page, pad, slot(1));
  await pad.tap(BUTTON.A);
  await focusOn(page, pad, slot(30));
  await whenIdle(page);
  await expectFrameOnFocus(page);
  await expect(page).toHaveScreenshot('pad-inventory.png', { maxDiffPixelRatio: 0.02 });

  await pad.tap(BUTTON.B);
  await pad.tap(BUTTON.RB);
  await focusOn(page, pad, craft('sticks'));
  await whenIdle(page);
  await expectFrameOnFocus(page);
  // Mostly text: the looser limit of the text references.
  await expect(page).toHaveScreenshot('pad-recipe-list.png', { maxDiffPixelRatio: 0.05 });
});
