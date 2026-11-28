// Phase 8 part B3a2: the chest screen on touch: the place button opens it, taps move, a
// double tap quick moves, "Close" closes (AC5.2); it fits a phone without scrolling
// (AC5.3); the chest-screen-touch reference.
import type { Page } from '@playwright/test';
import { chestAhead, chestSlot as slot, getChest, screen } from './chests';
import { expect, test } from './fixtures';
import { getState, inventory, step, whenIdle } from './game';
import { TOUCH_DEVICE, openTouchGame, withoutFullscreen } from './touch';

test.use(TOUCH_DEVICE);

const STONE = 3;
const PLANKS = 7;
const CHEST = 20;
const STORAGE_KEY = 'markuscraft.settings.v1';

test('Phase 8B3a AC5.2: the place button opens a chest; taps move, a double tap quick moves; Close closes', async ({
  page,
}) => {
  await openTouchGame(page, { mode: 'gathering' });
  const cell = await chestAhead(page, [
    [STONE, 20],
    [PLANKS, 6],
  ]);
  await page.locator('.touch-place').tap();
  await step(page, 1);
  await expect(page.locator('.chest-screen')).toBeVisible();
  expect(await screen(page)).toBe('chest');
  // The touch controls are covered while the screen is open.
  await expect(page.locator('.touch-hud')).toHaveClass(/covered/);

  await page.locator('.chest-slot[data-side="player"][data-item="stone"]').first().tap();
  await slot(page, 'chest', 8).tap();
  await whenIdle(page);
  expect((await getChest(page, cell.x, cell.y, cell.z))?.[8]).toEqual({ item: STONE, count: 20 });

  // Two taps on the planks within the window: to the chest's first free slot.
  const planks = page.locator('.chest-slot[data-side="player"][data-item="planks"]').first();
  await planks.tap();
  await planks.tap();
  await whenIdle(page);
  expect((await getChest(page, cell.x, cell.y, cell.z))?.[0]).toEqual({ item: PLANKS, count: 6 });
  expect((await inventory(page)).some((s) => s?.item === PLANKS)).toBe(false);

  await page.locator('.chest-close').tap();
  await expect(page.locator('.chest-screen')).toBeHidden();
  expect(await screen(page)).toBe('play');
  await expect(page.locator('.touch-hud')).not.toHaveClass(/covered/);
});

test('Phase 8B3a AC5.8: matches the chest-screen-touch reference', async ({ page }) => {
  await openTouchGame(page, { mode: 'gathering' });
  const cell = await chestAhead(page, [
    [STONE, 64],
    [PLANKS, 9],
  ]);
  await page.evaluate(
    (c) => window.__mc.submit({ kind: 'quickMove', ...c, slot: 0, fromChest: false, item: 3 }),
    cell,
  );
  await page.locator('.touch-place').tap();
  await step(page, 1);
  await whenIdle(page);
  expect(await screen(page)).toBe('chest');
  await expect(page).toHaveScreenshot('chest-screen-touch.png');
});

/** Opens a world as a player on the device does (no test mode), Adventure. */
async function openOnDevice(page: Page, view: { width: number; height: number }): Promise<void> {
  await page.setViewportSize(view);
  await page.addInitScript(
    ([key, value]) => window.localStorage.setItem(key, value),
    [STORAGE_KEY, JSON.stringify({ renderDistance: 2, mouseSensitivity: 1, fov: 75 })],
  );
  await withoutFullscreen(page);
  await page.goto('/?seed=1337&time=0.25');
  await page.waitForFunction(() => window.__mc !== undefined);
  await page.locator('.world-menu[data-ready]').waitFor();
  await page.locator('.world-mode-button[data-mode="gathering"]').tap();
  await page.locator('.world-create-button').tap();
  await page.waitForFunction(() => !window.__mc.getState().paused);
}

/** A chest at the player's feet two blocks ahead, filled a little, opened by the test API. */
async function openChestHere(page: Page): Promise<void> {
  // The world around the start must be there: the player stands on it.
  await page.waitForFunction(() => window.__mc.getState().player.onGround);
  const result = await page.evaluate((chest) => {
    const mc = window.__mc;
    const p = mc.getState().player;
    const cell = { x: Math.floor(p.x), y: Math.floor(p.y), z: Math.floor(p.z) - 2 };
    mc.setBlock(cell.x, cell.y, cell.z, chest);
    mc.give(3, 64);
    mc.give(7, 20);
    mc.give(5, 8);
    const answer = mc.submit({ kind: 'openChest', ...cell });
    return answer?.ok === true ? true : JSON.stringify(answer);
  }, CHEST);
  expect(result).toBe(true);
  await page.waitForFunction(() => window.__mc.getState().ui.screen === 'chest');
}

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

async function boxesOf(page: Page, selector: string): Promise<Box[]> {
  return page.evaluate((sel) => {
    const out: Box[] = [];
    for (const node of document.querySelectorAll<HTMLElement>(sel)) {
      const r = node.getBoundingClientRect();
      if (r.width > 0 && r.height > 0)
        out.push({ x: r.x, y: r.y, width: r.width, height: r.height });
    }
    return out;
  }, selector);
}

for (const view of [
  { width: 640, height: 360, slot: 38 },
  { width: 915, height: 412, slot: 38 },
  { width: 1280, height: 800, slot: 48 },
]) {
  test(`Phase 8B3a AC5.3: the chest screen fits ${view.width} × ${view.height} without scrolling; slots of ${view.slot} px`, async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await openOnDevice(page, view);
    await openChestHere(page);
    const slots = await boxesOf(page, '.chest-screen .chest-slot');
    // The chest's 27, the inventory's 27 and the bar.
    expect(slots).toHaveLength(63);
    const buttons = await boxesOf(page, '.chest-take-all, .chest-close');
    expect(buttons).toHaveLength(2);
    for (const box of [...slots, ...buttons]) {
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(view.width);
      expect(box.y + box.height).toBeLessThanOrEqual(view.height);
    }
    for (const box of slots) {
      expect(box.width).toBeGreaterThanOrEqual(36);
      expect(box.width).toBeCloseTo(view.slot, 0);
    }
    for (const box of buttons) expect(box.height).toBeGreaterThanOrEqual(36);
    const scrolls = await page
      .locator('.chest-screen')
      .evaluate((node) => node.scrollHeight > node.clientHeight);
    expect(scrolls).toBe(false);
    expect((await getState(page)).paused).toBe(false);
  });
}
