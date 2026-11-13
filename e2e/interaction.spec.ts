// Block interaction and the selector bar in the browser (plan step 9).
import { test, expect } from './fixtures';
import {
  DEG,
  PLATFORM_Y,
  clickCenter,
  getBlock,
  getState,
  openGame,
  setBlock,
  setPlayer,
  standOnPlatform,
  step,
  surfaceY,
} from './game';
import {
  capture,
  centerRegion,
  colorDistance,
  diffShare,
  meanColor,
  shareOf,
  type Image,
} from './helpers';

const AIR = 0;
const GRASS = 1;
const STONE = 3;
const SAND = 4;
const BRICKS = 8;

function darkPixels(image: Image): number {
  return shareOf(image, (r, g, b) => r + g + b < 200) * image.width * image.height;
}

test('left click breaks the targeted block, right click places the selected one (AC9.3)', async ({
  page,
}) => {
  await openGame(page);
  const { player } = await getState(page);
  const x = Math.floor(player.x);
  const z = Math.floor(player.z);
  const ground = await surfaceY(page, x, z);
  await setPlayer(page, { pitch: -89 * DEG });

  let state = await getState(page);
  expect(state.target).toMatchObject({ x, y: ground, z, id: GRASS, face: [0, 1, 0] });
  const before = await capture(page);

  await clickCenter(page);
  expect(await getBlock(page, x, ground, z)).toBe(AIR);
  const broken = await capture(page);
  expect(diffShare(before, broken, centerRegion(before, 0.3))).toBeGreaterThan(0.3);
  // The next block down is targeted now.
  state = await getState(page);
  expect(state.target).toMatchObject({ x, y: ground - 1, z });

  await page.keyboard.press('Digit8');
  await clickCenter(page, 'right');
  expect(await getBlock(page, x, ground, z)).toBe(BRICKS);
  const placed = await capture(page);
  const centre = meanColor(placed, centerRegion(placed, 0.3));
  expect(centre.r).toBeGreaterThan(centre.g + 20);
  expect(centre.r).toBeGreaterThan(centre.b + 20);

  // Placing into the cell the player stands in is refused.
  await clickCenter(page, 'right');
  expect(await getBlock(page, x, ground + 1, z)).toBe(AIR);
});

test('a block set in front of the camera shows up in the centre (5.4)', async ({ page }) => {
  await openGame(page);
  const { px, pz } = await standOnPlatform(page);
  const before = await capture(page);
  // Eye height is 1.62 above the platform top: the block in front at eye level.
  await setBlock(page, px, PLATFORM_Y + 2, pz - 2, BRICKS);
  const after = await capture(page);
  const region = centerRegion(after, 0.2);
  const colour = meanColor(after, region);
  expect(colorDistance(meanColor(before, region), colour)).toBeGreaterThan(60);
  expect(colour.r).toBeGreaterThan(colour.g + 20);
  expect(colour.r).toBeGreaterThan(colour.b + 20);
});

test('bedrock cannot be broken and distant blocks cannot be reached', async ({ page }) => {
  await openGame(page);
  const { px, pz } = await standOnPlatform(page);
  // Replace the block under the player with bedrock (id 11) and try to break it.
  await setBlock(page, px, PLATFORM_Y, pz, 11);
  await setPlayer(page, { pitch: -89 * DEG });
  expect((await getState(page)).target).toMatchObject({ y: PLATFORM_Y, id: 11 });
  await clickCenter(page);
  expect(await getBlock(page, px, PLATFORM_Y, pz)).toBe(11);

  // A block 6 away along the view is beyond the reach of 5.
  await setPlayer(page, { pitch: 0 });
  await setBlock(page, px, PLATFORM_Y + 2, pz - 7, STONE);
  expect((await getState(page)).target).toBeNull();
  await clickCenter(page);
  expect(await getBlock(page, px, PLATFORM_Y + 2, pz - 7)).toBe(STONE);
  await setBlock(page, px, PLATFORM_Y + 2, pz - 5, STONE);
  expect((await getState(page)).target).toMatchObject({ z: pz - 5, face: [0, 0, 1] });
});

test('keys 1–9 and the mouse wheel select the block slot (AC9.4)', async ({ page }) => {
  await openGame(page);
  const selected = page.locator('.hotbar-slot.selected');
  await expect(page.locator('.hotbar-slot')).toHaveCount(9);
  await expect(selected).toHaveAttribute('data-slot', '1');

  for (let slot = 9; slot >= 1; slot--) {
    await page.keyboard.press(`Digit${slot}`);
    expect((await getState(page)).selectedSlot).toBe(slot);
    await expect(selected).toHaveCount(1);
    await expect(selected).toHaveAttribute('data-slot', String(slot));
  }
  // The name of the newly selected block is announced.
  await page.keyboard.press('Digit8');
  await expect(page.locator('.hotbar-label')).toHaveText('Bricks');
  await expect(page.locator('.hotbar-label')).toHaveClass(/visible/);

  await page.mouse.move(480, 270);
  await page.mouse.wheel(0, 100);
  expect((await getState(page)).selectedSlot).toBe(9);
  await page.mouse.wheel(0, 100);
  // Wraps around from 9 to 1 …
  expect((await getState(page)).selectedSlot).toBe(1);
  await expect(selected).toHaveAttribute('data-slot', '1');
  await page.mouse.wheel(0, -100);
  // … and back from 1 to 9.
  expect((await getState(page)).selectedSlot).toBe(9);
  await expect(selected).toHaveAttribute('data-slot', '9');
  await expect(page.locator('.hotbar-label')).toHaveText('Glass');
});

test('holding a mouse button repeats the action every 250 ms', async ({ page }) => {
  await openGame(page);
  const { px, pz } = await standOnPlatform(page);
  const y = PLATFORM_Y + 2;
  for (const dz of [2, 3, 4]) await setBlock(page, px, y, pz - dz, STONE);

  await page.mouse.move(480, 270);
  await page.mouse.down();
  expect(await getBlock(page, px, y, pz - 2)).toBe(AIR);
  await step(page, 14);
  expect(await getBlock(page, px, y, pz - 3)).toBe(STONE);
  await step(page, 1);
  expect(await getBlock(page, px, y, pz - 3)).toBe(AIR);
  await step(page, 15);
  expect(await getBlock(page, px, y, pz - 4)).toBe(AIR);
  await page.mouse.up();

  // Right button: places a row of blocks towards the player, one per interval.
  await setBlock(page, px, y, pz - 5, STONE);
  await page.mouse.down({ button: 'right' });
  expect(await getBlock(page, px, y, pz - 4)).toBe(GRASS);
  await step(page, 15);
  expect(await getBlock(page, px, y, pz - 3)).toBe(GRASS);
  await page.mouse.up({ button: 'right' });
  await step(page, 30);
  expect(await getBlock(page, px, y, pz - 2)).toBe(AIR);
});

test('editing on a chunk border remeshes both chunks (AC9.5)', async ({ page }) => {
  await openGame(page);
  // Find a flat, open grass strip across the border between chunk 0 (x = 15) and 1 (x = 16).
  const spot = await page.evaluate(() => {
    const mc = window.__mc;
    for (let z = -30; z <= 30; z++) {
      const h = mc.surfaceY(15, z);
      let ok = true;
      for (let x = 13; x <= 18 && ok; x++) {
        ok =
          mc.surfaceY(x, z) === h &&
          mc.getBlock(x, h, z) === 1 &&
          mc.getBlock(x, h + 1, z) === 0 &&
          mc.getBlock(x, h + 2, z) === 0;
      }
      if (ok) return { z, h };
    }
    return null;
  });
  expect(spot).not.toBeNull();
  if (!spot) return;
  const { z, h } = spot;

  // Reference view from above, before any edit.
  const above = { x: 16, y: h + 5, z: z + 0.5, yaw: 0, pitch: -89 * DEG, mode: 'fly' as const };
  await setPlayer(page, above);
  const original = await capture(page);

  const notSky = (image: Image): boolean => {
    const c = meanColor(image, centerRegion(image, 0.15));
    return c.b < Math.max(c.r, c.g);
  };

  // Break the block in chunk 1 and look west from inside the hole at chunk 0's block.
  await setBlock(page, 16, h, z, AIR);
  await setPlayer(page, { x: 16.5, y: h + 0.5 - 1.62, z: z + 0.5, yaw: 90 * DEG, pitch: 0 });
  expect((await getState(page)).target).toMatchObject({ x: 15, y: h, z, face: [1, 0, 0] });
  expect(notSky(await capture(page))).toBe(true);
  await setBlock(page, 16, h, z, GRASS);

  // The other way round: break in chunk 0, look east at chunk 1's block.
  await setBlock(page, 15, h, z, AIR);
  await setPlayer(page, { x: 15.5, y: h + 0.5 - 1.62, z: z + 0.5, yaw: -90 * DEG, pitch: 0 });
  expect((await getState(page)).target).toMatchObject({ x: 16, y: h, z, face: [-1, 0, 0] });
  expect(notSky(await capture(page))).toBe(true);

  // From above the hole is visible …
  await setPlayer(page, above);
  expect(diffShare(original, await capture(page))).toBeGreaterThan(0.01);
  // … and after restoring the block nothing stale is left on either side.
  await setBlock(page, 15, h, z, GRASS);
  expect(diffShare(original, await capture(page))).toBeLessThan(0.002);
});

test('an edited block survives unloading and reloading its chunk (AC9.6)', async ({ page }) => {
  await openGame(page);
  const { player } = await getState(page);
  const x = Math.floor(player.x) + 2;
  const z = Math.floor(player.z) + 2;
  const y = (await surfaceY(page, x, z)) + 3;
  await setBlock(page, x, y, z, BRICKS);
  const dug = await surfaceY(page, x - 1, z);
  await setBlock(page, x - 1, dug, z, AIR);

  await setPlayer(page, { x: player.x + 320 });
  // The chunk is gone: reads return air.
  expect(await getBlock(page, x, y, z)).toBe(AIR);
  expect((await getState(page)).chunks.loaded).toBe(81);

  await setPlayer(page, { x: player.x });
  expect(await getBlock(page, x, y, z)).toBe(BRICKS);
  expect(await getBlock(page, x - 1, dug, z)).toBe(AIR);
});

test('the targeted block gets a visible outline (AC9.7)', async ({ page }) => {
  await openGame(page);
  await standOnPlatform(page, SAND);
  await setPlayer(page, { pitch: -89 * DEG });
  expect((await getState(page)).target).not.toBeNull();
  const withTarget = darkPixels(await capture(page));

  // Six blocks higher the platform is out of reach: no target, no outline.
  await setPlayer(page, { y: PLATFORM_Y + 7, mode: 'fly' });
  expect((await getState(page)).target).toBeNull();
  const withoutTarget = darkPixels(await capture(page));
  expect(withTarget).toBeGreaterThan(withoutTarget + 300);
});

test('matches the build reference screenshot (AC9.8)', async ({ page }) => {
  await openGame(page);
  const { px, pz } = await standOnPlatform(page);
  // A 3×3 wall made of all nine placeable blocks, plus a few loose ones around it.
  await page.evaluate(
    ([x0, y0, z0]) => {
      let id = 1;
      for (let dy = 0; dy < 3; dy++) {
        for (let dx = -1; dx <= 1; dx++) window.__mc.setBlock(x0 + dx, y0 + dy, z0, id++);
      }
      window.__mc.setBlock(x0 - 3, y0, z0 + 1, 9);
      window.__mc.setBlock(x0 - 3, y0 + 1, z0 + 1, 9);
      window.__mc.setBlock(x0 + 3, y0, z0 + 1, 6);
      window.__mc.setBlock(x0 + 3, y0, z0, 5);
      window.__mc.setBlock(x0 + 3, y0 + 1, z0, 5);
      window.__mc.setBlock(x0 + 3, y0 + 2, z0, 6);
    },
    [px, PLATFORM_Y + 1, pz - 4],
  );
  await setPlayer(page, { pitch: 4 * DEG });
  await expect(page).toHaveScreenshot('build.png');
});
