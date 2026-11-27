// The Map tab (Phase 8 part B1, AC4): the fourth tab, locked text, terrain, veins, legend.
import type { Page } from '@playwright/test';
import { test, expect } from './fixtures';
import { getState, openGame, setPlayer, step, whenIdle } from './game';
import { holdPickaxe, mineCell, openTouchAdventure, veinAt } from './radar';
import { TOUCH_DEVICE } from './touch';

const ADVENTURE = { mode: 'gathering', terrain: 'balanced', trees: 'few' } as const;

async function mapOf(page: Page) {
  const map = (await getState(page)).map;
  if (!map) throw new Error('the Map tab is not open');
  return map;
}

async function openMap(page: Page): Promise<void> {
  await page.keyboard.press('KeyE');
  await page.locator('.inventory-tab[data-tab="map"]').click();
  await expect.poll(async () => (await getState(page)).ui.tab).toBe('map');
  await step(page, 20);
}

/** Free room in the inventory header: its width minus what its parts need. */
function headerSlack(page: Page): Promise<number> {
  return page.evaluate(() => {
    const header = document.querySelector<HTMLElement>('.inventory-header');
    if (!header) return -1;
    const parts = [...header.children] as HTMLElement[];
    const gap = parseFloat(getComputedStyle(header).columnGap) || 0;
    const tabs = header.querySelector<HTMLElement>('.inventory-tabs');
    const tabGap = tabs ? parseFloat(getComputedStyle(tabs).columnGap) || 0 : 0;
    let needed = gap * (parts.length - 1);
    for (const part of parts) {
      if (part === tabs) {
        const list = [...part.children] as HTMLElement[];
        needed +=
          list.reduce((n, t) => n + t.getBoundingClientRect().width, 0) +
          tabGap * (list.length - 1);
      } else {
        needed += part.getBoundingClientRect().width;
      }
    }
    return header.getBoundingClientRect().width - needed;
  });
}

/** The world behind is hidden for the references (the panel is translucent). */
async function hideWorld(page: Page): Promise<void> {
  await page.locator('canvas.game-canvas').evaluate((node) => {
    (node as HTMLElement).style.visibility = 'hidden';
  });
  await whenIdle(page);
}

test('Phase 8B1 AC4.1 AC4.3 AC4.5: four tabs; the map with legend; it reopens on Map; reference', async ({
  page,
}) => {
  await openGame(page, ADVENTURE);
  await step(page, 20);
  await page.keyboard.press('KeyE');
  await expect(page.locator('.inventory-tab')).toHaveText(['Items', 'Crafting', 'Tasks', 'Map']);
  expect((await getState(page)).map).toBeUndefined();
  await page.locator('.inventory-tab[data-tab="map"]').click();
  await step(page, 20);
  const map = await mapOf(page);
  expect(map.locked).toBe(false);
  expect(map.draws).toBeGreaterThan(0);
  await expect(page.locator('.map-canvas')).toBeVisible();
  expect(map.legend).toHaveLength(2);
  expect(map.legend[0]).toMatch(/^Coal · \d+ blocks? · (\d+ (below|above)|level|below|above|far)$/);
  expect(map.legend[1]).toMatch(/^Iron · /);
  await expect(page.locator('.map-legend-text')).toHaveText(map.legend);
  for (const kind of ['coal', 'iron']) {
    const n = map.entries.filter((e) => e.kind === kind).length;
    expect(n).toBeGreaterThan(0);
    expect(n).toBeLessThanOrEqual(8);
  }
  // Nothing in it takes the focus.
  expect(await page.locator('.map-tab button, .map-tab [data-pad-focus]').count()).toBe(0);
  // The canvas and the legend lie inside the panel.
  const panel = await page.locator('.inventory-panel').boundingBox();
  for (const part of ['.map-canvas', '.map-legend']) {
    const box = await page.locator(part).boundingBox();
    if (!panel || !box) throw new Error('missing');
    expect(box.y + box.height).toBeLessThanOrEqual(panel.y + panel.height);
    expect(box.x + box.width).toBeLessThanOrEqual(panel.x + panel.width);
  }
  // The header with four tabs leaves room for slightly wider fonts (CI's): the panel is as
  // wide as the items page.
  expect(await headerSlack(page)).toBeGreaterThanOrEqual(24);
  await hideWorld(page);
  await expect(page.locator('.inventory-panel')).toHaveScreenshot('map-tab.png', {
    maxDiffPixelRatio: 0.05,
  });
  // Moving while it is open changes the legend's distance.
  const before = map.legend[0];
  const { player } = await getState(page);
  await setPlayer(page, { x: player.x + 30, y: player.y + 10, z: player.z + 30 });
  await step(page, 40);
  expect((await mapOf(page)).legend[0]).not.toBe(before);
  // It reopens on Map.
  await page.keyboard.press('KeyE');
  await step(page, 2);
  expect((await getState(page)).map).toBeUndefined();
  await page.keyboard.press('KeyE');
  expect((await getState(page)).ui.tab).toBe('map');
});

test('Phase 8B1 AC4.1: Creative has no Map tab', async ({ page }) => {
  await openGame(page);
  await page.keyboard.press('KeyE');
  await expect(page.locator('.inventory-tab[data-tab="map"]')).toBeHidden();
  expect((await getState(page)).map).toBeUndefined();
});

test('Phase 8B1 AC4.2: locked with progress=fresh: the lock text, no canvas', async ({ page }) => {
  await openGame(page, { mode: 'gathering', progress: 'fresh' });
  await openMap(page);
  expect(await mapOf(page)).toMatchObject({ locked: true, entries: [], legend: [] });
  await expect(page.locator('.map-locked')).toContainText('Map · Locked');
  await expect(page.locator('.map-locked')).toContainText('Task: Climb to height 64');
  await expect(page.locator('.map-canvas')).toBeHidden();
});

test('Phase 8B1 AC4.4: mining every cell of the nearest coal vein moves the nearest coal entry to another vein', async ({
  page,
}) => {
  await openGame(page, ADVENTURE);
  await openMap(page);
  const first = (await mapOf(page)).entries.find((e) => e.kind === 'coal');
  if (!first) throw new Error('no coal on the map');
  const { player } = await getState(page);
  const feet: [number, number, number] = [
    Math.floor(player.x),
    Math.floor(player.y),
    Math.floor(player.z),
  ];
  const vein = await veinAt(page, [feet[0] + first.dx, feet[1] + first.dy, feet[2] + first.dz]);
  expect(vein.length).toBeGreaterThan(0);
  await holdPickaxe(page);
  for (const cell of vein) await mineCell(page, cell);
  await step(page, 20);
  const next = (await mapOf(page)).entries.find((e) => e.kind === 'coal');
  const mined = new Set(vein.map((c) => c.join(',')));
  expect(next).toBeDefined();
  expect(
    mined.has(
      [feet[0] + (next?.dx ?? 0), feet[1] + (next?.dy ?? 0), feet[2] + (next?.dz ?? 0)].join(','),
    ),
  ).toBe(false);
  expect(await page.evaluate(() => window.__mc.verifyLight())).toBe(0);
});

test.describe('touch', () => {
  test.use(TOUCH_DEVICE);

  test('Phase 8B1 AC4.1 AC4.5: a tap reaches Map; it fits 640 × 360 without scrolling; reference', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 640, height: 360 });
    await openTouchAdventure(page);
    await page.locator('.touch-bag').tap();
    await page.locator('.inventory-tab[data-tab="map"]').tap();
    await expect.poll(async () => (await getState(page)).ui.tab).toBe('map');
    await page.waitForFunction(() => (window.__mc.getState().map?.draws ?? 0) > 0);
    expect((await mapOf(page)).locked).toBe(false);
    const fits = await page.evaluate(() => {
      const panel = document.querySelector<HTMLElement>('.inventory-panel');
      const screen = document.querySelector<HTMLElement>('.inventory-screen');
      if (!panel || !screen) return false;
      const box = panel.getBoundingClientRect();
      return (
        panel.scrollHeight <= panel.clientHeight + 1 &&
        screen.scrollHeight <= screen.clientHeight + 1 &&
        box.bottom <= window.innerHeight &&
        box.right <= window.innerWidth
      );
    });
    expect(fits).toBe(true);
    const panel = await page.locator('.inventory-panel').boundingBox();
    for (const part of ['.map-canvas', '.map-legend']) {
      const box = await page.locator(part).boundingBox();
      if (!panel || !box) throw new Error('missing');
      expect(box.y + box.height).toBeLessThanOrEqual(panel.y + panel.height + 0.5);
      expect(box.x + box.width).toBeLessThanOrEqual(panel.x + panel.width + 0.5);
    }
    expect(await headerSlack(page)).toBeGreaterThanOrEqual(24);
    await page.locator('canvas.game-canvas').evaluate((node) => {
      (node as HTMLElement).style.visibility = 'hidden';
    });
    await whenIdle(page);
    await expect(page.locator('.inventory-panel')).toHaveScreenshot('map-tab-touch.png', {
      maxDiffPixelRatio: 0.05,
    });
  });
});
