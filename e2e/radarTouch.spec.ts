// The radar circle on touch (Phase 8 part B1, AC3.2): below the bag button, clear of every
// button, and a look drag that starts on it turns the view.
import type { Page } from '@playwright/test';
import { test, expect } from './fixtures';
import { getState, step, whenIdle } from './game';
import { radarOf } from './radar';
import { TOUCH_DEVICE, centerOf, openTouchGame, swipe } from './touch';

test.use(TOUCH_DEVICE);

const circle = '.radar-circle';

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

function overlaps(a: Box, b: Box): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

async function visibleBoxes(page: Page, selector: string): Promise<Box[]> {
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

for (const size of [
  { width: 640, height: 360 },
  { width: 1280, height: 720 },
]) {
  test(`Phase 8B1 AC3.2 AC3.7: touch ${size.width} × ${size.height}: below the bag button, 88 px, over no button and not the tracker`, async ({
    page,
  }) => {
    await page.setViewportSize(size);
    await openTouchGame(page, { mode: 'gathering', terrain: 'balanced', trees: 'few' });
    await step(page, 20);
    await whenIdle(page);
    expect((await radarOf(page)).shown).toBe(true);
    const box = await page.locator(circle).boundingBox();
    const bag = await page.locator('.touch-bag').boundingBox();
    if (!box || !bag) throw new Error('circle or bag button missing');
    expect(box.width).toBe(88);
    expect(box.height).toBe(88);
    // Right edges aligned; the circle's top one gap (8 px) below the bag button.
    expect(box.x + box.width).toBeCloseTo(bag.x + bag.width, 0);
    expect(box.y).toBeCloseTo(bag.y + bag.height + 8, 0);
    for (const button of await visibleBoxes(page, '.touch-button'))
      expect(overlaps(box, button)).toBe(false);
    for (const tracker of await visibleBoxes(page, '.task-tracker'))
      expect(overlaps(box, tracker)).toBe(false);
    expect(box.y + box.height).toBeLessThanOrEqual(size.height);
    if (size.width === 640) {
      await page.locator('canvas.game-canvas').evaluate((node) => {
        (node as HTMLElement).style.visibility = 'hidden';
      });
      await whenIdle(page);
      await expect(page.locator(circle)).toHaveScreenshot('radar-circle-touch.png', {
        maxDiffPixelRatio: 0.05,
      });
    }
  });
}

test('Phase 8B1 AC3.2: a look drag that starts on the circle turns the view', async ({ page }) => {
  await openTouchGame(page, { mode: 'gathering' });
  await step(page, 20);
  await whenIdle(page);
  const before = (await getState(page)).player.yaw;
  const from = await centerOf(page, circle);
  await swipe(page, from, { x: from.x - 160, y: from.y + 20 }, 8);
  await whenIdle(page);
  expect((await getState(page)).player.yaw).not.toBeCloseTo(before, 2);
});
