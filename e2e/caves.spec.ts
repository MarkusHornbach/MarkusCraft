// Phase 8 part B2a: generator 3 worlds in the browser (worlds, F3, checksum, light, references).
import { test, expect } from './fixtures';
import {
  backToWorlds,
  createWorld,
  getBlock,
  getState,
  openGame,
  openMenu,
  pauseWithMouse,
  setBlock,
  setPlayer,
  submit,
  surfaceY,
} from './game';
import {
  TERRAIN_CHECKSUMS_1337_V3,
  TERRAIN_CHECKSUMS_1337_V4,
} from '../src/testing/terrainChecksum';
import { getTerrain, terrainChecksum } from '../src/world/generation/terrain';
import { type TerrainV4, spawnChestChunk } from '../src/world/generation/terrainV4';
import { ravineView, shaftView, tunnelView } from '../src/testing/caveViews';
import { Block } from '../src/world/blocks';

const GEN3 = { version: 3, options: { terrain: 'balanced', trees: 'few' } } as const;

test('Phase 8B2a AC4.2: gen=3 opens a generator 3 world with the Node checksum', async ({
  page,
}) => {
  for (const [terrain, trees] of [
    ['balanced', 'few'],
    ['hilly', 'none'],
  ] as const) {
    await openGame(page, { gen: 3, terrain, trees });
    const { world } = await getState(page);
    expect(world).toMatchObject({ generatorVersion: 3, options: { terrain, trees } });
    expect(await page.evaluate(() => window.__mc.terrainChecksum())).toBe(
      TERRAIN_CHECKSUMS_1337_V3[`${terrain}/${trees}`],
    );
  }
  // `gen=3` alone takes the default options; the spawn shaft is found by the test API.
  await openGame(page, { gen: 3 });
  expect((await getState(page)).world?.options).toEqual({ terrain: 'balanced', trees: 'few' });
  const sites = await page.evaluate(() => window.__mc.caveSites());
  expect(sites?.shaft).not.toBeNull();
  expect(sites?.entrance).not.toBeNull();
  // Without `gen` the test world stays generator 1, which has no caves.
  await openGame(page);
  expect((await getState(page)).world?.generatorVersion).toBe(1);
  expect(await page.evaluate(() => window.__mc.caveSites())).toBeNull();
});

test('Phase 8B2a AC4.1 Phase 8B3b AC1.1: the New world form gives generator 4 in both modes', async ({
  page,
}) => {
  await openMenu(page);
  await createWorld(page, { name: 'Builder', mode: 'creative' });
  await page.keyboard.press('F3');
  await expect(page.locator('[data-debug="generator"]')).toHaveText('Generator 4 · balanced · few');
  await page.keyboard.press('F3');
  await pauseWithMouse(page);
  await backToWorlds(page);
  await createWorld(page, { name: 'Gatherer', mode: 'gathering' });
  expect((await getState(page)).world?.generatorVersion).toBe(4);
  await pauseWithMouse(page);
  await backToWorlds(page);
  const modes = await page
    .locator('.world-row')
    .evaluateAll((nodes) =>
      Object.fromEntries(
        nodes.map((node) => [
          node.querySelector('.world-row-name')?.textContent ?? '',
          node.querySelector('.world-row-mode')?.textContent ?? '',
        ]),
      ),
    );
  expect(modes).toEqual({
    Builder: 'Creative · Balanced · Few trees · Caves · Loot',
    Gatherer: 'Adventure · Balanced · Few trees · Caves · Loot',
  });
});

test('Phase 8B3b AC1.3: gen=4 opens a generator 4 world with the Node checksums', async ({
  page,
}) => {
  for (const [terrain, trees] of [
    ['balanced', 'few'],
    ['hilly', 'none'],
  ] as const) {
    await openGame(page, { gen: 4, terrain, trees });
    const { world } = await getState(page);
    expect(world).toMatchObject({ generatorVersion: 4, options: { terrain, trees } });
    const terrainV4 = getTerrain(1337, { version: 4, options: { terrain, trees } }) as TerrainV4;
    const chunk = spawnChestChunk(terrainV4);
    expect(chunk).not.toBeNull();
    if (!chunk) continue;
    expect(
      await page.evaluate(([cx, cz]) => window.__mc.terrainChecksum(cx, cz), [chunk.cx, chunk.cz]),
    ).toBe(TERRAIN_CHECKSUMS_1337_V4[`${terrain}/${trees}`]);
    expect(await page.evaluate(() => window.__mc.terrainChecksum())).toBe(
      terrainChecksum(1337, { version: 4, options: { terrain, trees } }),
    );
  }
});

test('Phase 8B2a AC2.3: breaking into a tunnel from the surface keeps the light invariant', async ({
  page,
}) => {
  await openGame(page, { gen: 3 });
  const sites = await page.evaluate(() => window.__mc.caveSites());
  const end = sites?.entrance?.end;
  expect(end).toBeDefined();
  if (!end) return;
  const { x, z } = end;
  await setPlayer(page, { x: x + 0.5, y: 90, z: z + 0.5, mode: 'fly' });
  let y = await surfaceY(page, x, z);
  let broken = 0;
  // Down the column, one break per block, through the action layer, until the air below.
  while (y > end.y && (await getBlock(page, x, y, z)) !== Block.AIR) {
    await setPlayer(page, { x: x + 0.5, y: y + 1.2, z: z + 0.5, pitch: -89 * (Math.PI / 180) });
    expect(await submit(page, { kind: 'break', x, y, z })).toBe(true);
    broken++;
    y--;
  }
  expect(broken).toBeGreaterThan(3);
  await page.evaluate(() => window.__mc.whenIdle());
  expect(await page.evaluate(() => window.__mc.verifyLight())).toBe(0);
});

test('Phase 8B2a AC4.4: matches the cave-tunnel reference (a torch, the mouth behind)', async ({
  page,
}) => {
  const { pose, torch } = tunnelView(1337, GEN3);
  await openGame(page, { gen: 3 });
  await setBlock(page, torch.x, torch.y, torch.z, Block.TORCH);
  await setPlayer(page, { ...pose, mode: 'fly' });
  // The torch lights the walls around it; the camera stands in the tunnel.
  const lit = await page.evaluate(
    ([x, y, z]) => window.__mc.getLight(x, y + 1, z),
    [torch.x, torch.y, torch.z],
  );
  expect(lit?.block).toBeGreaterThanOrEqual(12);
  await expect(page).toHaveScreenshot('cave-tunnel.png');
  expect(await page.evaluate(() => window.__mc.verifyLight())).toBe(0);
});

test('Phase 8B2a AC4.4: matches the mine-shaft reference (stairs and torches)', async ({
  page,
}) => {
  await openGame(page, { gen: 3 });
  const sites = await page.evaluate(() => window.__mc.caveSites());
  const shaft = sites?.shaft;
  expect(shaft).toBeTruthy();
  if (!shaft) return;
  await setPlayer(page, { ...shaftView(1337, GEN3), mode: 'fly' });
  // The well: torches on its steps, a log column in its centre, planks on its collar.
  let torches = 0;
  for (let y = shaft.chamber.y; y < shaft.top.y; y++) {
    for (const [dx, dz] of [
      [-1, -1],
      [0, -1],
      [1, -1],
      [1, 0],
      [1, 1],
      [0, 1],
      [-1, 1],
      [-1, 0],
    ]) {
      if ((await getBlock(page, shaft.x + dx, y, shaft.z + dz)) === Block.TORCH) torches++;
    }
  }
  expect(torches).toBeGreaterThanOrEqual(Math.floor((shaft.top.y - shaft.chamber.y) / 6));
  expect(await getBlock(page, shaft.x, shaft.top.y, shaft.z)).toBe(Block.LOG);
  expect(await getBlock(page, shaft.top.x, shaft.top.y - 1, shaft.top.z)).toBe(Block.PLANKS);
  await expect(page).toHaveScreenshot('mine-shaft.png');
});

test('Phase 8B2a AC4.4: matches the ravine reference (ore in its wall)', async ({ page }) => {
  await openGame(page, { gen: 3 });
  const sites = await page.evaluate(() => window.__mc.caveSites());
  const floor = sites?.ravine?.floor;
  expect(floor).toBeTruthy();
  if (!floor) return;
  await setPlayer(page, { ...ravineView(1337, GEN3), mode: 'fly' });
  // The floor is air above solid ground, deep below the rim.
  expect(await getBlock(page, floor.x, floor.y, floor.z)).toBe(Block.AIR);
  expect(await getBlock(page, floor.x, floor.y - 1, floor.z)).not.toBe(Block.AIR);
  await expect(page).toHaveScreenshot('ravine.png');
});
