// Light in the browser (Phase 4 part A): the stored light, the invariant, the picture.
import { LIGHT_CHECKSUM_1337_V1 } from '../src/testing/lightChecksum';
import { test, expect } from './fixtures';
import { getState, openGame, setPlayer } from './game';

test('the browser lights the world as Node does (Phase 4 AC2.7)', async ({ page }) => {
  await openGame(page);
  const state = await getState(page);
  expect(state.chunks.loaded).toBe(81);
  expect(state.chunks.lit).toBe(121);
  expect(state.chunks.generated).toBe(169);
  expect(state.chunks.relight).toBe(0);
  expect(await page.evaluate(() => window.__mc.lightChecksum())).toBe(LIGHT_CHECKSUM_1337_V1);
  expect(await page.evaluate(() => window.__mc.verifyLight())).toBe(0);
  // Open sky above the start point, nothing inside the ground, null where nothing is lit.
  const { player } = state;
  const light = (x: number, y: number, z: number) =>
    page.evaluate(([lx, ly, lz]) => window.__mc.getLight(lx, ly, lz), [x, y, z]);
  expect(await light(player.x, 120, player.z)).toEqual({ sky: 15, block: 0 });
  expect(await light(player.x, 3, player.z)).toEqual({ sky: 0, block: 0 });
  expect(await light(player.x + 5000, 60, player.z)).toBeNull();
});

test('light stays correct through ten teleports (Phase 4 AC2.7)', async ({ page }) => {
  test.setTimeout(180_000);
  await openGame(page);
  const { player } = await getState(page);
  for (let i = 1; i <= 10; i++) {
    await setPlayer(page, {
      x: player.x + 64 * i,
      y: 100,
      z: player.z + (i % 2) * 64,
      mode: 'fly',
    });
  }
  const state = await getState(page);
  expect(state.chunks.loaded).toBe(81);
  expect(state.chunks.pending).toBe(0);
  expect(state.chunks.relight).toBe(0);
  expect(state.chunks.lit).toBeGreaterThanOrEqual(121);
  expect(await page.evaluate(() => window.__mc.verifyLight())).toBe(0);
});
