// Helpers to open the game in test mode and talk to its test API.
import type { Page } from '@playwright/test';
import type { GameState, PlayerPatch } from '../src/game/testApi';

export const SEED = 1337;

export interface OpenOptions {
  seed?: number;
  time?: number;
  freeze?: boolean;
  test?: boolean;
}

export function gameUrl(options: OpenOptions = {}): string {
  const query = new URLSearchParams();
  if (options.test ?? true) query.set('test', '1');
  query.set('seed', String(options.seed ?? SEED));
  query.set('time', String(options.time ?? 0.25));
  if (options.freeze ?? true) query.set('freeze', '1');
  return `/?${query.toString()}`;
}

/** Opens the game (test mode, fixed seed, noon, frozen clock by default) and waits until ready. */
export async function openGame(page: Page, options: OpenOptions = {}): Promise<void> {
  await page.goto(gameUrl(options));
  await page.waitForFunction(() => window.__mc !== undefined && window.__mc.isReady(), null, {
    timeout: 60_000,
  });
}

export function getState(page: Page): Promise<GameState> {
  return page.evaluate(() => window.__mc.getState());
}

/** Applies a player patch and waits until chunks are loaded and a frame was rendered. */
export async function setPlayer(page: Page, patch: PlayerPatch): Promise<void> {
  await page.evaluate(async (p) => {
    window.__mc.setPlayer(p);
    await window.__mc.whenIdle();
  }, patch);
}

export async function whenIdle(page: Page): Promise<void> {
  await page.evaluate(() => window.__mc.whenIdle());
}

export async function setBlock(page: Page, x: number, y: number, z: number, id: number) {
  await page.evaluate(
    async ([bx, by, bz, bid]) => {
      window.__mc.setBlock(bx, by, bz, bid);
      await window.__mc.whenIdle();
    },
    [x, y, z, id],
  );
}

export function getBlock(page: Page, x: number, y: number, z: number): Promise<number> {
  return page.evaluate(([bx, by, bz]) => window.__mc.getBlock(bx, by, bz), [x, y, z]);
}

export function surfaceY(page: Page, x: number, z: number): Promise<number> {
  return page.evaluate(([bx, bz]) => window.__mc.surfaceY(bx, bz), [x, z]);
}

/** Advances the simulation by exactly `n` fixed steps and renders. */
export async function step(page: Page, n: number): Promise<void> {
  await page.evaluate((count) => window.__mc.step(count), n);
}

export const DEG = Math.PI / 180;
