// "Collide with leaves" (Phase 7 part A): leaves are passable for movement unless it is on.
import type { Page } from '@playwright/test';
import { test, expect } from './fixtures';
import { installFakePads, Pad, BUTTON, focusOn } from './gamepad';
import {
  PLATFORM_Y,
  getBlock,
  getState,
  give,
  openGame,
  openMenu,
  setBlock,
  setPlayer,
  standOnPlatform,
  step,
  submit,
} from './game';
import { TOUCH_DEVICE, withoutFullscreen } from './touch';

const AIR = 0;
const LEAVES = 6;
const TORCH = 19;

/** A wall of leaves two high across the runway of `standOnPlatform`, four blocks ahead. */
async function leafWall(page: Page, px: number, pz: number): Promise<void> {
  await page.evaluate(
    ([x0, y, z, id]) => {
      for (let x = x0 - 3; x <= x0 + 3; x++) {
        window.__mc.setBlock(x, y, z, id);
        window.__mc.setBlock(x, y + 1, z, id);
      }
    },
    [px, PLATFORM_Y + 1, pz - 4, LEAVES],
  );
}

/** Walks forward (-Z) for `steps` simulation steps. */
async function walk(page: Page, steps: number): Promise<void> {
  await page.keyboard.down('KeyW');
  await step(page, steps);
  await page.keyboard.up('KeyW');
  await step(page, 10);
}

/** Five leaves above the platform, the player standing on them. */
async function onCanopy(page: Page, px: number, pz: number): Promise<void> {
  for (let x = px - 1; x <= px + 1; x++) await setBlock(page, x, PLATFORM_Y + 4, pz, LEAVES);
  await setPlayer(page, { x: px + 0.5, y: PLATFORM_Y + 5, z: pz + 0.5, yaw: 0, pitch: 0 });
  await step(page, 60);
}

test('Phase 7 AC7.1: leaves are passable by default; with the setting on they stop the player', async ({
  page,
}) => {
  await openGame(page);
  expect((await getState(page)).settings.collideLeaves).toBe(false);
  const { px, pz } = await standOnPlatform(page);
  await leafWall(page, px, pz);
  await walk(page, 100);
  // Through the wall (its north face is at z = pz - 4).
  expect((await getState(page)).player.z).toBeLessThan(pz - 5);
  await onCanopy(page, px, pz);
  expect((await getState(page)).player.y).toBeCloseTo(PLATFORM_Y + 1, 6);

  await page.evaluate(() => window.__mc.setCollideLeaves(true));
  expect((await getState(page)).settings.collideLeaves).toBe(true);
  await setPlayer(page, { x: px + 0.5, y: PLATFORM_Y + 1, z: pz + 0.5, yaw: 0, pitch: 0 });
  await walk(page, 70);
  // Stopped in front of the wall (its south face is at z = pz - 3).
  expect((await getState(page)).player.z).toBeGreaterThan(pz - 3);
  await onCanopy(page, px, pz);
  expect((await getState(page)).player.y).toBeCloseTo(PLATFORM_Y + 5, 6);
  expect(await page.evaluate(() => window.__mc.verifyLight())).toBe(0);
});

test('Phase 7 AC7.2: with the setting off leaves are targetable and breakable, and carry a torch', async ({
  page,
}) => {
  await openGame(page, { mode: 'gathering' });
  const { px, pz } = await standOnPlatform(page);
  const leaf = { x: px, y: PLATFORM_Y + 1, z: pz - 2 };
  await setBlock(page, leaf.x, leaf.y, leaf.z, LEAVES);
  await setPlayer(page, { pitch: -0.45 });
  expect((await getState(page)).target).toMatchObject({ ...leaf, id: LEAVES });
  // A torch stands on leaves: they are still a support.
  await setBlock(page, px + 1, PLATFORM_Y + 1, pz - 2, LEAVES);
  await give(page, TORCH, 1);
  const slot = (await getState(page)).inventory.slots.findIndex((s) => s?.item === TORCH);
  expect(await submit(page, { kind: 'place', x: px + 1, y: PLATFORM_Y + 2, z: pz - 2, slot })).toBe(
    true,
  );
  expect(await getBlock(page, px + 1, PLATFORM_Y + 2, pz - 2)).toBe(TORCH);
  // Breaking the leaf takes the hands' time; then it is gone.
  expect(await submit(page, { kind: 'startBreak', ...leaf })).toBe(true);
  await step(page, 60);
  expect(await submit(page, { kind: 'break', ...leaf })).toBe(true);
  expect(await getBlock(page, leaf.x, leaf.y, leaf.z)).toBe(AIR);
  expect(await page.evaluate(() => window.__mc.verifyLight())).toBe(0);
});

test('Phase 7 AC7.4: switching it on inside leaves does not move the player, who walks out', async ({
  page,
}) => {
  await openGame(page);
  const { px, pz } = await standOnPlatform(page);
  // Leaves in the cells the player stands in; air ahead.
  await setBlock(page, px, PLATFORM_Y + 1, pz, LEAVES);
  await setBlock(page, px, PLATFORM_Y + 2, pz, LEAVES);
  expect(await getBlock(page, px, PLATFORM_Y + 1, pz - 1)).toBe(AIR);
  const before = (await getState(page)).player;
  await page.evaluate(() => window.__mc.setCollideLeaves(true));
  await step(page, 30);
  const after = (await getState(page)).player;
  expect([after.x, after.y, after.z]).toEqual([before.x, before.y, before.z]);
  await walk(page, 60);
  expect((await getState(page)).player.z).toBeLessThan(pz - 2);
});

test.describe('the settings page (Phase 7 AC7.3)', () => {
  const toggle = '#setting-collide-leaves';

  async function settingsPage(page: Page): Promise<void> {
    await page
      .locator('.world-settings-button:visible, .world-form-settings-button:visible')
      .click();
    await expect(page.locator(toggle)).toBeVisible();
  }

  test('the mouse switches it; it persists over a reload', async ({ page }) => {
    await openMenu(page);
    await settingsPage(page);
    await expect(page.locator('label[for="setting-collide-leaves"]')).toContainText(
      'Collide with leaves',
    );
    await expect(page.locator(toggle)).not.toBeChecked();
    await page.locator(toggle).click();
    await expect(page.locator(toggle)).toBeChecked();
    expect((await getState(page)).settings.collideLeaves).toBe(true);
    await page.reload();
    await page.waitForFunction(() => window.__mc !== undefined);
    expect((await getState(page)).settings.collideLeaves).toBe(true);
    await settingsPage(page);
    await expect(page.locator(toggle)).toBeChecked();
  });

  test.describe('by touch', () => {
    test.use(TOUCH_DEVICE);
    test('a tap switches it', async ({ page }) => {
      await page.setViewportSize({ width: 640, height: 360 });
      await withoutFullscreen(page);
      await openMenu(page);
      await page.locator('.world-form-settings-button:visible').tap();
      await page.locator(toggle).scrollIntoViewIfNeeded();
      await page.locator(toggle).tap();
      await expect(page.locator(toggle)).toBeChecked();
      expect((await getState(page)).settings.collideLeaves).toBe(true);
    });
  });

  test('the controller switches it with A', async ({ page }) => {
    await installFakePads(page);
    await openMenu(page);
    const pad = new Pad(page);
    await pad.connect();
    await pad.tap(BUTTON.LEFT);
    await focusOn(page, pad, '.world-form-settings-button');
    await pad.tap(BUTTON.A);
    await expect(page.locator(toggle)).toBeVisible();
    await focusOn(page, pad, toggle);
    await pad.tap(BUTTON.A);
    await expect(page.locator(toggle)).toBeChecked();
    expect((await getState(page)).settings.collideLeaves).toBe(true);
  });
});
