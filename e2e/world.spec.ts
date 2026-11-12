// World rendering and chunk management in the browser (plan step 7).
import { test, expect } from './fixtures';
import { DEG, getState, openGame, setPlayer, surfaceY } from './game';
import { capture, centerRegion, meanColor } from './helpers';

test('loads the 9×9 chunks around the spawn (AC7.1, AC7.4)', async ({ page }) => {
  await openGame(page);
  const state = await getState(page);
  expect(state.seed).toBe(1337);
  expect(state.chunks.loaded).toBe(81);
  expect(state.chunks.pending).toBe(0);
  expect(state.render.drawCalls).toBeGreaterThan(0);
  expect(state.render.drawCalls).toBeLessThanOrEqual(3 * state.chunks.loaded + 10);
  expect(state.render.triangles).toBeGreaterThan(1000);
});

test('unloads and reloads chunks without leaking GPU resources (AC7.2)', async ({ page }) => {
  await openGame(page);
  const start = await getState(page);
  const home = { x: start.player.x, z: start.player.z };
  let baseline = 0;
  for (let round = 0; round < 5; round++) {
    await setPlayer(page, { x: home.x + 320, z: home.z });
    const away = await getState(page);
    expect(away.chunks.loaded).toBe(81);
    expect(away.chunks.pending).toBe(0);
    await setPlayer(page, { x: home.x, z: home.z });
    const back = await getState(page);
    expect(back.chunks.loaded).toBe(81);
    expect(back.chunks.meshed).toBe(81);
    expect(back.chunks.generated).toBe(121);
    if (round === 0) baseline = back.render.geometries;
    expect(back.render.geometries).toBeLessThanOrEqual(baseline * 1.1);
  }
  // Same place, same world: the geometry count is exactly what it was at the start.
  expect((await getState(page)).render.geometries).toBe(start.render.geometries);
});

test('shows blue sky looking up and green grass looking down (AC7.5)', async ({ page }) => {
  await openGame(page);
  const { player } = await getState(page);

  await setPlayer(page, { pitch: 89 * DEG, yaw: Math.PI });
  const sky = meanColor(await capture(page), centerRegion(await capture(page)));
  expect(sky.b).toBeGreaterThan(sky.r);
  expect(sky.b).toBeGreaterThan(sky.g);

  const x = Math.floor(player.x);
  const z = Math.floor(player.z);
  const ground = await surfaceY(page, x, z);
  // Eye 3 blocks above the grass surface (feet position = eye - 1.62).
  await setPlayer(page, { y: ground + 1 + 3 - 1.62, pitch: -89 * DEG, mode: 'fly' });
  const image = await capture(page);
  const grass = meanColor(image, centerRegion(image));
  expect(grass.g).toBeGreaterThan(grass.r);
  expect(grass.g).toBeGreaterThan(grass.b);
});

test('matches the spawn and overview reference screenshots (AC7.6)', async ({ page }) => {
  await openGame(page);
  await expect(page).toHaveScreenshot('spawn-noon.png');
  const { player } = await getState(page);
  await setPlayer(page, { y: player.y + 30, yaw: -90 * DEG, pitch: -30 * DEG, mode: 'fly' });
  await expect(page).toHaveScreenshot('overview-noon.png');
});
