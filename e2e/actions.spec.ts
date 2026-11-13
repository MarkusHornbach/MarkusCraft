// The action layer wired into the game (Phase 3 step 2).
import { test, expect } from './fixtures';
import { PLATFORM_Y, getBlock, getState, openGame, standOnPlatform, step } from './game';

const AIR = 0;
const STONE = 3;
const BRICKS = 8;

function submit(page: import('@playwright/test').Page, action: unknown) {
  return page.evaluate((a) => window.__mc.submit(a), action);
}

test('actions submitted to the session change the world and the bar (Phase 3 AC2.5)', async ({
  page,
}) => {
  await openGame(page);
  const { px, pz } = await standOnPlatform(page);

  // Slots of actions count from 0; the bar and the keys count from 1.
  expect(await submit(page, { kind: 'selectSlot', slot: 7 })).toMatchObject({ ok: true });
  expect((await getState(page)).selectedSlot).toBe(8);
  await expect(page.locator('.hotbar-slot.selected')).toHaveAttribute('data-slot', '8');
  await expect(page.locator('.hotbar-label')).toHaveText('Bricks');

  const cell = { x: px + 1, y: PLATFORM_Y + 1, z: pz - 2 };
  expect(await submit(page, { kind: 'place', ...cell, slot: 7 })).toEqual({
    ok: true,
    blocks: [{ ...cell, id: BRICKS }],
    player: null,
    notices: [],
  });
  expect(await getBlock(page, cell.x, cell.y, cell.z)).toBe(BRICKS);
  expect(await submit(page, { kind: 'place', ...cell, slot: 2 })).toEqual({
    ok: false,
    reason: 'occupied',
  });
  expect(await submit(page, { kind: 'break', ...cell })).toMatchObject({ ok: true });
  expect(await getBlock(page, cell.x, cell.y, cell.z)).toBe(AIR);
});

test('refused and malformed actions change nothing (Phase 3 AC2.3)', async ({ page }) => {
  await openGame(page);
  const { px, pz } = await standOnPlatform(page);
  const before = await getState(page);

  // Too far away, into the player, outside the world, and not an action at all.
  expect(await submit(page, { kind: 'break', x: px, y: PLATFORM_Y, z: pz - 10 })).toEqual({
    ok: false,
    reason: 'reach',
  });
  expect(await submit(page, { kind: 'place', x: px, y: PLATFORM_Y + 1, z: pz, slot: 0 })).toEqual({
    ok: false,
    reason: 'occupied',
  });
  expect(await submit(page, { kind: 'break', x: px, y: -1, z: pz })).toEqual({
    ok: false,
    reason: 'invalid',
  });
  for (const junk of [null, 'break', { kind: 'selectSlot', slot: 9 }, { kind: 'break', x: 1.5 }]) {
    expect(await submit(page, junk)).toEqual({ ok: false, reason: 'invalid' });
  }
  expect(await getBlock(page, px, PLATFORM_Y, pz - 10)).toBe(STONE);
  expect(await getBlock(page, px, PLATFORM_Y + 1, pz)).toBe(AIR);
  await step(page, 1);
  expect((await getState(page)).selectedSlot).toBe(before.selectedSlot);
});
