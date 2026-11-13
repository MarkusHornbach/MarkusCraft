// Generator version 1 in the browser (Phase 3 step 1): checksum, new blocks, rocky hills.
import { TERRAIN_CHECKSUM_1337_V1 } from '../src/testing/terrainChecksum';
import { test, expect } from './fixtures';
import {
  DEG,
  PLATFORM_Y,
  clickCenter,
  getBlock,
  getState,
  openGame,
  setPlayer,
  standOnPlatform,
} from './game';
import { capture, centerRegion, colorDistance, meanColor, shareOf, type Rgb } from './helpers';

const AIR = 0;
const STONE = 3;
const COAL_ORE = 12;
const IRON_ORE = 13;
const CLAY = 14;

/** A pose on the rocky hill south of the start point of seed 1337, facing a coal vein. */
const ROCKY_HILL = {
  x: 36.5,
  y: 99,
  z: 60.5,
  yaw: 180 * DEG,
  pitch: -17 * DEG,
  mode: 'fly' as const,
};

test('the browser generates the same terrain as Node (Phase 3 AC1.2)', async ({ page }) => {
  await openGame(page);
  expect(await page.evaluate(() => window.__mc.terrainChecksum())).toBe(TERRAIN_CHECKSUM_1337_V1);
});

test('coal ore, iron ore and clay have their own tiles and can be broken (Phase 3 AC1.11)', async ({
  page,
}) => {
  await openGame(page);
  const { px, pz } = await standOnPlatform(page);
  const wallColour = async (id: number): Promise<{ mean: Rgb; dark: number; warm: number }> => {
    // A wall that fills the centre of the view, two blocks in front of the player.
    await page.evaluate(
      async ([x0, y0, z0, block]) => {
        for (let dy = 0; dy < 4; dy++) {
          for (let dx = -3; dx <= 3; dx++) window.__mc.setBlock(x0 + dx, y0 + dy, z0, block);
        }
        await window.__mc.whenIdle();
      },
      [px, PLATFORM_Y + 1, pz - 3, id],
    );
    const image = await capture(page);
    const region = centerRegion(image, 0.3);
    return {
      mean: meanColor(image, region),
      dark: shareOf(image, (r, g, b) => r + g + b < 180, region),
      warm: shareOf(image, (r, _g, b) => r > b + 50, region),
    };
  };

  const stone = await wallColour(STONE);
  const coal = await wallColour(COAL_ORE);
  const iron = await wallColour(IRON_ORE);
  const clay = await wallColour(CLAY);
  // Coal: black nuggets. Iron: rust-coloured nuggets. Clay: a pale blue-grey.
  expect(coal.dark).toBeGreaterThan(stone.dark + 0.02);
  expect(iron.warm).toBeGreaterThan(stone.warm + 0.02);
  expect(colorDistance(coal.mean, stone.mean)).toBeGreaterThan(4);
  expect(colorDistance(iron.mean, stone.mean)).toBeGreaterThan(4);
  expect(colorDistance(clay.mean, stone.mean)).toBeGreaterThan(25);
  expect(clay.mean.b).toBeGreaterThan(clay.mean.r + 15);
  expect(colorDistance(coal.mean, iron.mean)).toBeGreaterThan(4);

  // Each of them is broken by a click, as every other block in Creative.
  for (const id of [COAL_ORE, IRON_ORE, CLAY]) {
    await page.evaluate(
      async ([x, y, z, block]) => {
        window.__mc.setBlock(x, y, z, block);
        await window.__mc.whenIdle();
      },
      [px, PLATFORM_Y + 2, pz - 3, id],
    );
    expect((await getState(page)).target).toMatchObject({ x: px, y: PLATFORM_Y + 2, id });
    await clickCenter(page);
    expect(await getBlock(page, px, PLATFORM_Y + 2, pz - 3)).toBe(AIR);
  }
});

test('hilltops are bare rock with visible ore (Phase 3 AC1.5, AC1.13)', async ({ page }) => {
  await openGame(page);
  await setPlayer(page, ROCKY_HILL);
  const state = await getState(page);
  // The crosshair rests on a coal vein about ten blocks away.
  expect(state.target).toBeNull();
  const ore = await page.evaluate(() => {
    const mc = window.__mc;
    const found: number[][] = [];
    for (let z = 66; z <= 74; z++) {
      for (let x = 32; x <= 40; x++) {
        const y = mc.surfaceY(x, z);
        if (mc.getBlock(x, y, z) === 12) found.push([x, y, z]);
      }
    }
    return found;
  });
  expect(ore.length).toBeGreaterThanOrEqual(3);
  for (const [, , z] of ore) expect(z - ROCKY_HILL.z).toBeGreaterThanOrEqual(8);

  const image = await capture(page);
  // Grey rock fills the view: hardly any grass green or soil brown.
  const grey = shareOf(image, (r, g, b) => Math.abs(r - g) < 14 && Math.abs(g - b) < 18 && r < 200);
  expect(grey).toBeGreaterThan(0.5);
  // The black nuggets of the vein stand out near the centre of the view.
  const nuggets = shareOf(image, (r, g, b) => r + g + b < 150, centerRegion(image, 0.25));
  expect(nuggets).toBeGreaterThan(0.002);
  await expect(page).toHaveScreenshot('rocky-hill.png');
});
