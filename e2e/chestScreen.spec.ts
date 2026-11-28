// Phase 8 part B3a2: the chest screen with the mouse: opening by right click, moving with
// clicks, quick moves with a double click, "Take all", closing (Esc, E, broken, out of
// reach) and Creative.
import { expect, test } from './fixtures';
import { chestAhead, chestSlot as slot, count, getChest, screen } from './chests';
import {
  DEG,
  clickCenter,
  give,
  standOnPlatform,
  getBlock,
  getState,
  inventory,
  openGame,
  setBlock,
  setPlayer,
  step,
  submit,
  whenIdle,
} from './game';

const AIR = 0;
const STONE = 3;
const PLANKS = 7;
const CHEST = 20;

test('Phase 8B3a AC5.1: right click opens a chest; clicks move, a double click quick moves, Take all empties; Esc and E close', async ({
  page,
}) => {
  await openGame(page, { mode: 'gathering' });
  const cell = await chestAhead(page, [
    [STONE, 40],
    [PLANKS, 12],
  ]);
  await clickCenter(page, 'right');
  await step(page, 1);
  await expect(page.locator('.chest-screen')).toBeVisible();
  expect((await getState(page)).ui).toMatchObject({ screen: 'chest', chest: cell });
  // The HUD is hidden and nothing was placed against the chest.
  await expect(page.locator('.hud .crosshair')).toBeHidden();
  expect(await getBlock(page, cell.x, cell.y, cell.z + 1)).toBe(AIR);
  await expect(slot(page, 'chest', 0)).toHaveAttribute('aria-label', 'Chest slot 1');

  // Stone from the bar into chest slot 5: pick, then place.
  const stoneSlot = page.locator('.chest-slot[data-side="player"][data-item="stone"]').first();
  await stoneSlot.click();
  await expect(stoneSlot).toHaveClass(/picked/);
  await slot(page, 'chest', 4).click();
  await whenIdle(page);
  expect((await getChest(page, cell.x, cell.y, cell.z))?.[4]).toEqual({ item: STONE, count: 40 });
  await expect(slot(page, 'chest', 4)).toHaveAttribute('aria-label', 'Chest slot 5: Stone');
  await expect(slot(page, 'chest', 4).locator('.slot-count')).toHaveText('40');
  expect(count(await inventory(page), STONE)).toBe(0);

  // And back into inventory slot 20.
  await slot(page, 'chest', 4).click();
  await slot(page, 'player', 19).click();
  await whenIdle(page);
  expect((await inventory(page))[19]).toEqual({ item: STONE, count: 40 });
  expect((await getChest(page, cell.x, cell.y, cell.z))?.[4]).toBeNull();

  // A double click moves a stack to the other side: the planks go into the chest's first slot.
  await page.locator('.chest-slot[data-side="player"][data-item="planks"]').first().dblclick();
  await whenIdle(page);
  expect((await getChest(page, cell.x, cell.y, cell.z))?.[0]).toEqual({ item: PLANKS, count: 12 });
  // Picking the same slot twice slowly puts it down again: no move.
  await slot(page, 'player', 19).click();
  await step(page, 30);
  await slot(page, 'player', 19).click();
  await whenIdle(page);
  await expect(slot(page, 'player', 19)).not.toHaveClass(/picked/);
  expect((await inventory(page))[19]).toEqual({ item: STONE, count: 40 });

  // Take all empties the chest into the inventory.
  await page.locator('.chest-take-all').click();
  await whenIdle(page);
  expect(await getChest(page, cell.x, cell.y, cell.z)).toEqual(new Array(27).fill(null));
  expect(count(await inventory(page), PLANKS)).toBe(12);

  await page.keyboard.press('Escape');
  await expect(page.locator('.chest-screen')).toBeHidden();
  expect(await screen(page)).toBe('play');
  await expect(page.locator('.hud .crosshair')).toBeVisible();
  await clickCenter(page, 'right');
  await step(page, 1);
  expect(await screen(page)).toBe('chest');
  // E closes the chest; it does not open the inventory.
  await page.keyboard.press('KeyE');
  expect(await screen(page)).toBe('play');

  // Right click on another block still places.
  await setPlayer(page, { yaw: 30 * DEG, pitch: -45 * DEG });
  await step(page, 2);
  await whenIdle(page);
  const before = count(await inventory(page), STONE);
  const stoneAt = (await inventory(page)).findIndex((s) => s?.item === STONE);
  if (stoneAt > 8) {
    // Into the bar, and selected, for the place.
    expect(await submit(page, { kind: 'moveStack', from: stoneAt, to: 1 })).toBe(true);
  }
  expect(await submit(page, { kind: 'selectSlot', slot: 1 })).toBe(true);
  await clickCenter(page, 'right');
  await step(page, 1);
  expect(await screen(page)).toBe('play');
  expect(count(await inventory(page), STONE)).toBe(before - 1);
  expect(await page.evaluate(() => window.__mc.verifyLight())).toBe(0);
});

test('Phase 8B3a AC5.5: the screen closes when the chest goes or the player is out of reach', async ({
  page,
}) => {
  await openGame(page, { mode: 'gathering' });
  const cell = await chestAhead(page, [[STONE, 5]]);
  await clickCenter(page, 'right');
  await step(page, 1);
  expect(await screen(page)).toBe('chest');
  // The player is carried away (a fall, a push): beyond reach the screen closes.
  const { player } = await getState(page);
  await setPlayer(page, { z: player.z + 6 });
  await step(page, 2);
  expect(await screen(page)).toBe('play');

  await setPlayer(page, { x: player.x, y: player.y, z: player.z, pitch: -29 * DEG });
  await step(page, 2);
  await whenIdle(page);
  await clickCenter(page, 'right');
  await step(page, 1);
  expect(await screen(page)).toBe('chest');
  // The chest is taken away (in a room: broken by another player).
  await setBlock(page, cell.x, cell.y, cell.z, AIR);
  await step(page, 2);
  expect(await screen(page)).toBe('play');
  await expect(page.locator('.chest-screen')).toBeHidden();
  expect(await page.evaluate(() => window.__mc.verifyLight())).toBe(0);
});

test('Phase 8B3a AC5.7: Creative shows the chest and the bar; moving works; a filled chest is not broken', async ({
  page,
}) => {
  await openGame(page);
  const cell = await chestAhead(page, [[STONE, 1]]);
  await clickCenter(page, 'right');
  await step(page, 1);
  expect(await screen(page)).toBe('chest');
  await expect(page.locator('.chest-inventory')).toBeHidden();
  await expect(page.locator('.chest-bar .chest-slot')).toHaveCount(9);
  const stone = page.locator('.chest-slot[data-side="player"][data-item="stone"]').first();
  await stone.click();
  await slot(page, 'chest', 0).click();
  await whenIdle(page);
  expect((await getChest(page, cell.x, cell.y, cell.z))?.[0]).toEqual({ item: STONE, count: 1 });
  await page.keyboard.press('Escape');
  // Creative breaks at once: a left click on the filled chest is refused with a text.
  await clickCenter(page, 'left');
  await step(page, 1);
  await expect(page.locator('.hud-message')).toHaveText('Empty the chest first');
  expect(await getBlock(page, cell.x, cell.y, cell.z)).toBe(CHEST);
});

test('Phase 8B3a AC5.8: matches the chest-screen reference (Adventure, mouse)', async ({
  page,
}) => {
  await openGame(page, { mode: 'gathering' });
  const cell = await chestAhead(page, [
    [STONE, 64],
    [PLANKS, 30],
    [5, 12],
    [256, 9],
  ]);
  for (const [from, to] of [
    [0, 0],
    [1, 4],
  ]) {
    await submit(page, {
      kind: 'chestMove',
      ...cell,
      from,
      fromChest: false,
      to,
      toChest: true,
      item: from === 0 ? STONE : PLANKS,
    });
  }
  await submit(page, { kind: 'moveStack', from: 2, to: 20 });
  await clickCenter(page, 'right');
  await step(page, 1);
  await whenIdle(page);
  expect(await screen(page)).toBe('chest');
  await slot(page, 'player', 3).click();
  await expect(slot(page, 'player', 3)).toHaveClass(/picked/);
  // Slots of 48 px on a screen higher than 480 px (AC5.3).
  const box = await slot(page, 'chest', 0).boundingBox();
  expect(box?.width).toBeCloseTo(48, 0);
  await expect(page).toHaveScreenshot('chest-screen.png');
});

test('Phase 8B3a AC6.5: from "task 20 of 21 done", real input: place the chest, open it, move 32 stone in; the task notice shows', async ({
  page,
}) => {
  await openGame(page, { mode: 'gathering', progress: 'fresh' });
  // Every task done but task 21: chapter 3 is open with it alone.
  await page.evaluate(() =>
    window.__mc.setProgress({ xp: 200, done: Array.from({ length: 20 }, (_, i) => i + 1) }),
  );
  expect((await getState(page)).progress).toMatchObject({ chapter: 3 });
  await standOnPlatform(page);
  await page.evaluate(() => window.__mc.clearInventory());
  await give(page, CHEST, 1);
  await give(page, STONE, 32);
  // Slot 1 holds the chest: look down at the platform ahead and right click.
  await page.keyboard.press('Digit1');
  await setPlayer(page, { pitch: -50 * DEG });
  await step(page, 2);
  await whenIdle(page);
  await clickCenter(page, 'right');
  await step(page, 1);
  expect(count(await inventory(page), CHEST)).toBe(0);
  // The crosshair is on the chest now: a right click opens it.
  await whenIdle(page);
  await clickCenter(page, 'right');
  await step(page, 1);
  expect(await screen(page)).toBe('chest');
  await page.locator('.chest-slot[data-side="player"][data-item="stone"]').first().click();
  await slot(page, 'chest', 0).click();
  await whenIdle(page);
  expect(count(await inventory(page), STONE)).toBe(0);
  await expect(page.locator('.progress-notice')).toHaveText(
    'Task done: Store 32 stone in a chest · +20 XP',
  );
  expect((await getState(page)).progress?.done).toContain(21);
});
