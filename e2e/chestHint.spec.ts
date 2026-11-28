// Phase 8 part B3b AC7.1: the hint under the crosshair on a chest says how to open it, by
// the input in use (mouse, touch, controller); it hides on another block and while breaking.
import type { Page } from '@playwright/test';
import { chestAhead } from './chests';
import { expect, test } from './fixtures';
import { DEG, openGame, setPlayer, step, whenIdle } from './game';
import { BUTTON, Pad, installFakePads } from './gamepad';
import { TOUCH_DEVICE, openTouchGame } from './touch';

const hint = '.hud .crosshair-hint';

async function lookAway(page: Page): Promise<void> {
  await setPlayer(page, { pitch: 20 * DEG });
  await step(page, 2);
  await whenIdle(page);
}

async function lookBack(page: Page): Promise<void> {
  await setPlayer(page, { pitch: -29 * DEG });
  await step(page, 2);
  await whenIdle(page);
}

test('Phase 8B3b AC7.1: mouse: "Right click: Open" on a chest, gone on another block and while breaking; reference', async ({
  page,
}) => {
  await openGame(page, { mode: 'gathering' });
  await chestAhead(page);
  await expect(page.locator(hint)).toBeVisible();
  await expect(page.locator(hint)).toHaveText('Right click: Open');
  await expect(page.locator(hint)).toHaveAttribute('data-input', 'mouse');
  // Under the crosshair, within a few pixels of the view's centre.
  const box = await page.locator(hint).boundingBox();
  if (!box) throw new Error('no hint');
  expect(Math.abs(box.x + box.width / 2 - 480)).toBeLessThanOrEqual(1);
  expect(box.y).toBeGreaterThan(270);
  expect(box.y).toBeLessThan(300);
  await page.locator('canvas.game-canvas').evaluate((node) => {
    (node as HTMLElement).style.visibility = 'hidden';
  });
  await whenIdle(page);
  await expect(page).toHaveScreenshot('chest-hint.png', {
    clip: { x: 380, y: 230, width: 200, height: 90 },
    maxDiffPixelRatio: 0.05,
  });
  await page.locator('canvas.game-canvas').evaluate((node) => {
    (node as HTMLElement).style.visibility = '';
  });

  // Another block (the sky above): no hint.
  await lookAway(page);
  await expect(page.locator(hint)).toBeHidden();
  await lookBack(page);
  await expect(page.locator(hint)).toBeVisible();

  // Holding break on the chest: the hint gives way to the break bar.
  await page.mouse.move(480, 270);
  await page.mouse.down();
  await step(page, 5);
  await whenIdle(page);
  await expect(page.locator('.break-bar')).toBeVisible();
  await expect(page.locator(hint)).toBeHidden();
  await page.mouse.up();
  await step(page, 2);
  await whenIdle(page);
  await expect(page.locator(hint)).toBeVisible();

  // Creative too.
  await openGame(page);
  await chestAhead(page);
  await expect(page.locator(hint)).toHaveText('Right click: Open');
});

test.describe('touch', () => {
  test.use(TOUCH_DEVICE);

  test('Phase 8B3b AC7.1: touch: "Place: Open", named after the button', async ({ page }) => {
    await openTouchGame(page, { mode: 'gathering' });
    await chestAhead(page);
    await expect(page.locator(hint)).toHaveText('Place: Open');
    await expect(page.locator(hint)).toHaveAttribute('data-input', 'touch');
    await expect(page.locator('.touch-place')).toHaveAttribute('aria-label', 'Place');
    await lookAway(page);
    await expect(page.locator(hint)).toBeHidden();
  });
});

test('Phase 8B3b AC7.1: controller: the LT glyph with "Open"; gone while breaking', async ({
  page,
}) => {
  await installFakePads(page);
  await openGame(page, { mode: 'gathering' });
  const pad = new Pad(page);
  await pad.connect();
  await chestAhead(page);
  // A press makes the pad the active input (the wake-up press of connect does not).
  await pad.tap(BUTTON.SELECT);
  await step(page, 1);
  await whenIdle(page);
  await expect(page.locator(hint)).toHaveAttribute('data-input', 'pad');
  await expect(page.locator(hint)).toHaveText('Open');
  await expect(page.locator(`${hint} canvas[data-glyph="LT"]`)).toBeVisible();
  // Holding the break trigger hides it.
  await pad.press(BUTTON.RT);
  await step(page, 5);
  await whenIdle(page);
  await expect(page.locator(hint)).toBeHidden();
  await pad.release(BUTTON.RT);
  await step(page, 2);
  await whenIdle(page);
  await expect(page.locator(hint)).toBeVisible();
  await lookAway(page);
  await expect(page.locator(hint)).toBeHidden();
});
