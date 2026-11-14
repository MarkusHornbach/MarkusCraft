// Phase 3 part C: the crafted blocks, tools, the recipe list and the way to a stone pickaxe.
import { expect, test } from './fixtures';
import { PLATFORM_Y, openGame, standOnPlatform } from './game';
import { capture, centerRegion, colorDistance, meanColor, shareOf, type Rgb } from './helpers';

const STONE = 3;
const PLANKS = 7;
const WORKBENCH = 15;
const FURNACE = 16;
const STONE_BRICKS = 17;
const IRON_BLOCK = 18;

test('Phase 3 AC10.5: workbench, furnace, stone bricks and iron block have their own tiles and are in the palette', async ({
  page,
}) => {
  await openGame(page);
  const { px, pz } = await standOnPlatform(page);
  const wall = async (
    id: number,
  ): Promise<{ mean: Rgb; dark: number; glow: number; bright: number }> => {
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
      dark: shareOf(image, (r, g, b) => r + g + b < 150, region),
      glow: shareOf(image, (r, g, b) => r > 150 && r > g + 40 && g > b + 20, region),
      bright: shareOf(image, (r, g, b) => r + g + b > 480, region),
    };
  };

  const stone = await wall(STONE);
  const planks = await wall(PLANKS);
  const workbench = await wall(WORKBENCH);
  const furnace = await wall(FURNACE);
  const bricks = await wall(STONE_BRICKS);
  const iron = await wall(IRON_BLOCK);

  // Workbench: wood like the planks, but darker through its rails and legs.
  expect(workbench.mean.r).toBeGreaterThan(workbench.mean.b + 30);
  expect(colorDistance(workbench.mean, planks.mean)).toBeGreaterThan(10);
  expect(colorDistance(workbench.mean, stone.mean)).toBeGreaterThan(30);
  // Furnace: grey stone with a black opening and glowing embers.
  expect(furnace.dark).toBeGreaterThan(stone.dark + 0.03);
  expect(furnace.glow).toBeGreaterThan(0.01);
  expect(stone.glow).toBeLessThan(0.002);
  expect(bricks.glow).toBeLessThan(0.002);
  // Stone bricks: grey as stone, with dark grooves between the blocks.
  expect(Math.abs(bricks.mean.r - bricks.mean.b)).toBeLessThan(14);
  expect(bricks.dark).toBeGreaterThan(stone.dark + 0.01);
  expect(bricks.dark).toBeLessThan(furnace.dark);
  // Iron block: by far the brightest of them.
  expect(iron.bright).toBeGreaterThan(0.6);
  expect(iron.bright).toBeGreaterThan(stone.bright + 0.5);
  const all = [stone, planks, workbench, furnace, bricks, iron];
  for (let a = 0; a < all.length; a++) {
    for (let b = a + 1; b < all.length; b++) {
      expect(colorDistance(all[a].mean, all[b].mean), `${a} against ${b}`).toBeGreaterThan(4);
    }
  }

  // All four are in the Creative palette and go into the bar from there.
  await page.keyboard.press('KeyE');
  for (const name of ['workbench', 'furnace', 'stone_bricks', 'iron_block']) {
    await expect(page.locator(`.palette-slot[data-item="${name}"]`)).toHaveCount(1);
    await expect(page.locator(`.palette-slot[data-item="${name}"] canvas`)).toHaveCount(1);
  }
  await page.locator('.palette-slot[data-item="furnace"]').click();
  await expect(page.locator('.inv-slot[data-index="0"]')).toHaveAttribute('data-item', 'furnace');
});
