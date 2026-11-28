// Chest set-ups for the chest screen's specs (Phase 8 part B3a2).
import type { Page } from '@playwright/test';
import { expect } from './fixtures';
import {
  DEG,
  PLATFORM_Y,
  getState,
  give,
  setPlayer,
  standOnPlatform,
  step,
  submit,
  whenIdle,
} from './game';

const CHEST = 20;

export function getChest(page: Page, x: number, y: number, z: number) {
  return page.evaluate(([cx, cy, cz]) => window.__mc.getChest(cx, cy, cz), [x, y, z]);
}

export async function screen(page: Page): Promise<string> {
  return (await getState(page)).ui.screen;
}

/** A chest two blocks ahead on the platform, the crosshair on it. Returns its cell. */
export async function chestAhead(
  page: Page,
  stacks: [number, number][] = [],
): Promise<{ x: number; y: number; z: number }> {
  const { px, pz } = await standOnPlatform(page);
  await page.evaluate(() => window.__mc.clearInventory());
  await give(page, CHEST, 1);
  const cell = { x: px, y: PLATFORM_Y + 1, z: pz - 2 };
  expect(await submit(page, { kind: 'place', ...cell, slot: 0 })).toBe(true);
  for (const [item, count] of stacks) await give(page, item, count);
  // Eye at 112.62, the chest's centre 1.12 lower and 2 ahead.
  await setPlayer(page, { pitch: -29 * DEG });
  await step(page, 2);
  await whenIdle(page);
  return cell;
}

export function chestSlot(page: Page, side: 'chest' | 'player', index: number) {
  return page.locator(`.chest-slot[data-side="${side}"][data-index="${index}"]`);
}

export function count(
  slots: readonly ({ item: number; count: number } | null)[],
  item: number,
): number {
  return slots.reduce((n, s) => n + (s?.item === item ? s.count : 0), 0);
}

interface Cell {
  x: number;
  y: number;
  z: number;
}

/**
 * Stands in a cell (feet at its floor) with the crosshair on the centre of a chest cell
 * (Phase 8 part B3b: the loot chest of a generator 4 shaft).
 */
export async function faceCell(page: Page, stand: Cell, target: Cell): Promise<void> {
  const eye = { x: stand.x + 0.5, y: stand.y + 1.62, z: stand.z + 0.5 };
  const dx = target.x + 0.5 - eye.x;
  const dy = target.y + 0.5 - eye.y;
  const dz = target.z + 0.5 - eye.z;
  await setPlayer(page, {
    x: eye.x,
    y: stand.y,
    z: eye.z,
    yaw: Math.atan2(-dx, -dz),
    pitch: Math.atan2(dy, Math.hypot(dx, dz)),
  });
  await step(page, 2);
  await whenIdle(page);
}

/** The loot sites of the open generator 4 world; fails without a spawn shaft. */
export async function spawnLoot(page: Page): Promise<{ chest: Cell; stand: Cell }> {
  const sites = await page.evaluate(() => window.__mc.lootSites());
  if (!sites?.spawn) throw new Error('no spawn shaft chest');
  return sites.spawn;
}
