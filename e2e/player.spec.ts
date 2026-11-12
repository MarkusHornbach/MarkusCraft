// Player movement and controls in the browser (plan step 8).
import type { Page } from '@playwright/test';
import { test, expect } from './fixtures';
import {
  DEG,
  PLATFORM_Y,
  standOnPlatform as buildPlatform,
  getState,
  openGame,
  setPlayer,
  step,
  surfaceY,
  whenIdle,
} from './game';

/** Puts the player on a stone runway and returns the start position. */
async function standOnPlatform(page: Page): Promise<{ x: number; z: number }> {
  const { px, pz } = await buildPlatform(page);
  const state = await getState(page);
  expect(state.player.onGround).toBe(true);
  expect(state.player.y).toBe(PLATFORM_Y + 1);
  return { x: px + 0.5, z: pz + 0.5 };
}

test('W moves the player along the facing direction (AC8.9)', async ({ page }) => {
  await openGame(page);
  const start = await standOnPlatform(page);

  await page.keyboard.down('KeyW');
  await step(page, 60);
  await page.keyboard.up('KeyW');
  let { player } = await getState(page);
  // One second of walking at 4.3 blocks/s (minus the short acceleration), towards -Z.
  expect(start.z - player.z).toBeGreaterThan(3.8);
  expect(start.z - player.z).toBeLessThan(4.4);
  expect(player.x).toBeCloseTo(start.x, 5);

  // Released: the player stops.
  await step(page, 30);
  const stopped = (await getState(page)).player.z;
  await step(page, 30);
  expect((await getState(page)).player.z).toBe(stopped);

  // Turn right by 90° and strafe left: that is -Z again.
  await setPlayer(page, { yaw: -90 * DEG });
  await page.keyboard.down('KeyD');
  await step(page, 30);
  await page.keyboard.up('KeyD');
  ({ player } = await getState(page));
  expect(player.z).toBeGreaterThan(stopped + 1.5);

  // Sprinting is faster than walking.
  await setPlayer(page, { x: start.x, z: start.z, yaw: 0 });
  await page.keyboard.down('ShiftLeft');
  await page.keyboard.down('KeyW');
  await step(page, 60);
  await page.keyboard.up('KeyW');
  await page.keyboard.up('ShiftLeft');
  ({ player } = await getState(page));
  expect(start.z - player.z).toBeGreaterThan(5.0);
});

test('Space jumps and the player returns to the ground (AC8.9)', async ({ page }) => {
  await openGame(page);
  await standOnPlatform(page);
  await page.keyboard.down('Space');
  await step(page, 12);
  await page.keyboard.up('Space');
  let { player } = await getState(page);
  expect(player.y).toBeGreaterThan(PLATFORM_Y + 1.5);
  expect(player.onGround).toBe(false);
  await step(page, 60);
  ({ player } = await getState(page));
  expect(player.y).toBe(PLATFORM_Y + 1);
  expect(player.onGround).toBe(true);
});

test('F toggles fly mode; Space and C move vertically while flying (AC8.9)', async ({ page }) => {
  await openGame(page);
  await standOnPlatform(page);
  await page.keyboard.press('KeyF');
  expect((await getState(page)).player.mode).toBe('fly');

  await page.keyboard.down('Space');
  await step(page, 60);
  await page.keyboard.up('Space');
  await step(page, 30);
  const high = (await getState(page)).player.y;
  expect(high).toBeGreaterThan(PLATFORM_Y + 6);
  // No gravity while flying.
  await step(page, 60);
  expect((await getState(page)).player.y).toBe(high);

  await page.keyboard.down('KeyC');
  await step(page, 30);
  await page.keyboard.up('KeyC');
  expect((await getState(page)).player.y).toBeLessThan(high - 2);

  await page.keyboard.press('KeyF');
  expect((await getState(page)).player.mode).toBe('walk');
  await step(page, 120);
  const { player } = await getState(page);
  expect(player.y).toBe(PLATFORM_Y + 1);
  expect(player.onGround).toBe(true);
});

test('look() turns the view and clamps the pitch to ±89° (AC8.9)', async ({ page }) => {
  await openGame(page);
  await setPlayer(page, { yaw: 0, pitch: 0 });
  await page.evaluate(() => window.__mc.look(100, 0));
  let { player } = await getState(page);
  // Mouse to the right turns right: yaw decreases.
  expect(player.yaw).toBeCloseTo(-0.25, 5);
  expect(player.pitch).toBe(0);

  await page.evaluate(() => window.__mc.look(0, -40));
  ({ player } = await getState(page));
  expect(player.pitch).toBeCloseTo(0.1, 5);

  await page.evaluate(() => window.__mc.look(0, -100000));
  ({ player } = await getState(page));
  expect(player.pitch).toBeCloseTo(89 * DEG, 6);
  await page.evaluate(() => window.__mc.look(0, 100000));
  ({ player } = await getState(page));
  expect(player.pitch).toBeCloseTo(-89 * DEG, 6);
});

test('the player does not fall through terrain that is not loaded yet (AC8.10)', async ({
  page,
}) => {
  await openGame(page);
  const { player } = await getState(page);
  const x = Math.floor(player.x) + 2000.5;
  const z = Math.floor(player.z) + 0.5;
  // Teleport far away and simulate two seconds before any chunk there exists.
  const during = await page.evaluate(
    ([px, pz]) => {
      window.__mc.setPlayer({ x: px, y: 60.5, z: pz, mode: 'walk' });
      const pending = window.__mc.getState().chunks.pending;
      window.__mc.step(120);
      return { pending, y: window.__mc.getState().player.y };
    },
    [x, z],
  );
  expect(during.pending).toBe(81);
  // Unloaded terrain is solid: the player drops to the next block boundary at most.
  expect(during.y).toBe(60);

  // Above the highest possible terrain: falling starts only once the ground exists.
  await page.evaluate(([px, pz]) => window.__mc.setPlayer({ x: px, y: 125, z: pz }), [x, z + 64]);
  await page.evaluate(() => window.__mc.step(120));
  await whenIdle(page);
  await step(page, 600);
  const landed = (await getState(page)).player;
  const ground = await surfaceY(page, Math.floor(landed.x), Math.floor(landed.z));
  expect(ground).toBeGreaterThan(0);
  if (landed.inWater) {
    // Over a lake the player sinks to the bed, which still lies above bedrock.
    expect(landed.y).toBeGreaterThan(1);
  } else {
    expect(landed.onGround).toBe(true);
    expect(landed.y).toBeGreaterThanOrEqual(ground + 1);
  }
});
