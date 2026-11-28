// Phase 8 part B3a2: the chest screen with the controller (AC5.4): the place trigger opens
// it, the D-pad reaches every slot of both grids and "Take all", A/A moves, X quick moves,
// B puts a picked slot down or closes, Y closes; the pad-chest-screen reference.
import type { Page } from '@playwright/test';
import { chestAhead, getChest, screen } from './chests';
import { expect, test } from './fixtures';
import { getState, inventory, openGame, step, whenIdle } from './game';
import { BUTTON, Pad, focusOn, installFakePads } from './gamepad';

const STONE = 3;
const PLANKS = 7;

test.describe.configure({ timeout: 180_000 });

async function padChest(page: Page) {
  await installFakePads(page);
  await openGame(page, { mode: 'gathering' });
  const pad = new Pad(page);
  await pad.connect();
  const cell = await chestAhead(page, [
    [STONE, 30],
    [PLANKS, 5],
  ]);
  // The place trigger, as in play.
  await pad.tap(BUTTON.LT);
  await step(page, 1);
  await whenIdle(page);
  return { pad, cell };
}

async function focusOf(page: Page): Promise<string | null> {
  return (await getState(page)).ui.focus ?? null;
}

const chestSlot = (i: number) => `.chest-slot[data-side="chest"][data-index="${i}"]`;
const playerSlot = (i: number) => `.chest-slot[data-side="player"][data-index="${i}"]`;

test('Phase 8B3a AC5.4: the place trigger opens; the D-pad walks all 63 slots and Take all; A/A moves, X quick moves, B and Y', async ({
  page,
}) => {
  const { pad, cell } = await padChest(page);
  expect(await screen(page)).toBe('chest');
  // The focus starts on the chest's first slot; the hint bar names X.
  expect(await focusOf(page)).toBe('Chest slot 1');
  await expect(page.locator('.pad-hints')).toHaveText(/Move.*Quick move.*Close/);

  // A walk over every slot, in reading order: chest, inventory, bar; then "Take all".
  const walk = [
    ...Array.from({ length: 27 }, (_, i) => [chestSlot(i), `Chest slot ${i + 1}`]),
    ...Array.from({ length: 27 }, (_, i) => [playerSlot(i + 9), `Slot ${i + 10}`]),
    ...Array.from({ length: 9 }, (_, i) => [playerSlot(i), `Slot ${i + 1}`]),
  ];
  for (const [selector, label] of walk) {
    await focusOn(page, pad, selector);
    expect(await focusOf(page)).toMatch(new RegExp(`^${label}(:|$)`));
  }
  await focusOn(page, pad, '.chest-take-all');
  expect(await focusOf(page)).toBe('Take all');

  // A, A: the stone of bar slot 1 into chest slot 3.
  await focusOn(page, pad, playerSlot(0));
  expect(await focusOf(page)).toBe('Slot 1: Stone');
  await pad.tap(BUTTON.A);
  await expect(page.locator(playerSlot(0))).toHaveClass(/picked/);
  await focusOn(page, pad, chestSlot(2));
  await pad.tap(BUTTON.A);
  await whenIdle(page);
  expect((await getChest(page, cell.x, cell.y, cell.z))?.[2]).toEqual({ item: STONE, count: 30 });

  // X on the planks: to the chest's first free slot.
  await focusOn(page, pad, playerSlot(1));
  expect(await focusOf(page)).toBe('Slot 2: Planks');
  await pad.tap(BUTTON.X);
  await whenIdle(page);
  expect((await getChest(page, cell.x, cell.y, cell.z))?.[0]).toEqual({ item: PLANKS, count: 5 });
  expect((await inventory(page))[1]).toBeNull();

  // B puts a picked slot down; a second B closes.
  await focusOn(page, pad, chestSlot(2));
  await pad.tap(BUTTON.A);
  await expect(page.locator('.chest-slot.picked')).toHaveCount(1);
  await pad.tap(BUTTON.B);
  await expect(page.locator('.chest-slot.picked')).toHaveCount(0);
  expect(await screen(page)).toBe('chest');
  await pad.tap(BUTTON.B);
  expect(await screen(page)).toBe('play');

  // Opened again, Y closes.
  await pad.tap(BUTTON.LT);
  await step(page, 1);
  expect(await screen(page)).toBe('chest');
  await pad.tap(BUTTON.Y);
  expect(await screen(page)).toBe('play');
  expect(await page.evaluate(() => window.__mc.verifyLight())).toBe(0);
});

test('Phase 8B3a AC5.8: matches the pad-chest-screen reference', async ({ page }) => {
  const { pad } = await padChest(page);
  await focusOn(page, pad, playerSlot(0));
  await pad.tap(BUTTON.A);
  await focusOn(page, pad, chestSlot(4));
  await whenIdle(page);
  await expect(page).toHaveScreenshot('pad-chest-screen.png');
});
