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
import { BUTTON, Pad, focusOn, installFakePads, polls } from './gamepad';

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
  // Phase 8: the third tab, Tasks, follows; its focus starts on its tab as well.
  await pad.tap(BUTTON.RB);
  expect((await getState(page)).ui).toMatchObject({ tab: 'tasks', focus: 'Tasks' });
  await pad.tap(BUTTON.RB);
  expect((await getState(page)).ui.tab).toBe('tasks');
  await pad.tap(BUTTON.LB);
  expect((await getState(page)).ui).toMatchObject({ tab: 'crafting', focus: 'Crafting' });
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

test('Phase 5 AC6.2 and Fix Adventure 1 AC3.2: A smelts coal three times in a row with the focus on "Craft Coal"; holding A keeps the furnace going; Y cancels it', async ({
  page,
}) => {
  const pad = await padGame(page, 'gathering');
  const { px, pz } = await standOnPlatform(page);
  await setBlock(page, px, PLATFORM_Y + 1, pz - 2, FURNACE);
  await give(page, LOG, 6);
  await pad.tap(BUTTON.Y);
  await pad.tap(BUTTON.RB);
  await focusOn(page, pad, craft('coal'));
  const onCoal = async (): Promise<void> => {
    expect(await focusOf(page)).toBe('Craft Coal');
    await whenIdle(page);
    await expectFrameOnFocus(page);
  };
  // Fix Adventure 1: the button stays under its bar, so the focus stays on it throughout.
  for (let n = 1; n <= 3; n++) {
    await pad.tap(BUTTON.A);
    await step(page, 1);
    expect((await getState(page)).smelting?.recipe).toBe(COAL_RECIPE);
    await onCoal();
    await step(page, 60);
    expect((await getState(page)).smelting?.progress).toBeCloseTo(61 / 120, 5);
    await onCoal();
    await step(page, 59);
    expect(await have(page, COAL)).toBe(n);
    expect((await getState(page)).smelting).toBeNull();
    if (n < 3) await onCoal();
  }
  expect(await have(page, LOG)).toBe(0);
  // The logs are used up: the button goes, the focus moves to the nearest one on screen.
  await expect(page.locator(craft('coal'))).toBeHidden();
  await expect.poll(() => focusOf(page)).not.toBe('Craft Coal');
  await whenIdle(page);
  await expectFrameOnFocus(page);

  // Held A: the first smelt after 30 steps, then each repeat after a delivery starts the
  // next one, without letting go.
  await give(page, LOG, 6);
  await focusOn(page, pad, craft('coal'));
  await pad.press(BUTTON.A);
  await step(page, 30);
  expect((await getState(page)).smelting?.recipe).toBe(COAL_RECIPE);
  await step(page, 250);
  expect(await have(page, COAL)).toBeGreaterThanOrEqual(5);
  await onCoal();
  expect((await getState(page)).smelting?.recipe).toBe(COAL_RECIPE);
  // Y closes and cancels the running smelt; nothing arrives later.
  const coal = await have(page, COAL);
  await pad.tap(BUTTON.Y);
  expect((await getState(page)).ui.screen).toBe('play');
  expect((await getState(page)).smelting).toBeNull();
  await pad.release(BUTTON.A);
  await step(page, 120);
  expect(await have(page, COAL)).toBe(coal);
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
  // With the inventory empty for a moment no row had a button: a frame in between rightly
  // moved the focus away ("Close"), and it does not jump back when the button returns.
  await focusOn(page, pad, craft('sticks'));
  expect(await focusOf(page)).toBe('Craft Stick');
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

test('Phase 8 AC5.3, Polish 2 AC3.4: LB/RB reach the Tasks tab; D-pad down reaches the open rows, A chooses and hides; the right stick scrolls it; B closes', async ({
  page,
}) => {
  await page.setViewportSize({ width: 640, height: 360 });
  await installFakePads(page);
  await openGame(page, { mode: 'gathering', progress: 'fresh' });
  // Chapter 3 is open with "Make a furnace" done: its row is plain text.
  await page.evaluate(() =>
    window.__mc.setProgress({ xp: 100, done: [1, 2, 3, 4, 5, 6, 7, 8, 9] }),
  );
  const pad = new Pad(page);
  await pad.connect();
  await pad.tap(BUTTON.Y);
  await pad.tap(BUTTON.RB);
  await pad.tap(BUTTON.RB);
  // The default focus stays on the tab.
  expect((await getState(page)).ui).toMatchObject({ tab: 'tasks', focus: 'Tasks' });
  // D-pad down enters the rows; the done row is skipped.
  await pad.tap(BUTTON.DOWN);
  expect(await focusOf(page)).toBe('Place a furnace');
  await expect(page.locator('.pad-hints')).toContainText('Track');
  await pad.tap(BUTTON.DOWN);
  expect(await focusOf(page)).toBe('Make 16 coal');
  const tracked = async () => (await getState(page)).progress?.tracked?.id ?? null;
  // Automatic shows the first open task; A chooses the focused one.
  expect(await tracked()).toBe(10);
  await pad.tap(BUTTON.A);
  expect(await tracked()).toBe(11);
  await expect(page.locator('.task-row.tracked')).toHaveAttribute('data-task', '11');
  // A on the shown task hides the tracker; A again shows it.
  await pad.tap(BUTTON.A);
  expect(await tracked()).toBeNull();
  expect((await getState(page)).progress?.track).toBe(-1);
  await expect(page.locator('.task-row.tracked')).toHaveCount(0);
  await pad.tap(BUTTON.A);
  expect(await tracked()).toBe(11);
  // The focus stayed on its row through the changes.
  expect(await focusOf(page)).toBe('Make 16 coal');
  // Walking the rows never reaches the done one.
  const seen = new Set<string>();
  for (const button of [BUTTON.DOWN, BUTTON.DOWN, BUTTON.DOWN, BUTTON.UP, BUTTON.UP, BUTTON.UP]) {
    await pad.tap(button);
    seen.add((await focusOf(page)) ?? '');
  }
  expect(seen.has('Make a furnace')).toBe(false);
  expect(
    await page.evaluate(() => document.querySelector('.task-row.done.pad-focused') === null),
  ).toBe(true);

  await pad.tap(BUTTON.DOWN);
  await pad.tap(BUTTON.DOWN);
  const tab = page.locator('.tasks-tab');
  // The book of five chapters fits the tab; a later, longer chapter would not. The test
  // makes the tab short so that it has something to scroll.
  await tab.evaluate((n) => (n.style.height = '120px'));
  expect(await tab.evaluate((n) => n.scrollHeight > n.clientHeight)).toBe(true);
  await tab.evaluate((n) => (n.scrollTop = 0));
  const top = await tab.evaluate((n) => n.scrollTop);
  await pad.stickFor('right', 0, 1, 10);
  await polls(page, 2);
  expect(await tab.evaluate((n) => n.scrollTop)).toBeGreaterThan(top + 10);
  expect((await getState(page)).ui.tab).toBe('tasks');
  await pad.tap(BUTTON.B);
  expect((await getState(page)).ui.screen).toBe('play');
});

test('Phase 8 AC3.3: A cannot reach a locked row: the D-pad never focuses one', async ({
  page,
}) => {
  await installFakePads(page);
  await openGame(page, { mode: 'gathering', progress: 'fresh' });
  const { px, pz } = await standOnPlatform(page);
  await setBlock(page, px + 1, PLATFORM_Y + 1, pz - 1, 15);
  await give(page, PLANKS, 20);
  await give(page, STICK, 10);
  await give(page, STONE, 20);
  const pad = new Pad(page);
  await pad.connect();
  await pad.tap(BUTTON.Y);
  await pad.tap(BUTTON.RB);
  const seen = new Set<string>();
  for (let i = 0; i < 24; i++) {
    await pad.tap(BUTTON.DOWN);
    const focus = await focusOf(page);
    if (focus) seen.add(focus);
    // A on whatever has the focus: never a locked recipe.
    await pad.tap(BUTTON.A);
  }
  expect([...seen]).toContain('Craft Wooden pickaxe');
  for (const locked of ['Craft Wooden axe', 'Craft Wooden shovel', 'Craft Stone pickaxe']) {
    expect([...seen]).not.toContain(locked);
  }
  expect(await have(page, 260)).toBe(0);
  expect(await have(page, 262)).toBe(0);
});
