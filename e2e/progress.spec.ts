// The task book in the browser: saving, the Tasks tab, notices, locked rows (Phase 8 part A).
import type { Page } from '@playwright/test';
import { test, expect } from './fixtures';
import {
  PLATFORM_Y,
  getBlock,
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
  expect(all?.done).toHaveLength(21);
  expect((await getState(page)).recipes.every((r) => !r.locked)).toBe(true);
  await openGame(page, { mode: 'gathering', progress: 'fresh' });
  const fresh = await getState(page);
  expect(fresh.progress).toMatchObject({ level: 1, xp: 0, nextLevelXp: 50, chapter: 1 });
  expect(fresh.progress?.tasks.map((t) => t.id)).toEqual([1, 2, 3, 4]);
  expect(fresh.recipes.find((r) => r.name === 'stone_pickaxe')).toMatchObject({
    locked: true,
    unlock: { level: 2 },
  });
  // Fix Adventure 1: the torch comes with task 11 "Make 16 coal".
  expect(fresh.recipes.find((r) => r.name === 'torch')?.unlock).toEqual({ task: 11 });
  await openGame(page);
  expect(await progress(page)).toBeNull();
});

const WORKBENCH = 15;
const PLANKS = 7;
const STICK = 257;
const FURNACE = 16;
const TORCH = 19;

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
  await expect(row('torch').locator('.recipe-note')).toHaveText('Task: Make 16 coal');
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

test('Fix Adventure 1 AC1.5: one real smelt finishes "Make 16 coal", which unlocks the torch', async ({
  page,
}) => {
  await openGame(page, { mode: 'gathering', progress: 'fresh' });
  const { px, pz } = await standOnPlatform(page);
  await setBlock(page, px, PLATFORM_Y + 1, pz - 2, FURNACE);
  // Chapter 3 open, furnace made and placed, one coal short of 16; level 3 for coal.
  await page.evaluate(() =>
    window.__mc.setProgress({
      xp: 160,
      done: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      counts: [{ task: 11, count: 15 }],
    }),
  );
  await give(page, LOG, 2);
  await give(page, STICK, 1);
  expect((await getState(page)).recipes.find((r) => r.name === 'torch')?.unlock).toEqual({
    task: 11,
  });
  await openTab(page, 'crafting');
  const row = (name: string) => page.locator(`.recipe-row[data-recipe="${name}"]`);
  await row('torch').scrollIntoViewIfNeeded();
  await expect(row('torch')).toHaveClass(/locked/);
  await expect(row('torch').locator('.recipe-note')).toHaveText('Task: Make 16 coal');
  await expect(row('torch').locator('.recipe-craft')).toBeHidden();

  await row('coal').scrollIntoViewIfNeeded();
  await row('coal').locator('.recipe-craft').click();
  await step(page, 1);
  expect((await getState(page)).smelting?.recipe).toBe(11);
  await step(page, 120);
  expect((await getState(page)).smelting).toBeNull();
  expect((await progress(page))?.done).toContain(11);
  const notices: string[] = [];
  for (let i = 0; i < 6 && !notices.includes('Unlocked: Torch'); i++) {
    const text = (await progress(page))?.notice;
    if (text && !notices.includes(text)) notices.push(text);
    if (!notices.includes('Unlocked: Torch')) await step(page, 60);
  }
  expect(notices).toEqual(['Task done: Make 16 coal · +20 XP', 'Unlocked: Torch']);
  await whenIdle(page);
  await expect(page.locator('.progress-notice')).toHaveText('Unlocked: Torch');

  await row('torch').scrollIntoViewIfNeeded();
  await expect(row('torch')).not.toHaveClass(/locked/);
  const torchButton = row('torch').locator('.recipe-craft');
  await expect(torchButton).toBeVisible();
  await torchButton.click();
  await step(page, 1);
  const slots = (await getState(page)).inventory.slots;
  expect(slots.some((s) => s?.item === TORCH && s.count === 4)).toBe(true);
});

test('Phase 8 AC5.2: the Tasks tab shows level, XP bar, next unlocks, chapters and counts, and updates while open', async ({
  page,
}) => {
  await freshAtWorkbench(page);
  await openTab(page, 'tasks');
  const tab = page.locator('.tasks-tab');
  await expect(tab.locator('.tasks-level')).toHaveText('Level 1');
  await expect(tab.locator('.tasks-xp-text')).toHaveText('0 / 50 XP');
  await expect(tab.locator('.tasks-next')).toHaveText(
    'Next level: Wooden axe, Wooden shovel, Stone pickaxe',
  );
  await expect(tab.locator('.tasks-chapter')).toHaveText('Chapter 1 · First wood');
  await expect(tab.locator('.task-row')).toHaveCount(4);
  await expect(tab.locator('.task-row').nth(1)).toContainText('Make 64 planks0 / 64');
  await expect(tab.locator('.tasks-footer')).toHaveText('4 more chapters');
  // Polish 2: the open rows are buttons (they choose the tracked task); nothing else is.
  await expect(tab.locator('button, input')).toHaveCount(4);
  await expect(tab.locator('button.task-row')).toHaveCount(4);
  await expect(tab.locator('.task-row.tracked')).toHaveText('Mine 32 logsTracked0 / 32');

  // A craft while the tab is open: the count and the XP move.
  await give(page, LOG, 1);
  expect(await submit(page, { kind: 'craft', recipe: 1 })).toBe(true);
  await expect(tab.locator('.task-row').nth(1).locator('.task-status')).toHaveText('4 / 64');
  await expect(tab.locator('.tasks-xp-text')).toHaveText('5 / 50 XP');

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
  expect(fill).toBe('67%');
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
    window.__mc.setProgress({ xp: 600, done: Array.from({ length: 21 }, (_, i) => i + 1) }),
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
    'Chapter 3 · Task 2/5 done · Level 3 · 160/190 XP',
  );
  await openGame(page);
  await page.keyboard.press('F3');
  await whenIdle(page);
  await expect(page.locator('[data-debug="progress"]')).toBeHidden();
});

/** Logs within reach of a free cell on the ground beside their trunk, nearest first. */
function reachableLogs(page: Page) {
  return page.evaluate(() => {
    const mc = window.__mc;
    const start = mc.getState().player;
    const sx = Math.floor(start.x);
    const sz = Math.floor(start.z);
    const found: { log: [number, number, number]; stand: [number, number, number]; d: number }[] =
      [];
    for (let dz = -60; dz <= 60; dz++) {
      for (let dx = -60; dx <= 60; dx++) {
        const x = sx + dx;
        const z = sz + dz;
        const top = mc.surfaceY(x, z);
        if (top < 0) continue;
        // `surfaceY` of a trunk is its top log: the trunk reaches down below it.
        for (let y = top - 8; y <= top; y++) {
          if (mc.getBlock(x, y, z) !== 5) continue;
          for (const [ox, oz] of [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
          ]) {
            const gx = x + ox;
            const gz = z + oz;
            const ground = mc.surfaceY(gx, gz);
            const g = mc.getBlock(gx, ground, gz);
            // Dry ground, two free cells above it, the log within easy reach of the eye.
            if (g === 0 || g === 5 || g === 6 || g === 10) continue;
            if (mc.getBlock(gx, ground + 1, gz) !== 0 || mc.getBlock(gx, ground + 2, gz) !== 0)
              continue;
            const eye = ground + 1 + 1.62;
            if (Math.abs(y + 0.5 - eye) > 3) continue;
            found.push({ log: [x, y, z], stand: [gx, ground + 1, gz], d: Math.hypot(dx, dz) });
            break;
          }
        }
      }
    }
    return found.sort((a, b) => a.d - b.d);
  });
}

test('Phase 8 AC6.1: a fresh world, real input, nothing given: chapter 1 completes, the notices appear, level 2 unlocks the stone pickaxe', async ({
  page,
}) => {
  test.setTimeout(600_000);
  await openGame(page, {
    mode: 'gathering',
    progress: 'fresh',
    terrain: 'balanced',
    trees: 'few',
  });
  const start = (await getState(page)).player;
  expect((await getState(page)).inventory.slots.every((s) => s === null)).toBe(true);
  const tasks = (await progress(page))?.tasks ?? [];
  const goal = (id: number) => tasks.find((t) => t.id === id)?.goal ?? 0;
  const logsNeeded = goal(1);
  const planksNeeded = goal(2);
  const notices: string[] = [];
  const noteNotice = async () => {
    const text = (await progress(page))?.notice ?? null;
    if (text && notices[notices.length - 1] !== text) notices.push(text);
  };

  // 1. Logs by hand, the player beside each trunk (a teleport stands for the walk, as in
  // the play-throughs of Phase 3), the mouse held on the log.
  let mined = 0;
  for (const { log, stand } of await reachableLogs(page)) {
    if (mined >= logsNeeded) break;
    if ((await getBlock(page, ...log)) !== LOG) continue;
    const ex = stand[0] + 0.5;
    const ey = stand[1] + 1.62;
    const ez = stand[2] + 0.5;
    const dx = log[0] + 0.5 - ex;
    const dy = log[1] + 0.5 - ey;
    const dz = log[2] + 0.5 - ez;
    await setPlayer(page, {
      x: ex,
      y: stand[1],
      z: ez,
      yaw: Math.atan2(-dx, -dz),
      pitch: Math.atan2(dy, Math.hypot(dx, dz)),
    });
    const target = (await getState(page)).target;
    if (!target || target.x !== log[0] || target.y !== log[1] || target.z !== log[2]) continue;
    await page.mouse.move(480, 270);
    await page.mouse.down();
    await step(page, 121);
    await page.mouse.up();
    await step(page, 1);
    if ((await getBlock(page, ...log)) !== LOG) mined++;
    await noteNotice();
  }
  expect(mined).toBe(logsNeeded);
  expect((await progress(page))?.done).toEqual([1]);
  expect(notices).toContain(`Task done: Mine ${logsNeeded} logs · +10 XP`);

  // 2. Planks by the "Craft" button, then the workbench.
  await openTab(page, 'crafting');
  const planks = page.locator('.recipe-row[data-recipe="planks"] .recipe-craft');
  for (let i = 0; i < planksNeeded / 4; i++) {
    await planks.click();
    await step(page, 20);
    await noteNotice();
  }
  await page.locator('.recipe-row[data-recipe="workbench"] .recipe-craft').click();
  await step(page, 1);
  await noteNotice();
  expect((await progress(page))?.done).toEqual([1, 2, 3]);
  await page.keyboard.press('KeyE');

  // 3. The workbench on the ground, by a right click.
  const slots = (await getState(page)).inventory.slots;
  const bench = slots.findIndex((s) => s?.item === WORKBENCH);
  expect(bench).toBeGreaterThanOrEqual(0);
  expect(bench).toBeLessThan(9);
  await page.keyboard.press(`Digit${bench + 1}`);
  // Back on the open grass of the start point, looking down in front of the feet.
  await setPlayer(page, {
    x: start.x,
    y: start.y,
    z: start.z,
    yaw: 0,
    pitch: (-70 * Math.PI) / 180,
  });
  await step(page, 30);
  const ground = (await getState(page)).target;
  expect(ground?.face).toEqual([0, 1, 0]);
  await page.mouse.click(480, 270, { button: 'right' });
  await step(page, 1);
  const state = await progress(page);
  expect(state?.chapter).toBe(2);
  expect(state?.done).toEqual([1, 2, 3, 4]);
  expect(state?.level).toBe(2);
  // The notices of the rest of chapter 1 follow one after the other.
  for (let i = 0; i < 12; i++) {
    await noteNotice();
    await step(page, 90);
  }
  expect(notices).toEqual(
    expect.arrayContaining([
      `Task done: Make ${planksNeeded} planks · +10 XP`,
      'Task done: Make a workbench · +10 XP',
      'Task done: Place a workbench · +10 XP',
      'Chapter done: First wood',
      'Level 2 · Unlocked: Wooden axe, Wooden shovel, Stone pickaxe',
    ]),
  );
  const recipes = (await getState(page)).recipes;
  expect(recipes.find((r) => r.name === 'stone_pickaxe')?.locked).toBe(false);
  expect(await page.evaluate(() => window.__mc.verifyLight())).toBe(0);
});
