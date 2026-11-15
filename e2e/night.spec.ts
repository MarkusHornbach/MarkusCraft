// Phase 4 part B: the darker night, and torches at night and in a tunnel.
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import {
  DEG,
  createWorld,
  getState,
  openGame,
  openMenu,
  pauseWithMouse,
  setPlayer,
  step,
  surfaceY,
  whenIdle,
} from './game';
import { type Image, type Region, capture, meanLuminance } from './helpers';
import { SCENE_Y, TUNNEL_LENGTH, buildTunnel, lookIntoTunnel } from './lightScenes';
import { findSites } from './sites';

const TORCH = 19;
const MIDNIGHT = 0.75;

async function setTime(page: Page, time: number): Promise<void> {
  await page.evaluate(async (t) => {
    window.__mc.setTime(t);
    await window.__mc.whenIdle();
  }, time);
}

async function setSlider(page: Page, id: string, value: number): Promise<void> {
  await page.locator(`#${id}`).evaluate((node, v) => {
    const input = node as HTMLInputElement;
    input.value = String(v);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }, value);
}

test('Phase 4 AC8.2: open ground at midnight has 6–14 % of its noon brightness, at least 18 % with the slider at its top', async ({
  page,
}) => {
  test.setTimeout(180_000);
  await openMenu(page);
  await createWorld(page, { seed: '1337' });
  await pauseWithMouse(page);
  // The paused game, seen without the menu in front of it.
  await page.locator('.pause-screen').evaluate((node) => {
    (node as HTMLElement).style.visibility = 'hidden';
  });
  // Straight down onto open grass, 14 blocks above it.
  const { player } = await getState(page);
  const x = Math.floor(player.x);
  const z = Math.floor(player.z);
  await page.evaluate(
    async ([px, py, pz]) => {
      window.__mc.setPlayer({ x: px, y: py, z: pz, pitch: (-89 * Math.PI) / 180, mode: 'fly' });
      await window.__mc.whenIdle();
    },
    [x + 0.5, (await surfaceY(page, x, z)) + 15, z + 0.5],
  );
  const view: Region = { x: 0, y: 0, width: 960, height: 440 };
  const measure = async (time: number): Promise<number> => {
    await setTime(page, time);
    return meanLuminance(await capture(page), view);
  };
  const noon = await measure(0.25);
  const night = await measure(MIDNIGHT);
  expect((await getState(page)).settings.brightness).toBe(0.5);
  await setSlider(page, 'setting-brightness', 1);
  expect((await getState(page)).settings.brightness).toBe(1);
  const bright = await measure(MIDNIGHT);
  console.log(`noon ${noon} night ${night} bright ${bright}`);
  // Gamma-encoded pixel values, as the plan's numbers are meant.
  expect(night / noon).toBeGreaterThan(0.06);
  expect(night / noon).toBeLessThan(0.14);
  expect(bright / noon).toBeGreaterThanOrEqual(0.18);
  test.info().annotations.push({
    type: 'night',
    description: `noon ${noon.toFixed(1)}, midnight ${night.toFixed(1)} (${((100 * night) / noon).toFixed(1)} %), top ${bright.toFixed(1)} (${((100 * bright) / noon).toFixed(1)} %)`,
  });
});

/**
 * The largest brightness step between two neighbouring bands of four rows, along columns
 * of the region (in 0..255, gamma-encoded), taken as the median over the columns: a
 * line across the whole region, not a single bright pixel.
 */
function rowStep(image: Image, region: Region): number {
  const steps: number[] = [];
  for (let x = region.x; x < region.x + region.width; x += 8) {
    const rows: number[] = [];
    for (let y = region.y; y < region.y + region.height; y++) {
      rows.push(meanLuminance(image, { x, y, width: 8, height: 1 }));
    }
    let best = 0;
    for (let y = 4; y + 4 <= rows.length; y++) {
      const above = (rows[y - 4] + rows[y - 3] + rows[y - 2] + rows[y - 1]) / 4;
      const below = (rows[y] + rows[y + 1] + rows[y + 2] + rows[y + 3]) / 4;
      best = Math.max(best, Math.abs(above - below));
    }
    steps.push(best);
  }
  steps.sort((a, b) => a - b);
  return steps[Math.floor(steps.length / 2)];
}

test('Phase 4 AC8.3: at midnight the horizon and a tree against the sky stay visible', async ({
  page,
}) => {
  await openGame(page, { time: MIDNIGHT });
  // The pose of the `night` reference: high above the start point, looking south and up.
  const { player } = await getState(page);
  await setPlayer(page, { y: player.y + 30, yaw: 180 * DEG, pitch: -4 * DEG, mode: 'fly' });
  await whenIdle(page);
  const horizon = rowStep(await capture(page), { x: 0, y: 100, width: 960, height: 340 });
  expect(horizon).toBeGreaterThanOrEqual(0.02 * 255);

  // Under a tree, looking up past the trunk at the edge of its crown.
  await openGame(page, { time: MIDNIGHT });
  const { tree } = await findSites(page);
  await setPlayer(page, {
    x: tree.stand.x + 0.5 + (tree.stand.x - tree.log.x) * 2,
    y: tree.stand.y,
    z: tree.stand.z + 0.5 + (tree.stand.z - tree.log.z) * 2,
    yaw: tree.yaw,
    pitch: 35 * DEG,
    mode: 'walk',
  });
  await step(page, 2);
  await whenIdle(page);
  const crown = rowStep(await capture(page), { x: 160, y: 0, width: 640, height: 440 });
  expect(crown).toBeGreaterThanOrEqual(0.02 * 255);
  test.info().annotations.push({
    type: 'night',
    description: `horizon step ${horizon.toFixed(1)}, crown step ${crown.toFixed(1)}`,
  });
});

test('Phase 4 AC8.6: matches the torch-night reference (three torches on open ground at midnight)', async ({
  page,
}) => {
  await openGame(page, { time: MIDNIGHT });
  // A field of grass high in the air: open sky everywhere, no tree in the way.
  const { player } = await getState(page);
  const sx = Math.floor(player.x);
  const sz = Math.floor(player.z);
  const placed = await page.evaluate(
    ([x0, y0, z0, torch]) => {
      const mc = window.__mc;
      for (let z = z0 - 30; z <= z0 + 16; z++) {
        for (let x = x0 - 24; x <= x0 + 24; x++) mc.setBlock(x, y0, z, 1);
      }
      const cells: [number, number, number][] = [
        [x0, y0 + 1, z0 - 7],
        [x0 - 5, y0 + 1, z0 - 12],
        [x0 + 5, y0 + 1, z0 - 12],
      ];
      for (const [x, y, z] of cells) mc.setBlock(x, y, z, torch);
      return cells;
    },
    [sx, SCENE_Y, sz, TORCH],
  );
  // Back and up, so the whole lit area and the dark field around it are in view.
  await setPlayer(page, {
    x: sx + 0.5,
    y: SCENE_Y + 9,
    z: sz + 10.5,
    yaw: 0,
    pitch: -32 * DEG,
    mode: 'fly',
  });
  await step(page, 2);
  await whenIdle(page);
  for (const [x, y, z] of placed) {
    expect(await page.evaluate(([a, b, c]) => window.__mc.getLight(a, b, c), [x, y, z])).toEqual({
      sky: 15,
      block: 14,
    });
  }
  expect(await page.evaluate(() => window.__mc.verifyLight())).toBe(0);
  await expect(page).toHaveScreenshot('torch-night.png');
});

test('Phase 4 AC8.6: matches the torch-tunnel reference (one torch in the middle of the tunnel)', async ({
  page,
}) => {
  await openGame(page);
  const tunnel = await buildTunnel(page);
  const middle = TUNNEL_LENGTH / 2;
  const at = (i: number) => ({
    x: tunnel.mouth.x + tunnel.dir.x * i,
    y: tunnel.floorY + 1,
    z: tunnel.mouth.z + tunnel.dir.z * i,
  });
  await page.evaluate(([c, torch]) => window.__mc.setBlock(c.x, c.y, c.z, torch as number), [
    at(middle),
    TORCH,
  ] as const);
  await lookIntoTunnel(page, tunnel);
  const light = (i: number) => page.evaluate((c) => window.__mc.getLight(c.x, c.y, c.z), at(i));
  expect(await light(middle)).toEqual({ sky: 5, block: 14 });
  // The end of the tunnel, ten blocks away, still gets some of it.
  expect((await light(TUNNEL_LENGTH))?.block).toBe(4);
  expect(await page.evaluate(() => window.__mc.verifyLight())).toBe(0);
  await expect(page).toHaveScreenshot('torch-tunnel.png');
});
