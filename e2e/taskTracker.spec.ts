// The task tracker on the HUD (Polish 2): what it shows, when it moves on, when it hides.
import type { Page } from '@playwright/test';
import { test, expect } from './fixtures';
import {
  PLATFORM_Y,
  backToWorlds,
  createWorld,
  getState,
  give,
  openGame,
  openMenu,
  pauseWithMouse,
  standOnPlatform,
  submit,
  whenIdle,
} from './game';

const LOG = 5;
const WORKBENCH = 15;

function tracked(page: Page) {
  return page.evaluate(() => window.__mc.getState().progress?.tracked ?? null);
}

/** The tracker's line as the screen shows it, or null while it is not visible. */
async function trackerLine(page: Page): Promise<string | null> {
  const tracker = page.locator('.task-tracker');
  return (await tracker.isVisible()) ? await tracker.textContent() : null;
}

async function openTasks(page: Page): Promise<void> {
  await page.keyboard.press('KeyE');
  await page.locator('.inventory-tab[data-tab="tasks"]').click();
  await expect.poll(async () => (await getState(page)).ui.tab).toBe('tasks');
}

async function closeInventory(page: Page): Promise<void> {
  await page.keyboard.press('KeyE');
  await expect.poll(async () => (await getState(page)).ui.screen).toBe('play');
}

test('Polish 2 AC3.1: mouse: the tracker shows the first task; a click on a row chooses it, its count follows a craft; a click again hides; any row shows it again', async ({
  page,
}) => {
  await openGame(page, { mode: 'gathering', progress: 'fresh' });
  const tracker = page.locator('.task-tracker');
  await expect(tracker).toBeVisible();
  expect(await trackerLine(page)).toBe('Mine 32 logs  0 / 32');
  expect((await getState(page)).progress).toMatchObject({ track: 0 });
  // Top-left corner, 12 px in.
  const box = await tracker.boundingBox();
  expect(box?.x).toBe(12);
  expect(box?.y).toBe(12);
  await whenIdle(page);
  await expect(page).toHaveScreenshot('task-tracker.png', {
    clip: { x: 0, y: 0, width: 480, height: 96 },
    maxDiffPixelRatio: 0.02,
  });

  await openTasks(page);
  const planks = page.locator('.task-row[data-task="2"]');
  await expect(page.locator('.task-row.tracked')).toHaveAttribute('data-task', '1');
  await planks.click();
  expect(await tracked(page)).toEqual({ id: 2, text: 'Make 64 planks  0 / 64' });
  expect((await getState(page)).progress?.track).toBe(2);
  await expect(planks).toHaveClass(/tracked/);
  await expect(planks.locator('.task-mark')).toHaveText('Tracked');
  await expect(page.locator('.task-row.tracked')).toHaveCount(1);
  // The rows keep their height and place in the tab (the panel itself is centred and
  // may move by a pixel when the Crafting tab's count appears).
  const places = () =>
    page.locator('.task-row').evaluateAll((rows) => {
      const tab = rows[0]?.closest('.tasks-tab')?.getBoundingClientRect();
      return rows.map((r) => {
        const box = r.getBoundingClientRect();
        return [box.x - (tab?.x ?? 0), box.y - (tab?.y ?? 0), box.width, box.height];
      });
    });
  const before = await places();
  await give(page, LOG, 1);
  expect(await submit(page, { kind: 'craft', recipe: 1 })).toBe(true);
  await expect(planks.locator('.task-status')).toHaveText('4 / 64');
  const after = await places();
  expect(after).toEqual(before);
  await closeInventory(page);
  expect(await trackerLine(page)).toBe('Make 64 planks  4 / 64');

  await openTasks(page);
  await planks.click();
  expect(await tracked(page)).toBeNull();
  expect((await getState(page)).progress?.track).toBe(-1);
  await expect(page.locator('.task-row.tracked')).toHaveCount(0);
  await closeInventory(page);
  await expect(tracker).toBeHidden();

  // Any row shows it again; done rows are no buttons.
  await openTasks(page);
  await page.locator('.task-row[data-task="4"]').click();
  expect(await tracked(page)).toEqual({ id: 4, text: 'Place a workbench  0 / 1' });
  await page.evaluate(() => window.__mc.setProgress({ done: [1] }));
  await expect(page.locator('.task-row[data-task="1"]')).toHaveClass(/done/);
  await expect(page.locator('button.task-row[data-task="1"]')).toHaveCount(0);
  await closeInventory(page);
  expect(await trackerLine(page)).toBe('Place a workbench  0 / 1');
});

test('Polish 2 AC3.2: the tracker moves on when its task is done, to the next chapter, and hides when the book is complete', async ({
  page,
}) => {
  await openGame(page, { mode: 'gathering', progress: 'fresh' });
  await page.evaluate(() =>
    window.__mc.setProgress({ done: [1], counts: [{ task: 2, count: 63 }] }),
  );
  expect(await tracked(page)).toEqual({ id: 2, text: 'Make 64 planks  63 / 64' });
  expect(await trackerLine(page)).toBe('Make 64 planks  63 / 64');
  // The one craft that finishes "Make 64 planks" moves the tracker on to the next task.
  await give(page, LOG, 1);
  expect(await submit(page, { kind: 'craft', recipe: 1 })).toBe(true);
  expect(await tracked(page)).toEqual({ id: 3, text: 'Make a workbench  0 / 1' });
  expect(await trackerLine(page)).toBe('Make a workbench  0 / 1');

  // The chapter's last task: placing a workbench opens chapter 2, whose first task shows.
  await page.evaluate(() => window.__mc.setProgress({ done: [1, 2, 3] }));
  expect(await submit(page, { kind: 'track', task: 4 })).toBe(true);
  expect((await getState(page)).progress?.track).toBe(4);
  const { px, pz } = await standOnPlatform(page);
  await give(page, WORKBENCH, 1);
  const slot = (await getState(page)).inventory.slots.findIndex((s) => s?.item === WORKBENCH);
  expect(slot).toBeGreaterThanOrEqual(0);
  expect(slot).toBeLessThan(9);
  const cell = { x: px + 1, y: PLATFORM_Y + 1, z: pz - 1 };
  expect(await submit(page, { kind: 'place', ...cell, slot })).toBe(true);
  expect((await getState(page)).progress?.chapter).toBe(2);
  expect(await tracked(page)).toEqual({ id: 5, text: 'Make a wooden pickaxe  0 / 1' });
  // The record keeps the choice; the derivation decides what shows.
  expect((await getState(page)).progress?.track).toBe(4);

  // A complete book shows nothing.
  await page.evaluate(() =>
    window.__mc.setProgress({ done: Array.from({ length: 20 }, (_, i) => i + 1) }),
  );
  expect(await tracked(page)).toBeNull();
  await expect(page.locator('.task-tracker')).toBeHidden();
});

test('Polish 2 AC3.5: hidden in Creative and while the inventory is open; the choice survives a reload', async ({
  page,
}) => {
  await openGame(page);
  expect((await getState(page)).progress).toBeNull();
  await expect(page.locator('.task-tracker')).toBeHidden();

  await openGame(page, { save: true, world: 'Tracked', mode: 'gathering', progress: 'fresh' });
  await expect(page.locator('.task-tracker')).toBeVisible();
  expect(await trackerLine(page)).toBe('Mine 32 logs  0 / 32');
  expect(await submit(page, { kind: 'track', task: 3 })).toBe(true);
  expect(await trackerLine(page)).toBe('Make a workbench  0 / 1');
  await page.keyboard.press('KeyE');
  await expect.poll(async () => (await getState(page)).ui.screen).toBe('inventory');
  await expect(page.locator('.task-tracker')).toBeHidden();
  await page.keyboard.press('KeyE');
  await expect(page.locator('.task-tracker')).toBeVisible();
  await page.evaluate(() => window.__mc.save());

  await openGame(page, { save: true, world: 'Tracked', mode: 'gathering', progress: 'fresh' });
  expect((await getState(page)).progress).toMatchObject({
    track: 3,
    tracked: { id: 3, text: 'Make a workbench  0 / 1' },
  });
  expect(await trackerLine(page)).toBe('Make a workbench  0 / 1');
  // Hidden by choice, and that is kept too.
  expect(await submit(page, { kind: 'track', task: -1 })).toBe(true);
  expect(await tracked(page)).toBeNull();
  await page.evaluate(() => window.__mc.save());
  await openGame(page, { save: true, world: 'Tracked', mode: 'gathering', progress: 'fresh' });
  expect((await getState(page)).progress).toMatchObject({ track: -1, tracked: null });
  await expect(page.locator('.task-tracker')).toBeHidden();
});

test('Polish 2 AC3.5: hidden while the pause menu or the world menu shows', async ({ page }) => {
  await openMenu(page);
  await createWorld(page, { name: 'Tracker menus', mode: 'gathering' });
  await expect(page.locator('.task-tracker')).toBeVisible();
  expect(await trackerLine(page)).toBe('Mine 32 logs  0 / 32');
  await pauseWithMouse(page);
  await expect(page.locator('.task-tracker')).toBeHidden();
  await backToWorlds(page);
  await expect(page.locator('.task-tracker')).toBeHidden();
});
