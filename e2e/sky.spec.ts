// Sky, day/night cycle and underwater view in the browser (plan step 10).
import type { Page } from '@playwright/test';
import { test, expect } from './fixtures';
import { DEG, getState, openGame, setPlayer, step, whenIdle } from './game';
import { capture, meanColor, meanLuminance, shareOf, type Region } from './helpers';

/** Flying 30 blocks above the spawn. */
async function overview(page: Page, yaw: number, pitch: number): Promise<void> {
  const { player } = await getState(page);
  await setPlayer(page, { y: player.y + 30, yaw, pitch, mode: 'fly' });
}

async function setTime(page: Page, time: number): Promise<void> {
  await page.evaluate(async (t) => {
    window.__mc.setTime(t);
    await window.__mc.whenIdle();
  }, time);
}

// The sun's arc is tilted 30° towards +Z: at noon it stands 60° high in the south.
const SOUTH = 180 * DEG;
const BODY_PITCH = 60 * DEG;

test('noon is at least twice as bright as midnight, which stays playable (AC10.3)', async ({
  page,
}) => {
  await openGame(page, { time: 0.25 });
  await overview(page, -90 * DEG, -30 * DEG);
  const noon = await capture(page);
  await setTime(page, 0.75);
  const midnight = await capture(page);
  expect(meanLuminance(noon)).toBeGreaterThanOrEqual(2 * meanLuminance(midnight));
  // Terrain fills the lower half of this view; it must remain distinguishable at night.
  const lowerHalf: Region = { x: 0, y: 270, width: 960, height: 270 };
  expect(meanLuminance(midnight, lowerHalf)).toBeGreaterThan(12);
  expect(shareOf(midnight, (r, g, b) => r + g + b > 60, lowerHalf)).toBeGreaterThan(0.2);
});

test('the sun is visible at noon and the moon at midnight (AC10.4)', async ({ page }) => {
  await openGame(page, { time: 0.25 });
  await overview(page, SOUTH, BODY_PITCH);
  const centre: Region = { x: 380, y: 170, width: 200, height: 200 };

  const day = await capture(page);
  // Bright, warm disc: nearly white with blue as the weakest channel.
  const warm = shareOf(day, (r, g, b) => r > 240 && g > 215 && b < r - 10, centre);
  expect(warm).toBeGreaterThan(0.015);
  expect(shareOf(day, (r, g, b) => r > 240 && g > 215 && b < r - 10)).toBeLessThan(0.1);

  await setTime(page, 0.75);
  const night = await capture(page);
  // Pale disc on a dark sky.
  const pale = shareOf(night, (r, g, b) => r > 150 && g > 150 && b > 160, centre);
  expect(pale).toBeGreaterThan(0.02);
  expect(meanLuminance(night)).toBeLessThan(40);
  // Stars: small bright points away from the moon.
  // Left part of the sky, above the selector bar.
  const corner: Region = { x: 0, y: 0, width: 300, height: 440 };
  const stars = shareOf(night, (r, g, b) => r > 120 && g > 120 && b > 120, corner);
  expect(stars * corner.width * corner.height).toBeGreaterThan(20);

  // No sun at midnight, no moon or stars at noon.
  expect(shareOf(night, (r, g, b) => r > 240 && g > 215 && b < r - 10, centre)).toBe(0);
  const dayStars = shareOf(day, (r, g, b) => r > 235 && g > 235 && b > 235, corner);
  expect(dayStars).toBe(0);
});

test('the sky is blue at noon and warm at the horizon at sunset', async ({ page }) => {
  await openGame(page, { time: 0.25 });
  await overview(page, 90 * DEG, 20 * DEG);
  const top: Region = { x: 0, y: 0, width: 960, height: 120 };
  const noon = meanColor(await capture(page), top);
  expect(noon.b).toBeGreaterThan(noon.r + 40);

  await setTime(page, 0.5);
  const image = await capture(page);
  const horizon = meanColor(image, { x: 0, y: 330, width: 960, height: 60 });
  expect(horizon.r).toBeGreaterThan(horizon.b + 60);
});

test('the clock advances with simulation steps unless frozen (AC10.2)', async ({ page }) => {
  await openGame(page, { time: 0.25, freeze: false });
  const before = (await getState(page)).time;
  await step(page, 720);
  // 720 steps = 12 s = 1 % of the 20-minute day.
  expect((await getState(page)).time).toBeCloseTo(before + 0.01, 6);

  await openGame(page, { time: 0.25, freeze: true });
  await step(page, 720);
  expect((await getState(page)).time).toBe(0.25);
});

test('under water the view is tinted blue and fog is short (5.4, AC10.5)', async ({ page }) => {
  await openGame(page);
  // A lake near the spawn of seed 1337: 5 blocks deep at this column.
  await setPlayer(page, {
    x: -15.5,
    y: 44.9,
    z: -10.5,
    yaw: -126 * DEG,
    pitch: 9 * DEG,
    mode: 'fly',
  });
  await expect(page.locator('.water-tint')).toHaveClass(/visible/);
  const colour = meanColor(await capture(page));
  expect(colour.b).toBeGreaterThan(colour.r + 30);
  expect(colour.b).toBeGreaterThan(colour.g + 15);
  await expect(page).toHaveScreenshot('underwater.png');

  // Back above the surface the tint is gone.
  await setPlayer(page, { y: 52 });
  await expect(page.locator('.water-tint')).not.toHaveClass(/visible/);
});

test('the player swims in the lake (AC8.7 in the real world)', async ({ page }) => {
  await openGame(page);
  await setPlayer(page, { x: -15.5, y: 46, z: -10.5, mode: 'walk' });
  await step(page, 30);
  let { player } = await getState(page);
  expect(player.inWater).toBe(true);
  expect(player.y).toBeLessThan(46);
  expect(player.y).toBeGreaterThan(44.5);
  await page.keyboard.down('Space');
  await step(page, 240);
  ({ player } = await getState(page));
  // Holding jump keeps the body bobbing at the surface (water blocks end at y = 49).
  expect(player.y + 0.9).toBeGreaterThan(48.5);
  expect(player.y + 0.9).toBeLessThan(49.7);
  await page.keyboard.up('Space');
});

test('matches the shore, sunset and night reference screenshots (AC10.5)', async ({ page }) => {
  await openGame(page, { time: 0.25 });
  await setPlayer(page, {
    x: -6.5,
    y: 54,
    z: -14.5,
    yaw: 146 * DEG,
    pitch: -11.5 * DEG,
    mode: 'fly',
  });
  const shore = await capture(page);
  // Water (blue), beach (light, yellowish) and trees/grass (green) are all in view.
  expect(shareOf(shore, (r, g, b) => b > r + 40 && b > g)).toBeGreaterThan(0.1);
  expect(shareOf(shore, (r, g, b) => r > 180 && g > 160 && b < g - 25 && b > 90)).toBeGreaterThan(
    0.02,
  );
  expect(shareOf(shore, (r, g, b) => g > r + 25 && g > b + 25)).toBeGreaterThan(0.1);
  await expect(page).toHaveScreenshot('shore.png');

  await openGame(page, { time: 0.5 });
  // Facing west, where the sun sets.
  await overview(page, 90 * DEG, -6 * DEG);
  await expect(page).toHaveScreenshot('sunset.png');

  await openGame(page, { time: 0.75 });
  await overview(page, SOUTH, 26 * DEG);
  await whenIdle(page);
  await expect(page).toHaveScreenshot('night.png');
});
