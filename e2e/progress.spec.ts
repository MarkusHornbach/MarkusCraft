// The task book in the browser: saving, the Tasks tab, notices, locked rows (Phase 8 part A).
import type { Page } from '@playwright/test';
import { test, expect } from './fixtures';
import {
  PLATFORM_Y,
  getState,
  give,
  openGame,
  setBlock,
  setPlayer,
  standOnPlatform,
  step,
  submit,
  whenIdle,
} from './game';

const LOG = 5;

function progress(page: Page) {
  return page.evaluate(() => window.__mc.getState().progress);
}

test('Phase 8 AC4.4: progress survives a reload: open chapter, counts, XP', async ({ page }) => {
  await openGame(page, { save: true, world: 'Book', mode: 'gathering', progress: 'fresh' });
  expect(await progress(page)).toMatchObject({ level: 1, xp: 0, chapter: 1, done: [] });
  await page.evaluate(() => {
    window.__mc.setProgress({ xp: 40, done: [1, 3, 4] });
    window.__mc.give(5, 1);
  });
  // One craft of planks: 4 of "Make 64 planks" and the first craft's 5 XP.
  const result = await page.evaluate(() => window.__mc.submit({ kind: 'craft', recipe: 1 }));
  expect(result?.ok).toBe(true);
  const before = await progress(page);
  expect(before).toMatchObject({ xp: 45, level: 1, chapter: 1, done: [1, 3, 4] });
  expect(before?.tasks.find((t) => t.id === 2)).toEqual({ id: 2, count: 4, goal: 64, done: false });
  await page.evaluate(() => window.__mc.save());

  await openGame(page, { save: true, world: 'Book', mode: 'gathering', progress: 'fresh' });
  const after = await progress(page);
  expect(after).toEqual({ ...before, notice: after?.notice ?? null });
  expect((await getState(page)).inventory.slots.some((s) => s?.item === LOG)).toBe(false);
});

test('Phase 8 plan 5.8: progress=all is the default of an Adventure test world; Creative has none', async ({
  page,
}) => {
  await openGame(page, { mode: 'gathering' });
  const all = await progress(page);
  expect(all).toMatchObject({ level: 7, xp: 460, nextLevelXp: null, chapter: null, tasks: [] });
  expect(all?.done).toHaveLength(20);
  expect((await getState(page)).recipes.every((r) => !r.locked)).toBe(true);
  await openGame(page, { mode: 'gathering', progress: 'fresh' });
  const fresh = await getState(page);
  expect(fresh.progress).toMatchObject({ level: 1, xp: 0, nextLevelXp: 60, chapter: 1 });
  expect(fresh.progress?.tasks.map((t) => t.id)).toEqual([1, 2, 3, 4]);
  expect(fresh.recipes.find((r) => r.name === 'stone_pickaxe')).toMatchObject({
    locked: true,
    unlock: { level: 2 },
  });
  expect(fresh.recipes.find((r) => r.name === 'torch')?.unlock).toEqual({ task: 12 });
  await openGame(page);
  expect(await progress(page)).toBeNull();
});

const WORKBENCH = 15;
const PLANKS = 7;
const STICK = 257;

async function openTab(page: Page, tab: 'items' | 'crafting' | 'tasks'): Promise<void> {
  if (!(await getState(page)).ui.screen.startsWith('inventory')) await page.keyboard.press('KeyE');
  await page.locator(`.inventory-tab[data-tab="${tab}"]`).click();
  await expect.poll(async () => (await getState(page)).ui.tab).toBe(tab);
}

/** A fresh book with a workbench next to the player on a stone platform. */
async function freshAtWorkbench(page: Page): Promise<void> {
  await openGame(page, { mode: 'gathering', progress: 'fresh' });
  const { px, pz } = await standOnPlatform(page);
  await setBlock(page, px + 1, PLATFORM_Y + 1, pz - 1, WORKBENCH);
}

test('Phase 8 AC3.2: locked rows are dimmed, say what unlocks them, have no button; the tab counts only unlocked rows', async ({
  page,
}) => {
  await freshAtWorkbench(page);
  await give(page, LOG, 2);
  await give(page, PLANKS, 12);
  await give(page, STICK, 4);
  await openTab(page, 'crafting');
  const row = (name: string) => page.locator(`.recipe-row[data-recipe="${name}"]`);
  // Planks, sticks, workbench and the wooden pickaxe can be made; the wooden axe and shovel
  // have everything too, but need level 2.
  await expect(page.locator('.inventory-tab[data-tab="crafting"] .tab-count')).toHaveText('4');
  for (const name of ['wooden_axe', 'wooden_shovel', 'stone_pickaxe']) {
    await expect(row(name)).toHaveClass(/locked/);
    await expect(row(name).locator('.recipe-note')).toHaveText('Level 2');
    await expect(row(name).locator('.recipe-craft')).toBeHidden();
  }
  await expect(row('wooden_axe')).not.toHaveClass(/craftable/);
  await expect(row('wooden_pickaxe')).not.toHaveClass(/locked/);
  await expect(row('wooden_pickaxe').locator('.recipe-craft')).toBeVisible();
  await row('torch').scrollIntoViewIfNeeded();
  await expect(row('torch').locator('.recipe-note')).toHaveText('Task: Mine 32 coal');
  const state = await getState(page);
  expect(state.recipes.filter((r) => r.locked).map((r) => r.name)).toContain('wooden_axe');
  expect(state.recipes.find((r) => r.name === 'wooden_axe')?.craftable).toBe(false);
  await page.locator('.recipe-list').evaluate((list) => (list.scrollTop = 0));
  await whenIdle(page);
  await expect(page).toHaveScreenshot('recipe-list-locked.png', { maxDiffPixelRatio: 0.05 });
  // The action layer refuses it too; the HUD names the unlock (AC3.1, plan 5.4).
  await page.keyboard.press('KeyE');
  expect(await submit(page, { kind: 'craft', recipe: 5 })).toBe('locked');
  await whenIdle(page);
  await expect(page.locator('.hud-message')).toHaveText('Locked: Level 2');
});

test('Phase 8 AC5.2: the Tasks tab shows level, XP bar, next unlocks, chapters and counts, and updates while open', async ({
  page,
}) => {
  await freshAtWorkbench(page);
  await openTab(page, 'tasks');
  const tab = page.locator('.tasks-tab');
  await expect(tab.locator('.tasks-level')).toHaveText('Level 1');
  await expect(tab.locator('.tasks-xp-text')).toHaveText('0 / 60 XP');
  await expect(tab.locator('.tasks-next')).toHaveText(
    'Next level: Wooden axe, Wooden shovel, Stone pickaxe',
  );
  await expect(tab.locator('.tasks-chapter')).toHaveText('Chapter 1 · First wood');
  await expect(tab.locator('.task-row')).toHaveCount(4);
  await expect(tab.locator('.task-row').nth(1)).toContainText('Make 64 planks0 / 64');
  await expect(tab.locator('.tasks-footer')).toHaveText('4 more chapters');
  // Nothing on the tab takes the focus: no buttons in it.
  await expect(tab.locator('button, input')).toHaveCount(0);

  // A craft while the tab is open: the count and the XP move.
  await give(page, LOG, 1);
  expect(await submit(page, { kind: 'craft', recipe: 1 })).toBe(true);
  await expect(tab.locator('.task-row').nth(1).locator('.task-status')).toHaveText('4 / 64');
  await expect(tab.locator('.tasks-xp-text')).toHaveText('5 / 60 XP');

  // Mid-book: folded chapters and a reach task.
  await page.evaluate(() => window.__mc.setProgress({ xp: 100, done: [1, 2, 3, 4, 5, 6, 7] }));
  await expect(tab.locator('.tasks-finished-chapter')).toHaveText(['✓ First wood']);
  await expect(tab.locator('.tasks-chapter')).toHaveText('Chapter 2 · Tools');
  await expect(tab.locator('.task-row .task-status')).toHaveText(['✓', '✓', '✓', '–']);
  await expect(tab.locator('.tasks-level')).toHaveText('Level 2');
  await expect(tab.locator('.tasks-xp-text')).toHaveText('100 / 125 XP');
  await expect(tab.locator('.tasks-next')).toHaveText(
    'Next level: Stone axe, Stone shovel, Furnace, Coal',
  );
  const fill = await tab.locator('.tasks-xp-fill').evaluate((e) => e.style.width);
  expect(fill).toBe('62%');
  // Climbing to 64 finishes the chapter while the tab is open.
  await setPlayer(page, { y: 70 });
  await step(page, 1);
  await expect(tab.locator('.tasks-chapter')).toHaveText('Chapter 3 · Stone and fire');
  await expect(tab.locator('.tasks-finished-chapter')).toHaveText(['✓ First wood', '✓ Tools']);
  await setPlayer(page, { y: PLATFORM_Y + 1 });
  await step(page, 400);
  await whenIdle(page);
  await expect(page).toHaveScreenshot('tasks-tab.png', { maxDiffPixelRatio: 0.05 });

  // The end of the book.
  await page.evaluate(() =>
    window.__mc.setProgress({ xp: 600, done: Array.from({ length: 20 }, (_, i) => i + 1) }),
  );
  await expect(tab.locator('.tasks-xp-text')).toHaveText('Max level');
  await expect(tab.locator('.tasks-next')).toBeHidden();
  await expect(tab.locator('.tasks-footer')).toHaveText('All tasks done.');
  await expect(tab.locator('.task-row')).toHaveCount(0);
});

test('Phase 8 AC5.5: a task notice shows for 3 000 ms of simulation time; queued notices follow; over the open inventory', async ({
  page,
}) => {
  await freshAtWorkbench(page);
  await page.evaluate(() => window.__mc.setProgress({ xp: 45 }));
  await give(page, PLANKS, 4);
  const notice = page.locator('.progress-notice');
  await expect(notice).toBeHidden();
  // The workbench finishes "Make a workbench" (+10, first craft +5: level 2); placing it
  // finishes "Place a workbench".
  expect(await submit(page, { kind: 'craft', recipe: 3 })).toBe(true);
  const { player } = await getState(page);
  const cell = { x: Math.floor(player.x) - 1, y: PLATFORM_Y + 1, z: Math.floor(player.z) - 2 };
  expect(await submit(page, { kind: 'place', ...cell, slot: 0 })).toBe(true);
  const text = async () => (await getState(page)).progress?.notice ?? null;
  expect(await text()).toBe('Task done: Make a workbench · +10 XP');
  await whenIdle(page);
  await expect(notice).toHaveText('Task done: Make a workbench · +10 XP');
  await step(page, 179);
  expect(await text()).toBe('Task done: Make a workbench · +10 XP');
  await step(page, 1);
  expect(await text()).toBe('Level 2 · Unlocked: Wooden axe, Wooden shovel, Stone pickaxe');
  // Over the open inventory, at the top centre, away from the panel's tabs.
  await page.keyboard.press('KeyE');
  await whenIdle(page);
  await expect(notice).toBeVisible();
  const box = await notice.boundingBox();
  const panel = await page.locator('.inventory-panel').boundingBox();
  expect(box && panel && box.y + box.height <= panel.y).toBe(true);
  const onTop = await page.evaluate(() => {
    const n = document.querySelector('.progress-notice');
    const inv = document.querySelector('.inventory-screen');
    return Boolean(n && inv && inv.compareDocumentPosition(n) & Node.DOCUMENT_POSITION_FOLLOWING);
  });
  expect(onTop).toBe(true);
  await expect(page).toHaveScreenshot('progress-notice.png', { maxDiffPixelRatio: 0.05 });
  await step(page, 180);
  expect(await text()).toBe('Task done: Place a workbench · +10 XP');
  await step(page, 180);
  expect(await text()).toBeNull();
  await whenIdle(page);
  await expect(notice).toBeHidden();
});

test('Phase 8 AC5.6: the F3 overlay shows the Progress row in Adventure only', async ({ page }) => {
  await openGame(page, { mode: 'gathering', progress: 'fresh' });
  await page.evaluate(() =>
    window.__mc.setProgress({ xp: 160, done: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] }),
  );
  await page.keyboard.press('F3');
  await whenIdle(page);
  await expect(page.locator('[data-debug="progress"]')).toHaveText(
    'Chapter 3 · Task 2/4 done · Level 3 · 160/190 XP',
  );
  await openGame(page);
  await page.keyboard.press('F3');
  await whenIdle(page);
  await expect(page.locator('[data-debug="progress"]')).toBeHidden();
});
