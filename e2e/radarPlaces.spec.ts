// Places on the radar (Phase 8 part B2b, AC6): shaft and cave symbols on the circle and the
// Map tab of generator 3 worlds; the map that fills the screen and the circle's size setting
// (the owner's finding after B1: both were too small).
import type { Page } from '@playwright/test';
import { test, expect } from './fixtures';
import {
  backToWorlds,
  createWorld,
  getState,
  openGame,
  openMenu,
  pauseWithMouse,
  step,
  untilPlaying,
  whenIdle,
} from './game';
import { openTouchAdventure, radarOf } from './radar';
import { TOUCH_DEVICE } from './touch';

const circle = '.radar-circle';
const PLACE = /^(shaft|cave)$/;

async function openMap(page: Page): Promise<void> {
  await page.keyboard.press('KeyE');
  await page.locator('.inventory-tab[data-tab="map"]').click();
  await expect.poll(async () => (await getState(page)).ui.tab).toBe('map');
  await step(page, 20);
}

async function legendOf(page: Page): Promise<string[]> {
  const map = (await getState(page)).map;
  if (!map) throw new Error('the Map tab is not open');
  return map.legend;
}

async function hideWorld(page: Page): Promise<void> {
  await page.locator('canvas.game-canvas').evaluate((node) => {
    (node as HTMLElement).style.visibility = 'hidden';
  });
  await whenIdle(page);
}

test('Phase 8B2b AC6.1 AC6.3: generator 3: the circle shows a shaft and a cave with hints; F3 counts them; reference', async ({
  page,
}) => {
  await openGame(page, { mode: 'gathering', gen: 3 });
  await step(page, 20);
  const radar = await radarOf(page);
  const places = radar.entries.filter((e) => PLACE.test(e.kind));
  expect(places.map((e) => e.kind).sort()).toEqual(['cave', 'shaft']);
  for (const e of places) {
    expect(e.screen).not.toBeNull();
    expect(Math.hypot(e.dx, e.dz)).toBeLessThanOrEqual(48);
  }
  // At most 2 per place kind on the circle.
  for (const kind of ['shaft', 'cave'])
    expect(radar.entries.filter((e) => e.kind === kind).length).toBeLessThanOrEqual(2);
  await page.keyboard.press('F3');
  await step(page, 1);
  await expect(page.locator('[data-debug="radar"]')).toHaveText(
    /^\d coal · \d iron · \d shaft · \d cave · scan \d+\.\d ms · draw \d+\.\d ms$/,
  );
  await page.keyboard.press('F3');
  await hideWorld(page);
  await expect(page.locator(circle)).toHaveScreenshot('radar-places.png', {
    maxDiffPixelRatio: 0.05,
  });
});

test('Phase 8B2b AC6.1: generator 2: no place on the circle', async ({ page }) => {
  await openGame(page, { mode: 'gathering', gen: 2 });
  await step(page, 20);
  const radar = await radarOf(page);
  expect(radar.entries.filter((e) => PLACE.test(e.kind))).toEqual([]);
  expect(radar.beyond.filter((b) => PLACE.test(b.kind))).toEqual([]);
  expect(radar.entries.some((e) => e.kind === 'coal')).toBe(true);
});

test('Phase 8B2b AC6.2: the legend has Shaft and Cave rows in generator 3 only; the map fills the panel', async ({
  page,
}) => {
  await openGame(page, { mode: 'gathering', gen: 3 });
  await openMap(page);
  const legend = await legendOf(page);
  expect(legend).toHaveLength(4);
  expect(legend[2]).toMatch(
    /^Shaft · (\d+ blocks? · (\d+ (below|above)|level|below|above|far)|none within 192)$/,
  );
  expect(legend[3]).toMatch(/^Cave · /);
  await expect(page.locator('.map-legend-row:visible .map-legend-text')).toHaveText(legend);
  const map = (await getState(page)).map;
  expect(map?.entries.filter((e) => e.kind === 'shaft').length).toBeLessThanOrEqual(4);
  // The square takes the panel's height below the header (test view 960 × 540).
  const panel = await page.locator('.inventory-panel').boundingBox();
  const canvas = await page.locator('.map-canvas').boundingBox();
  if (!panel || !canvas) throw new Error('missing');
  expect(canvas.width).toBe(canvas.height);
  expect(canvas.height).toBeGreaterThan(panel.height - 90);
  expect(canvas.height).toBeGreaterThan(400);

  for (const gen of [undefined, 2] as const) {
    await openGame(page, { mode: 'gathering', gen });
    await openMap(page);
    const rows = await legendOf(page);
    expect(rows.map((r) => r.split(' · ')[0])).toEqual(['Coal', 'Iron']);
    await expect(page.locator('.map-legend-row:visible')).toHaveCount(2);
  }
});

test('Phase 8B2b: "Radar circle size": Medium by default, Small and Large on the PC, survives a reload', async ({
  page,
}) => {
  await openMenu(page);
  expect((await getState(page)).settings.radarSize).toBe(1);
  await createWorld(page, { mode: 'gathering' });
  await page.evaluate(() => window.__mc.setProgress({ done: [1, 2, 3, 4, 5, 6, 7, 8] }));
  await page.waitForFunction(() => window.__mc.getState().radar?.shown === true);
  const width = page.viewportSize()?.width ?? 0;
  const edge = async () => (await page.locator(circle).boundingBox())?.width;
  expect(await edge()).toBe(168);
  for (const [value, name, px] of [
    ['0', 'Small', 112],
    ['2', 'Large', 224],
  ] as const) {
    await pauseWithMouse(page);
    const slider = page.locator('#setting-radar-size');
    await expect(page.locator('label[for="setting-radar-size"]')).toContainText(
      'Radar circle size',
    );
    await slider.fill(value);
    await expect(page.locator('#setting-radar-size + .setting-value')).toHaveText(name);
    await page.locator('.pause-screen .play-button:visible').click();
    await untilPlaying(page);
    await expect.poll(edge).toBe(px);
    const box = await page.locator(circle).boundingBox();
    expect(box).toEqual({ x: width - 12 - px, y: 12, width: px, height: px });
    // The canvas is drawn at its new size.
    expect(
      await page.locator(circle).evaluate((c) => (c as HTMLCanvasElement).width),
    ).toBeGreaterThanOrEqual(px);
  }
  await pauseWithMouse(page);
  await backToWorlds(page);
  await page.reload();
  await page.waitForFunction(() => window.__mc !== undefined);
  expect((await getState(page)).settings.radarSize).toBe(2);
});

test.describe('touch', () => {
  test.use(TOUCH_DEVICE);

  test('Phase 8B2b AC6.2 AC6.3: 640 × 360: four legend rows beside a full-height map, no scrolling; reference', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 640, height: 360 });
    // The menu makes a generator 3 world.
    await openTouchAdventure(page);
    await page.locator('.touch-bag').tap();
    await page.locator('.inventory-tab[data-tab="map"]').tap();
    await expect.poll(async () => (await getState(page)).ui.tab).toBe('map');
    await page.waitForFunction(() => (window.__mc.getState().map?.draws ?? 0) > 0);
    await expect.poll(async () => (await legendOf(page)).length).toBe(4);
    const legend = await legendOf(page);
    expect(legend[2]).toMatch(/^Shaft · /);
    expect(legend[3]).toMatch(/^Cave · /);
    const layout = await page.evaluate(() => {
      const box = (sel: string) => {
        const node = document.querySelector<HTMLElement>(sel);
        if (!node) throw new Error(sel);
        const r = node.getBoundingClientRect();
        return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
      };
      const screen = document.querySelector<HTMLElement>('.inventory-screen');
      const panel = document.querySelector<HTMLElement>('.inventory-panel');
      return {
        scrolls:
          (screen?.scrollHeight ?? 0) > (screen?.clientHeight ?? 0) + 1 ||
          (panel?.scrollHeight ?? 0) > (panel?.clientHeight ?? 0) + 1,
        canvas: box('.map-canvas'),
        legend: box('.map-legend'),
        rows: [...document.querySelectorAll<HTMLElement>('.map-legend-row')]
          .filter((r) => !r.hidden)
          .map((r) => r.getBoundingClientRect().bottom),
        buttons: [...document.querySelectorAll<HTMLElement>('.inventory-tab, .inventory-close')]
          .filter((b) => b.offsetParent !== null)
          .map((b) => {
            const r = b.getBoundingClientRect();
            return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
          }),
      };
    });
    expect(layout.scrolls).toBe(false);
    // The square map is as high as the screen allows (it was 288 px before).
    expect(layout.canvas.bottom - layout.canvas.top).toBeGreaterThanOrEqual(340);
    expect(layout.canvas.bottom).toBeLessThanOrEqual(360);
    // Legend rows and every header button lie on the screen, beside the map.
    for (const bottom of layout.rows) expect(bottom).toBeLessThanOrEqual(360);
    expect(layout.legend.left).toBeGreaterThanOrEqual(layout.canvas.right);
    expect(layout.buttons).toHaveLength(5);
    for (const b of layout.buttons) {
      expect(b.left).toBeGreaterThanOrEqual(layout.canvas.right);
      expect(b.right).toBeLessThanOrEqual(640);
      expect(b.bottom).toBeLessThanOrEqual(layout.legend.top + 1);
    }
    await hideWorld(page);
    await expect(page).toHaveScreenshot('map-tab-places.png', { maxDiffPixelRatio: 0.05 });
  });

  test('Phase 8B2b: on touch Large never covers a button: 640 × 360 fits the room, 1280 × 720 is 168 px', async ({
    page,
  }) => {
    for (const size of [
      { width: 640, height: 360 },
      { width: 1280, height: 720 },
    ]) {
      await page.setViewportSize(size);
      await openTouchAdventure(page, { renderDistance: 2, radarSize: 2 });
      const box = await page.locator(circle).boundingBox();
      if (!box) throw new Error('no circle');
      if (size.width === 1280) expect(box.width).toBe(168);
      else expect(box.width).toBeGreaterThanOrEqual(112);
      expect(box.height).toBe(box.width);
      const buttons = await page.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>('.touch-button')]
          .map((n) => n.getBoundingClientRect())
          .filter((r) => r.width > 0)
          .map((r) => ({ x: r.x, y: r.y, width: r.width, height: r.height })),
      );
      for (const b of buttons) {
        const overlap =
          box.x < b.x + b.width &&
          b.x < box.x + box.width &&
          box.y < b.y + b.height &&
          b.y < box.y + box.height;
        expect(overlap).toBe(false);
      }
    }
  });
});
