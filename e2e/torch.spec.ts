// Phase 4 part B: the torch — crafting, placing, breaking, aiming, and its light on screen.
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import {
  DEG,
  PLATFORM_Y,
  getBlock,
  getState,
  give,
  inventory,
  openGame,
  setBlock,
  setPlayer,
  standOnPlatform,
  step,
  submit,
  whenIdle,
} from './game';
import { type Image, type Region, capture, meanColor, meanLuminance } from './helpers';

const AIR = 0;
const DIRT = 2;
const STONE = 3;
const SAND = 4;
const IRON_BLOCK = 18;
const TORCH = 19;
const COAL = 256;
const STICK = 257;
const MIDNIGHT = 0.75;

/** How many of an item the player has in all slots. */
async function have(page: Page, item: number): Promise<number> {
  return (await inventory(page)).reduce((sum, s) => sum + (s?.item === item ? s.count : 0), 0);
}

/** Puts a torch into bar slot 1 of a Creative world and selects it. */
async function holdTorch(page: Page): Promise<void> {
  expect(await submit(page, { kind: 'setBarSlot', slot: 0, item: TORCH })).toBe(true);
  expect(await submit(page, { kind: 'selectSlot', slot: 0 })).toBe(true);
}

test('Phase 4 AC6.10: craft torches, place one with a click, read its light, break it and the block under another', async ({
  page,
}) => {
  await openGame(page, { mode: 'gathering' });
  const { px, pz } = await standOnPlatform(page, DIRT);
  await setPlayer(page, { pitch: -50 * DEG });
  await give(page, STICK, 1);
  await give(page, COAL, 1);

  // Crafted through the recipe list: no station is needed.
  await page.keyboard.press('KeyE');
  await page.locator('.inventory-tab[data-tab="crafting"]').click();
  const row = page.locator('.recipe-row[data-recipe="torch"]');
  await expect(row.locator('.recipe-name')).toHaveText('Torch');
  await expect(row.locator('.recipe-result-count')).toHaveText('4');
  await row.locator('.recipe-craft').click();
  expect(await have(page, TORCH)).toBe(4);
  expect(await have(page, STICK)).toBe(0);
  expect(await have(page, COAL)).toBe(0);
  await page.keyboard.press('KeyE');
  await step(page, 2);

  // Placed with a real click on the ground ahead.
  const slot = (await inventory(page)).findIndex((s) => s?.item === TORCH);
  expect(slot).toBeGreaterThanOrEqual(0);
  expect(slot).toBeLessThan(9);
  await page.keyboard.press(`Digit${slot + 1}`);
  await page.mouse.click(480, 270, { button: 'right' });
  await step(page, 2);
  const cell = { x: px, y: PLATFORM_Y + 1, z: pz - 1 };
  expect(await getBlock(page, cell.x, cell.y, cell.z)).toBe(TORCH);
  expect(await have(page, TORCH)).toBe(3);
  await whenIdle(page);
  const light = (x: number, y: number, z: number) =>
    page.evaluate(([a, b, c]) => window.__mc.getLight(a, b, c), [x, y, z]);
  expect((await light(cell.x, cell.y, cell.z))?.block).toBe(14);
  expect((await light(cell.x + 1, cell.y, cell.z))?.block).toBe(13);
  expect((await light(cell.x, cell.y + 1, cell.z))?.block).toBe(13);

  // The crosshair is on the torch now; one click takes it, within two steps.
  expect((await getState(page)).target).toMatchObject({ ...cell, id: TORCH });
  await page.mouse.click(480, 270);
  await step(page, 2);
  expect(await getBlock(page, cell.x, cell.y, cell.z)).toBe(AIR);
  expect(await have(page, TORCH)).toBe(4);
  await expect(page.locator('.pickup-notice')).toHaveText('+1 Torch');
  expect((await light(cell.x, cell.y, cell.z))?.block).toBe(0);

  // A torch one block further: breaking the dirt under it takes the torch along.
  const far = { x: px, y: PLATFORM_Y + 1, z: pz - 2 };
  expect(await submit(page, { kind: 'place', ...far, slot })).toBe(true);
  // Steeply down, the crosshair reaches the dirt in front of the torch's aiming box.
  await setPlayer(page, { x: px + 0.5, z: pz + 0.5 - 1, pitch: -70 * DEG });
  await step(page, 2);
  expect((await getState(page)).target).toMatchObject({ x: px, y: PLATFORM_Y, z: pz - 2 });
  await page.mouse.move(480, 270);
  await page.mouse.down();
  await step(page, 40);
  await page.mouse.up();
  await step(page, 1);
  expect(await getBlock(page, px, PLATFORM_Y, pz - 2)).toBe(AIR);
  expect(await getBlock(page, far.x, far.y, far.z)).toBe(AIR);
  expect(await have(page, TORCH)).toBe(4);
  expect(await have(page, DIRT)).toBe(1);
  await expect(page.locator('.pickup-notice')).toHaveText('+1 Torch');
  await whenIdle(page);
  expect(await page.evaluate(() => window.__mc.verifyLight())).toBe(0);
});

test('Phase 4 AC6.3: a torch needs a block underneath; against a wall it goes in front of it', async ({
  page,
}) => {
  await openGame(page);
  const { px, pz } = await standOnPlatform(page, STONE);
  await holdTorch(page);
  for (let dy = 1; dy <= 3; dy++) await setBlock(page, px, PLATFORM_Y + dy, pz - 3, STONE);
  await step(page, 2);
  // Straight ahead at eye height: the face of the wall, with air under the cell in front.
  expect((await getState(page)).target).toMatchObject({
    x: px,
    y: PLATFORM_Y + 2,
    z: pz - 3,
    face: [0, 0, 1],
  });
  await page.mouse.click(480, 270, { button: 'right' });
  await step(page, 2);
  expect(await getBlock(page, px, PLATFORM_Y + 2, pz - 2)).toBe(AIR);
  await expect(page.locator('.hud-message')).toHaveText('Needs a block underneath');
  // With a block below that cell the same click places it.
  await setBlock(page, px, PLATFORM_Y + 1, pz - 2, STONE);
  await page.mouse.click(480, 270, { button: 'right' });
  await step(page, 2);
  expect(await getBlock(page, px, PLATFORM_Y + 2, pz - 2)).toBe(TORCH);
});

/** Bounding box of the outline: pixels much darker than the bright scene around it. */
function darkBox(image: Image, region: Region): { width: number; height: number } | null {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (let y = region.y; y < region.y + region.height; y++) {
    for (let x = region.x; x < region.x + region.width; x++) {
      const i = (y * image.width + x) * 4;
      const lum = 0.299 * image.data[i] + 0.587 * image.data[i + 1] + 0.114 * image.data[i + 2];
      if (lum >= 50) continue;
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y);
    }
  }
  return x1 < 0 ? null : { width: x1 - x0 + 1, height: y1 - y0 + 1 };
}

/** Projected size in pixels of a box seen from the eye, looking towards -Z at `pitch`. */
function projectedSize(
  eye: [number, number, number],
  min: [number, number, number],
  max: [number, number, number],
  pitch: number,
  fovDeg: number,
): { width: number; height: number } {
  const scale = 270 / Math.tan((fovDeg * DEG) / 2);
  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  for (const cx of [min[0], max[0]]) {
    for (const cy of [min[1], max[1]]) {
      for (const cz of [min[2], max[2]]) {
        const [dx, dy, dz] = [cx - eye[0], cy - eye[1], cz - eye[2]];
        const forward = dy * Math.sin(pitch) - dz * Math.cos(pitch);
        const up = dy * Math.cos(pitch) + dz * Math.sin(pitch);
        const sx = (dx / forward) * scale;
        const sy = (up / forward) * scale;
        x0 = Math.min(x0, sx);
        x1 = Math.max(x1, sx);
        y0 = Math.min(y0, sy);
        y1 = Math.max(y1, sy);
      }
    }
  }
  return { width: x1 - x0, height: y1 - y0 };
}

test('Phase 4 AC7.4: a torch between the player and a wall can be aimed at and aimed past', async ({
  page,
}) => {
  await openGame(page);
  const { px, pz } = await standOnPlatform(page, IRON_BLOCK);
  await page.evaluate(
    ([x0, y0, z0, id]) => {
      for (let dy = 0; dy < 5; dy++) {
        for (let dx = -4; dx <= 4; dx++) window.__mc.setBlock(x0 + dx, y0 + dy, z0, id);
      }
    },
    [px, PLATFORM_Y + 1, pz - 4, IRON_BLOCK],
  );
  await setBlock(page, px, PLATFORM_Y + 1, pz - 2, TORCH);
  const eye: [number, number, number] = [px + 0.5, PLATFORM_Y + 1 + 1.62, pz + 0.5];
  // Through the middle of the aiming box.
  const at = -Math.atan2(eye[1] - (PLATFORM_Y + 1 + 0.4), 2);
  await setPlayer(page, { pitch: at });
  await whenIdle(page);
  const state = await getState(page);
  expect(state.target).toMatchObject({ x: px, y: PLATFORM_Y + 1, z: pz - 2, id: TORCH });
  expect(state.target?.face).toEqual([0, 0, 1]);

  const image = await capture(page);
  const measured = darkBox(image, { x: 330, y: 120, width: 300, height: 300 });
  const inflate = 0.002;
  const expected = projectedSize(
    eye,
    [px + 5 / 16 - inflate, PLATFORM_Y + 1 - inflate, pz - 2 + 5 / 16 - inflate],
    [px + 11 / 16 + inflate, PLATFORM_Y + 1 + 14 / 16 + inflate, pz - 2 + 11 / 16 + inflate],
    at,
    state.render.fov,
  );
  expect(measured).not.toBeNull();
  expect(measured?.width ?? 0).toBeGreaterThan(expected.width * 0.8);
  expect(measured?.width ?? 0).toBeLessThan(expected.width * 1.2);
  expect(measured?.height ?? 0).toBeGreaterThan(expected.height * 0.8);
  expect(measured?.height ?? 0).toBeLessThan(expected.height * 1.2);

  // Just above the box the ray goes on to the wall behind.
  const past = -Math.atan2(eye[1] - (PLATFORM_Y + 1 + 0.98), 2);
  await setPlayer(page, { pitch: past });
  await step(page, 1);
  expect((await getState(page)).target).toMatchObject({ x: px, z: pz - 4, id: IRON_BLOCK });
  // Beside it the ray goes on to the floor behind it.
  await setPlayer(page, { pitch: at, yaw: 12 * DEG });
  await step(page, 1);
  expect((await getState(page)).target).toMatchObject({ y: PLATFORM_Y, z: pz - 3, id: IRON_BLOCK });
});

test('Phase 4 AC7.5: the palette shows the torch (18 blocks with the chest) and its painted icon; the bar counts torches in Gathering', async ({
  page,
}) => {
  await openGame(page);
  await page.keyboard.press('KeyE');
  await expect(page.locator('.palette-slot')).toHaveCount(18);
  const torch = page.locator('.palette-slot[data-item="torch"]');
  await expect(torch).toHaveCount(1);
  await torch.click();
  await expect(page.locator('.inv-slot[data-index="0"]')).toHaveAttribute('data-item', 'torch');
  // The icon is the painted one: a flame shows bright orange and yellow pixels.
  const flame = await torch.locator('canvas').evaluate((node) => {
    const canvas = node as HTMLCanvasElement;
    const data = canvas.getContext('2d')?.getImageData(0, 0, canvas.width, canvas.height).data;
    let count = 0;
    for (let i = 0; data && i < data.length; i += 4) {
      if (data[i + 3] > 0 && data[i] > 230 && data[i + 1] > 100 && data[i + 2] < 120) count++;
    }
    return count / (canvas.width * canvas.height);
  });
  expect(flame).toBeGreaterThan(0.03);

  await page.goto('about:blank');
  await openGame(page, { mode: 'gathering' });
  await give(page, TORCH, 7);
  await expect(page.locator('.hotbar-slot[data-item="torch"] .slot-count')).toHaveText('7');
  await expect(page.locator('.hotbar-slot[data-item="torch"] canvas')).toHaveCount(1);
  await page.keyboard.press('KeyE');
  await expect(page.locator('.inv-slot[data-item="torch"] .slot-count')).toHaveText('7');
});

/** The middle of the view, looking straight down from three blocks above a stone floor. */
const FLOOR_PATCH: Region = { x: 432, y: 240, width: 96, height: 60 };

async function floorPatch(page: Page, time: number, torch: boolean) {
  await openGame(page, { time });
  const { px, pz } = await standOnPlatform(page, STONE);
  await setPlayer(page, { mode: 'fly', y: PLATFORM_Y + 3.5, pitch: -89.9 * DEG });
  if (torch) await setBlock(page, px + 2, PLATFORM_Y + 1, pz, TORCH);
  await whenIdle(page);
  await page.evaluate(() => window.__mc.whenIdle());
  const image = await capture(page);
  return { lum: meanLuminance(image, FLOOR_PATCH), mean: meanColor(image, FLOOR_PATCH) };
}

test('Phase 4 AC7.6: at midnight the ground next to a torch is four times as bright and warm; by day it is unchanged', async ({
  page,
}) => {
  // Four game opens; on a CI runner with software WebGL this already took 50 s of the 60 s budget.
  test.slow();
  const dark = await floorPatch(page, MIDNIGHT, false);
  const lit = await floorPatch(page, MIDNIGHT, true);
  expect(lit.lum).toBeGreaterThan(4 * dark.lum);
  expect(lit.mean.r).toBeGreaterThan(1.25 * lit.mean.b);
  const day = await floorPatch(page, 0.25, false);
  const dayLit = await floorPatch(page, 0.25, true);
  expect(Math.abs(dayLit.lum - day.lum) / day.lum).toBeLessThan(0.05);
});

test('Phase 4 AC7.7: matches the torch-closeup reference (a torch from two blocks away, by day)', async ({
  page,
}) => {
  await openGame(page);
  const { px, pz } = await standOnPlatform(page, SAND);
  await setBlock(page, px, PLATFORM_Y + 1, pz - 2, TORCH);
  await setPlayer(page, { pitch: -28 * DEG });
  await whenIdle(page);
  await expect(page).toHaveScreenshot('torch-closeup.png');
});

test('Phase 4 AC7.8: a torch on a chunk corner updates its own chunk at once and the others within eight frames', async ({
  page,
}) => {
  await openGame(page);
  await setBlock(page, -1, 119, -1, STONE);
  await setPlayer(page, { x: 1.5, y: 120, z: 1.5, mode: 'fly' });
  await whenIdle(page);
  await holdTorch(page);
  const result = await page.evaluate(async () => {
    const mc = window.__mc;
    const answer = mc.submit({ kind: 'place', x: -1, y: 120, z: -1, slot: 0 });
    const queued = mc.getState().chunks.relight;
    let frames = 0;
    while (mc.getState().chunks.relight > 0 && frames < 20) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
      frames++;
    }
    await mc.whenIdle();
    return {
      ok: answer?.ok,
      queued,
      frames,
      wrong: mc.verifyLight(),
      light: mc.getLight(-1, 120, -1),
    };
  });
  expect(result.ok).toBe(true);
  // The torch's light reaches all four chunks; three of them wait for a later frame.
  expect(result.queued).toBe(3);
  expect(result.frames).toBeLessThanOrEqual(8);
  expect(result.wrong).toBe(0);
  expect(result.light).toEqual({ sky: 15, block: 14 });
});
