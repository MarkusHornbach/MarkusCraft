// Phase 8 part B3a1: the chest through the test API (no screen yet): place, move, break,
// save and reload, the F3 row, Creative's "Empty the chest first".
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import {
  PLATFORM_Y,
  getBlock,
  getState,
  give,
  inventory,
  openGame,
  standOnPlatform,
  step,
  submit,
  whenIdle,
} from './game';

const AIR = 0;
const STONE = 3;
const PLANKS = 7;
const CHEST = 20;
/** 1.5 s at 60 steps per second, and a little more. */
const CHEST_STEPS = 95;

function getChest(page: Page, x: number, y: number, z: number) {
  return page.evaluate(([cx, cy, cz]) => window.__mc.getChest(cx, cy, cz), [x, y, z]);
}

test('Phase 8B3a AC4.1: an Adventure chest is placed, filled, saved, reloaded and broken', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await openGame(page, { mode: 'gathering', save: true, world: 'Chests' });
  const { px, pz } = await standOnPlatform(page);
  await give(page, CHEST, 1);
  await give(page, STONE, 64);
  await give(page, PLANKS, 10);
  const cell = { x: px, y: PLATFORM_Y + 1, z: pz - 2 };
  expect(await submit(page, { kind: 'place', ...cell, slot: 0 })).toBe(true);
  await whenIdle(page);
  expect(await getBlock(page, cell.x, cell.y, cell.z)).toBe(CHEST);
  expect(await getChest(page, cell.x, cell.y, cell.z)).toEqual(new Array(27).fill(null));

  const move = { kind: 'chestMove', ...cell, from: 1, fromChest: false, to: 4, toChest: true };
  expect(await submit(page, { ...move, item: STONE })).toBe(true);
  expect(
    await submit(page, { kind: 'quickMove', ...cell, slot: 2, fromChest: false, item: PLANKS }),
  ).toBe(true);
  // A stale item is refused: the slot is empty now.
  expect(await submit(page, { ...move, item: STONE })).toBe('missing');
  const filled = await getChest(page, cell.x, cell.y, cell.z);
  expect(filled?.slice(0, 5)).toEqual([
    { item: PLANKS, count: 10 },
    null,
    null,
    null,
    { item: STONE, count: 64 },
  ]);
  expect((await getState(page)).world?.chests).toBe(1);

  // The F3 row: one chest with items and the size of the states.
  await page.keyboard.press('F3');
  await whenIdle(page);
  await expect(page.locator('[data-debug="chests"]')).toHaveText(/^1 chest · \d+ B$/);

  await page.evaluate(() => window.__mc.save());
  await page.reload();
  await page.waitForFunction(() => window.__mc !== undefined && window.__mc.isReady());
  await whenIdle(page);
  expect(await getChest(page, cell.x, cell.y, cell.z)).toEqual(filled);
  expect((await getState(page)).world?.chests).toBe(1);

  // Breaking it brings the chest and its contents back into the inventory.
  expect(await submit(page, { kind: 'startBreak', ...cell })).toBe(true);
  await step(page, CHEST_STEPS);
  expect(await submit(page, { kind: 'break', ...cell })).toBe(true);
  await whenIdle(page);
  expect(await getBlock(page, cell.x, cell.y, cell.z)).toBe(AIR);
  expect(await getChest(page, cell.x, cell.y, cell.z)).toBeNull();
  const slots = await inventory(page);
  const count = (item: number) => slots.reduce((n, s) => n + (s?.item === item ? s.count : 0), 0);
  expect([count(CHEST), count(STONE), count(PLANKS)]).toEqual([1, 64, 10]);
  expect((await getState(page)).world?.chests).toBe(0);
  expect(await page.evaluate(() => window.__mc.verifyLight())).toBe(0);
});

test('Phase 8B3a AC2.3: Creative refuses to break a filled chest and says why', async ({
  page,
}) => {
  await openGame(page);
  const { px, pz } = await standOnPlatform(page);
  await page.evaluate(() => window.__mc.clearInventory());
  await give(page, CHEST, 1);
  await give(page, STONE, 1);
  const cell = { x: px, y: PLATFORM_Y + 1, z: pz - 2 };
  expect(await submit(page, { kind: 'place', ...cell, slot: 0 })).toBe(true);
  expect(
    await submit(page, {
      kind: 'chestMove',
      ...cell,
      from: 1,
      fromChest: false,
      to: 0,
      toChest: true,
      item: STONE,
    }),
  ).toBe(true);
  // Creative player slots are the bar: slot 9 is no slot here.
  expect(
    await submit(page, {
      kind: 'chestMove',
      ...cell,
      from: 0,
      fromChest: true,
      to: 9,
      toChest: false,
      item: STONE,
    }),
  ).toBe('invalid');
  expect(await submit(page, { kind: 'break', ...cell })).toBe('notEmpty');
  await step(page, 1);
  await expect(page.locator('.hud-message')).toHaveText('Empty the chest first');
  expect(await getBlock(page, cell.x, cell.y, cell.z)).toBe(CHEST);
  expect(await submit(page, { kind: 'takeAll', ...cell })).toBe(true);
  expect(await submit(page, { kind: 'break', ...cell })).toBe(true);
  await whenIdle(page);
  expect(await getBlock(page, cell.x, cell.y, cell.z)).toBe(AIR);
  expect(await page.evaluate(() => window.__mc.verifyLight())).toBe(0);
});

test('Phase 8B3a AC5.8: the chest block in the world matches the chest-block reference', async ({
  page,
}) => {
  await openGame(page);
  const { px, pz } = await standOnPlatform(page);
  // Three chests in a row and one on top, seen from above at an angle: sides and lid.
  await page.evaluate(
    async ([x0, y0, z0, id]) => {
      for (let dx = -1; dx <= 1; dx++) window.__mc.setBlock(x0 + dx, y0, z0, id);
      window.__mc.setBlock(x0, y0 + 1, z0, id);
      await window.__mc.whenIdle();
    },
    [px, PLATFORM_Y + 1, pz - 3, CHEST],
  );
  await page.evaluate((p) => window.__mc.setPlayer(p), {
    x: px + 1.8,
    y: PLATFORM_Y + 1.5,
    z: pz + 0.2,
    yaw: 0.35,
    pitch: -0.35,
  });
  await step(page, 2);
  await whenIdle(page);
  await expect(page).toHaveScreenshot('chest-block.png');
  expect(await page.evaluate(() => window.__mc.verifyLight())).toBe(0);
});
