// Helpers of the radar specs (Phase 8 part B1): its state, mining a vein through actions.
import type { Page } from '@playwright/test';
import type { GameState } from '../src/game/testApi';
import { getBlock, getState, give, setPlayer, step, submit } from './game';

export const COAL_ORE = 12;
export const IRON_PICKAXE = 265;
export const AIR = 0;

export type RadarState = NonNullable<GameState['radar']>;

export async function radarOf(page: Page): Promise<RadarState> {
  const radar = (await getState(page)).radar;
  if (!radar) throw new Error('no radar in this world');
  return radar;
}

/** The yaw that looks from the player straight at (dx, dz). */
export function yawTowards(dx: number, dz: number): number {
  return Math.atan2(-dx, -dz);
}

/** Every ore block of the kind connected (6 neighbours) to the cell: the vein around it. */
export async function veinAt(
  page: Page,
  start: [number, number, number],
  block = COAL_ORE,
): Promise<[number, number, number][]> {
  const seen = new Set<string>();
  const cells: [number, number, number][] = [];
  const queue: [number, number, number][] = [start];
  while (queue.length > 0) {
    const cell = queue.pop() as [number, number, number];
    const key = cell.join(',');
    if (seen.has(key)) continue;
    seen.add(key);
    if ((await getBlock(page, ...cell)) !== block) continue;
    cells.push(cell);
    const [x, y, z] = cell;
    queue.push(
      [x + 1, y, z],
      [x - 1, y, z],
      [x, y + 1, z],
      [x, y - 1, z],
      [x, y, z + 1],
      [x, y, z - 1],
    );
  }
  return cells;
}

/** Holds an iron pickaxe in the first bar slot (Adventure). */
export async function holdPickaxe(page: Page): Promise<void> {
  await page.evaluate(() => window.__mc.clearInventory());
  await give(page, IRON_PICKAXE, 1);
  expect1(await submit(page, { kind: 'selectSlot', slot: 0 }));
}

function expect1(result: true | string): void {
  if (result !== true) throw new Error(`refused: ${result}`);
}

/**
 * Breaks a cell through the action layer of an Adventure world: stands on it, starts the
 * break and finishes it once its time is up. Ends where it started.
 */
export async function mineCell(page: Page, [x, y, z]: [number, number, number]): Promise<void> {
  const { player } = await getState(page);
  await setPlayer(page, { x: x + 0.5, y: y + 1, z: z + 0.5 });
  expect1(await submit(page, { kind: 'startBreak', x, y, z }));
  await step(page, 40);
  expect1(await submit(page, { kind: 'break', x, y, z }));
  await setPlayer(page, {
    x: player.x,
    y: player.y,
    z: player.z,
    yaw: player.yaw,
    pitch: player.pitch,
  });
}

/**
 * Opens the game as a touch player at the page's viewport (no test mode, so the layout is
 * the device's): an Adventure world from the menu, task 8 done, the circle shown.
 */
export async function openTouchAdventure(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Object.defineProperty(Element.prototype, 'requestFullscreen', {
      configurable: true,
      value: undefined,
    });
    try {
      window.localStorage.setItem('markuscraft.settings.v1', JSON.stringify({ renderDistance: 2 }));
    } catch {
      // No storage: the defaults.
    }
  });
  await page.goto('/?seed=1337&time=0.25');
  await page.waitForFunction(() => window.__mc !== undefined);
  await page.locator('.world-menu[data-ready]').waitFor();
  await page.locator('.world-mode-button[data-mode="gathering"]').tap();
  await page.locator('.world-create-button').tap();
  await page.waitForFunction(() => !window.__mc.getState().paused);
  await page.evaluate(() => window.__mc.setProgress({ done: [1, 2, 3, 4, 5, 6, 7, 8] }));
  await page.waitForFunction(() => window.__mc.getState().radar?.shown === true);
}
