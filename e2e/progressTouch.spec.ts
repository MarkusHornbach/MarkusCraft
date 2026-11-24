// The task book on a phone: the Tasks tab, locked rows and the notice at 640 × 360 in touch
// mode (Phase 8 part A, AC3.2, AC5.3–AC5.5).
import type { Page } from '@playwright/test';
import { test, expect } from './fixtures';
import { getState, whenIdle } from './game';
import { TOUCH_DEVICE, withoutFullscreen } from './touch';

test.use(TOUCH_DEVICE);
test.describe.configure({ timeout: 180_000 });

const PHONE = { width: 640, height: 360 };

interface Box {
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

function boxes(page: Page, selector: string): Promise<Box[]> {
  return page.evaluate((sel) => {
    const result: Box[] = [];
    for (const node of document.querySelectorAll<HTMLElement>(sel)) {
      const r = node.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const name = `${node.className} ${node.dataset.touch ?? node.dataset.task ?? ''}`.trim();
      result.push({ name, x: r.x, y: r.y, width: r.width, height: r.height });
    }
    return result;
  }, selector);
}

function overlap(a: Box, b: Box): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

function expectInside(list: Box[]): void {
  for (const b of list) {
    expect(b.x, b.name).toBeGreaterThanOrEqual(0);
    expect(b.y, b.name).toBeGreaterThanOrEqual(0);
    expect(b.x + b.width, b.name).toBeLessThanOrEqual(PHONE.width + 0.5);
    expect(b.y + b.height, b.name).toBeLessThanOrEqual(PHONE.height + 0.5);
  }
}

/** A fresh Adventure world from the form on a phone, render distance 2. */
async function phoneWorld(page: Page): Promise<void> {
  await page.setViewportSize(PHONE);
  await page.addInitScript(() => {
    if (!localStorage.getItem('markuscraft.settings.v1')) {
      localStorage.setItem(
        'markuscraft.settings.v1',
        JSON.stringify({ renderDistance: 2, mouseSensitivity: 1, fov: 75 }),
      );
    }
  });
  await withoutFullscreen(page);
  await page.goto('/?seed=1337&time=0.5');
  await page.locator('.world-menu[data-ready]').waitFor();
  await page.locator('.world-mode-button[data-mode="gathering"]').tap();
  await page.locator('.world-create-button').tap();
  await page.waitForFunction(() => !window.__mc.getState().paused);
}

test('Phase 8 AC5.4, AC5.3: at 640 × 360 the Tasks tab lies inside the view, rows do not overlap, the last row scrolls into view', async ({
  page,
}) => {
  await phoneWorld(page);
  // Mid-book, so that the tab has more than fits.
  await page.evaluate(() => window.__mc.setProgress({ xp: 100, done: [1, 2, 3, 4, 5, 6, 7, 8] }));
  await page.locator('.touch-bag').tap();
  await page.locator('.inventory-tab[data-tab="tasks"]').tap();
  expect((await getState(page)).ui.tab).toBe('tasks');
  expectInside(await boxes(page, '.inventory-panel, .inventory-tab, .inventory-close'));
  const tab = (await boxes(page, '.tasks-tab'))[0];
  expectInside([tab]);
  const rows = await boxes(page, '.task-row, .tasks-level-row, .tasks-next, .tasks-chapter');
  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      expect(overlap(rows[i], rows[j]), `${rows[i].name} / ${rows[j].name}`).toBe(false);
    }
  }
  // The panel scrolls inside: a finger drag sideways would not; scroll as the list does.
  const last = page.locator('.task-row').last();
  await last.scrollIntoViewIfNeeded();
  const lastBox = await last.boundingBox();
  expect(lastBox).not.toBeNull();
  if (lastBox) {
    expect(lastBox.y).toBeGreaterThanOrEqual(tab.y - 0.5);
    expect(lastBox.y + lastBox.height).toBeLessThanOrEqual(tab.y + tab.height + 0.5);
  }
  await page.locator('.tasks-tab').evaluate((n) => (n.scrollTop = 0));
  // Tabs by touch: back to Items and to Crafting.
  await page.locator('.inventory-tab[data-tab="crafting"]').tap();
  expect((await getState(page)).ui.tab).toBe('crafting');
  await page.locator('.inventory-tab[data-tab="tasks"]').tap();
  // The world behind the screen is not part of this reference: hide the canvas.
  await page.locator('canvas.game-canvas').evaluate((node) => {
    (node as HTMLElement).style.visibility = 'hidden';
  });
  await whenIdle(page);
  await expect(page).toHaveScreenshot('tasks-tab-touch.png', { maxDiffPixelRatio: 0.05 });
});

test('Phase 8 AC3.2 (touch): locked rows have no button and the tab counts only unlocked rows', async ({
  page,
}) => {
  await phoneWorld(page);
  await page.evaluate(() => {
    window.__mc.give(7, 12);
    window.__mc.give(257, 4);
  });
  await page.locator('.touch-bag').tap();
  await page.locator('.inventory-tab[data-tab="crafting"]').tap();
  // Sticks and the workbench (no station near for the pickaxe and the axe).
  await expect(page.locator('.inventory-tab[data-tab="crafting"] .tab-count')).toHaveText('2');
  const axe = page.locator('.recipe-row[data-recipe="wooden_axe"]');
  await expect(axe).toHaveClass(/locked/);
  await expect(axe.locator('.recipe-note')).toHaveText('Level 2');
  await expect(axe.locator('.recipe-craft')).toBeHidden();
});

test('Phase 8 AC5.5 (touch): the notice never covers a touch button or the bar, shows over the inventory, not over the pause menu', async ({
  page,
}) => {
  await phoneWorld(page);
  // Notices in a row (several seconds of simulation time): the real loop runs slowly here.
  await page.evaluate(() => {
    // 45 XP: the workbench's task and first craft make level 2, a second notice.
    window.__mc.setProgress({ xp: 45 });
    window.__mc.give(5, 2);
    window.__mc.give(7, 4);
    window.__mc.submit({ kind: 'craft', recipe: 1 });
    window.__mc.submit({ kind: 'craft', recipe: 1 });
    window.__mc.submit({ kind: 'craft', recipe: 3 });
  });
  const notice = page.locator('.progress-notice');
  await expect(notice).toHaveText(/^(Task done|Level 2)/);
  const [box] = await boxes(page, '.progress-notice');
  expectInside([box]);
  for (const other of await boxes(page, '.touch-button, .touch-menu, .hotbar, .touch-stick')) {
    expect(overlap(box, other), other.name).toBe(false);
  }
  // Over the open inventory.
  await page.locator('.touch-bag').tap();
  await expect(page.locator('.inventory-screen')).toBeVisible();
  await expect(notice).toBeVisible();
  const [over] = await boxes(page, '.progress-notice');
  for (const other of await boxes(page, '.inventory-tab, .inventory-close')) {
    expect(overlap(over, other), other.name).toBe(false);
  }
  await page.locator('.inventory-close').tap();
  await page.waitForFunction(() => window.__mc.getState().ui.screen === 'play');
  // Not over the pause menu.
  await page.locator('.touch-menu').tap();
  await page.waitForFunction(() => window.__mc.getState().paused);
  await expect(notice).toBeHidden();
});

test('Polish 2 AC3.3: at 640 × 360 the tracker lies below the menu button, inside the view, clear of the buttons, the bar and the notice; a tap on a row chooses it', async ({
  page,
}) => {
  await phoneWorld(page);
  const tracker = page.locator('.task-tracker');
  await expect(tracker).toHaveText('Mine 32 logs  0 / 32');
  const check = async () => {
    const [box] = await boxes(page, '.task-tracker');
    expectInside([box]);
    const [menu] = await boxes(page, '.touch-menu');
    expect(box.y).toBeGreaterThanOrEqual(menu.y + menu.height);
    expect(box.x).toBeLessThan(menu.x + menu.width);
    for (const other of await boxes(
      page,
      '.touch-button, .touch-menu, .hotbar, .touch-stick, .progress-notice',
    )) {
      expect(overlap(box, other), other.name).toBe(false);
    }
  };
  await check();
  // The world behind is not part of this reference: hide the canvas.
  await page.locator('canvas.game-canvas').evaluate((node) => {
    (node as HTMLElement).style.visibility = 'hidden';
  });
  await whenIdle(page);
  await expect(page).toHaveScreenshot('task-tracker-touch.png', { maxDiffPixelRatio: 0.02 });

  // A tap on a row of the Tasks tab chooses its task.
  await page.locator('.touch-bag').tap();
  await page.locator('.inventory-tab[data-tab="tasks"]').tap();
  await page.locator('.task-row[data-task="3"]').tap();
  expect((await getState(page)).progress?.tracked?.id).toBe(3);
  await page.locator('.task-row[data-task="3"]').tap();
  expect((await getState(page)).progress?.tracked).toBeNull();
  await page.locator('.task-row[data-task="2"]').tap();
  expect((await getState(page)).progress?.tracked?.id).toBe(2);
  await page.locator('.inventory-close').tap();
  await page.waitForFunction(() => window.__mc.getState().ui.screen === 'play');
  await expect(tracker).toHaveText('Make 64 planks  0 / 64');

  // A notice at the top centre: the tracker stays clear of it.
  await page.evaluate(() => {
    window.__mc.setProgress({ xp: 45 });
    window.__mc.give(7, 4);
    window.__mc.submit({ kind: 'craft', recipe: 3 });
  });
  await expect(page.locator('.progress-notice')).toBeVisible();
  await check();
});
