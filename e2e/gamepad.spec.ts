// The controller in play (Phase 5 step 2): movement, look, the buttons of plan 5.3, the
// active source on top of mouse and touch mode, connecting and disconnecting.
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import {
  DEG,
  PLATFORM_Y,
  createWorld,
  getBlock,
  getState,
  inventory,
  openGame,
  openMenu,
  setPlayer,
  standOnPlatform,
  step,
  untilPlaying,
} from './game';
import { BUTTON, Pad, installFakePads, polls } from './gamepad';
import { TOUCH_DEVICE, Fingers, centerOf, openTouchGame } from './touch';

const AIR = 0;
const DIRT = 2;
const STONE = 3;

/** Opens the test world with the fake pads installed; returns a connected pad. */
async function padGame(
  page: Page,
  options: { mode?: 'creative' | 'gathering' } = {},
): Promise<Pad> {
  await installFakePads(page);
  await openGame(page, options);
  const pad = new Pad(page);
  await pad.connect();
  return pad;
}

/** The player on a platform of `block`, looking down at the cell ahead of the feet. */
async function facingPlatform(page: Page, block = STONE): Promise<{ px: number; pz: number }> {
  const at = await standOnPlatform(page, block);
  await setPlayer(page, { pitch: -50 * DEG });
  expect((await getState(page)).target).toMatchObject({ x: at.px, y: PLATFORM_Y, z: at.pz - 1 });
  return at;
}

function noticeText(page: Page): Promise<string | null> {
  return page.locator('.pickup-notice.visible').textContent({ timeout: 2000 });
}

test('Phase 5 AC2.1: the left stick moves the player; inside the dead zone it does not', async ({
  page,
}) => {
  const pad = await padGame(page);
  await standOnPlatform(page);
  const start = (await getState(page)).player;
  await pad.stick('left', 0, -0.1);
  await step(page, 60);
  let player = (await getState(page)).player;
  expect(Math.hypot(player.x - start.x, player.z - start.z)).toBeLessThan(1e-9);
  expect((await getState(page)).pad.active).toBe(false);

  await pad.stick('left', 0, -1);
  expect((await getState(page)).pad.active).toBe(true);
  await step(page, 60);
  player = (await getState(page)).player;
  // Facing −Z: forward is −Z, about 4 blocks in one second of walking.
  expect(start.z - player.z).toBeGreaterThan(3);
  expect(Math.abs(player.x - start.x)).toBeLessThan(0.01);
  await pad.stick('left', 0, 0);
});

test('Phase 5 AC2.2: the right stick turns right and looks up; pitch stays clamped', async ({
  page,
}) => {
  const pad = await padGame(page);
  await setPlayer(page, { yaw: 0, pitch: 0 });
  await pad.stick('right', 1, 0);
  await polls(page, 3);
  await pad.stick('right', 0, 0);
  let player = (await getState(page)).player;
  // Turning right lowers the yaw, as with the mouse.
  expect(player.yaw).toBeLessThan(-0.01);
  expect(Math.abs(player.pitch)).toBeLessThan(1e-9);

  const yaw = player.yaw;
  await pad.stick('right', 0, -1);
  await polls(page, 3);
  await pad.stick('right', 0, 0);
  player = (await getState(page)).player;
  expect(player.pitch).toBeGreaterThan(0.01);
  expect(player.yaw).toBeCloseTo(yaw, 9);

  // Held up for long: the pitch ends at its limit and does not pass it.
  await pad.stick('right', 0, -1);
  await page.waitForFunction(() => window.__mc.getState().player.pitch > 88 * (Math.PI / 180));
  await polls(page, 3);
  await pad.stick('right', 0, 0);
  expect((await getState(page)).player.pitch).toBeLessThanOrEqual(89 * DEG + 1e-9);
});

test('Phase 5 AC2.2: with "Invert controller look" stored, stick up looks down', async ({
  page,
}) => {
  await installFakePads(page);
  await page.addInitScript(() =>
    window.localStorage.setItem(
      'markuscraft.settings.v1',
      JSON.stringify({ renderDistance: 2, mouseSensitivity: 1, fov: 75, padInvertY: true }),
    ),
  );
  await openMenu(page, '', false);
  await createWorld(page);
  const pad = new Pad(page);
  await pad.connect();
  expect((await getState(page)).settings.padInvertY).toBe(true);
  await setPlayer(page, { pitch: 0 });
  await pad.stick('right', 0, -1);
  await polls(page, 3);
  await pad.stick('right', 0, 0);
  expect((await getState(page)).player.pitch).toBeLessThan(-0.01);
});

test('Phase 5 AC2.3: RT breaks, LT places, the bumpers and the D-pad select (Creative)', async ({
  page,
}) => {
  const pad = await padGame(page);
  const { px, pz } = await facingPlatform(page);
  await pad.tap(BUTTON.RT);
  expect(await getBlock(page, px, PLATFORM_Y, pz - 1)).toBe(AIR);
  // Bar slot 1 holds grass in Creative.
  await pad.tap(BUTTON.LT);
  expect(await getBlock(page, px, PLATFORM_Y, pz - 1)).not.toBe(AIR);

  const slots: number[] = [];
  for (const button of [BUTTON.LB, BUTTON.RB, BUTTON.RB, BUTTON.LEFT, BUTTON.RIGHT]) {
    await pad.tap(button);
    slots.push((await getState(page)).selectedSlot);
  }
  // From slot 1: back to 9 (wrap-around), forward to 1 and 2, the D-pad back and forth.
  expect(slots).toEqual([9, 1, 2, 1, 2]);
});

test('Phase 5 AC2.3: holding RT breaks after the break time in Gathering, like the mouse', async ({
  page,
}) => {
  const pad = await padGame(page, { mode: 'gathering' });
  const { px, pz } = await facingPlatform(page, DIRT);
  await pad.press(BUTTON.RT);
  expect((await getState(page)).breaking).toMatchObject({ x: px, y: PLATFORM_Y, z: pz - 1 });
  await step(page, 34);
  expect(await getBlock(page, px, PLATFORM_Y, pz - 1)).toBe(DIRT);
  await step(page, 3);
  expect(await getBlock(page, px, PLATFORM_Y, pz - 1)).toBe(AIR);
  expect((await inventory(page))[0]).toEqual({ item: DIRT, count: 1 });
  await pad.release(BUTTON.RT);
  expect((await getState(page)).breaking).toBeNull();
});

test('Phase 5 AC2.3: A jumps, X flies, B descends, the stick click sprints', async ({ page }) => {
  const pad = await padGame(page);
  const { px, pz } = await standOnPlatform(page);
  const ground = (await getState(page)).player.y;
  await pad.press(BUTTON.A);
  await step(page, 12);
  expect((await getState(page)).player.y).toBeGreaterThan(ground + 0.5);
  await pad.release(BUTTON.A);
  await step(page, 60);
  expect((await getState(page)).player.y).toBeCloseTo(ground, 5);

  await pad.tap(BUTTON.X);
  expect((await getState(page)).player.mode).toBe('fly');
  await pad.press(BUTTON.A);
  await step(page, 30);
  await pad.release(BUTTON.A);
  const high = (await getState(page)).player.y;
  await pad.press(BUTTON.B);
  await step(page, 30);
  await pad.release(BUTTON.B);
  expect((await getState(page)).player.y).toBeLessThan(high - 0.5);
  await pad.tap(BUTTON.X);
  expect((await getState(page)).player.mode).toBe('walk');
  await step(page, 120);

  /** Walks 40 steps forward from the platform's start and returns the distance. */
  const walk = async (sprint: boolean): Promise<number> => {
    await setPlayer(page, { x: px + 0.5, y: PLATFORM_Y + 1, z: pz + 0.5, yaw: 0, pitch: 0 });
    await step(page, 2);
    const from = (await getState(page)).player.z;
    if (sprint) await pad.tap(BUTTON.LS);
    await pad.stick('left', 0, -1);
    await step(page, 40);
    const distance = from - (await getState(page)).player.z;
    await pad.stick('left', 0, 0);
    return distance;
  };
  const walking = await walk(false);
  const sprinting = await walk(true);
  expect(sprinting).toBeGreaterThan(walking * 1.15);
  // Letting go of the stick ended the sprint: the next walk is a walk again.
  expect(await walk(false)).toBeCloseTo(walking, 1);
});

test('Phase 5 AC2.3: X is refused in Gathering, as F', async ({ page }) => {
  const pad = await padGame(page, { mode: 'gathering' });
  await pad.tap(BUTTON.X);
  await step(page, 5);
  expect((await getState(page)).player.mode).toBe('walk');
});

test('Phase 5 AC2.4: Y opens the inventory', async ({ page }) => {
  const pad = await padGame(page, { mode: 'gathering' });
  await pad.tap(BUTTON.Y);
  expect((await getState(page)).ui.screen).toBe('inventory');
  // In Part A, B and Y close it again.
  await pad.tap(BUTTON.Y);
  expect((await getState(page)).ui.screen).toBe('play');
  await pad.tap(BUTTON.Y);
  await pad.tap(BUTTON.B);
  expect((await getState(page)).ui.screen).toBe('play');
});

test('Phase 5 AC2.5: the press that wakes the pad does not act', async ({ page }) => {
  await installFakePads(page);
  await openGame(page);
  await standOnPlatform(page);
  const ground = (await getState(page)).player.y;
  const pad = new Pad(page);
  await pad.connect({ holding: [BUTTON.A] });
  await step(page, 12);
  expect((await getState(page)).player.y).toBeCloseTo(ground, 5);
  expect((await getState(page)).pad).toMatchObject({ connected: 1, active: false });
  await pad.release(BUTTON.A);
  await pad.press(BUTTON.A);
  await step(page, 12);
  expect((await getState(page)).player.y).toBeGreaterThan(ground + 0.5);
  await pad.release(BUTTON.A);
});

test.describe('without test mode', () => {
  test.describe.configure({ timeout: 120_000 });

  test('Phase 5 AC2.4 and AC2.6: the pad plays without pointer lock; a click hands back to the mouse', async ({
    page,
  }) => {
    await installFakePads(page);
    await openMenu(page);
    await createWorld(page);
    expect(await page.evaluate(() => document.pointerLockElement !== null)).toBe(true);
    const pad = new Pad(page);
    await pad.connect();
    await pad.stick('left', 0.6, 0);
    await pad.stick('left', 0, 0);
    let state = await getState(page);
    expect(state.pad.active).toBe(true);
    expect(state.paused).toBe(false);
    expect(await page.evaluate(() => document.pointerLockElement)).toBeNull();
    await polls(page, 5);
    expect((await getState(page)).paused).toBe(false);
    expect(await page.locator('.game-canvas').evaluate((c) => getComputedStyle(c).cursor)).toBe(
      'none',
    );

    // Looking at the ground: a click would break it if it acted.
    await setPlayer(page, { pitch: -89 * DEG });
    const target = (await getState(page)).target;
    expect(target).not.toBeNull();
    const view = page.viewportSize() ?? { width: 1280, height: 720 };
    await page.mouse.click(view.width / 2, view.height / 2);
    await page.waitForFunction(() => document.pointerLockElement !== null);
    state = await getState(page);
    expect(state.pad.active).toBe(false);
    expect(state.paused).toBe(false);
    if (target) expect(await getBlock(page, target.x, target.y, target.z)).toBe(target.id);

    // Start opens the pause menu.
    await pad.tap(BUTTON.START);
    state = await getState(page);
    expect(state.paused).toBe(true);
    expect(state.ui.screen).toBe('pause');
  });

  test('Phase 5 AC2.8: disconnecting the pad in use pauses the game', async ({ page }) => {
    await installFakePads(page);
    await openMenu(page);
    await createWorld(page);
    const pad = new Pad(page);
    await pad.connect();
    await pad.stick('left', 0, -1);
    expect((await getState(page)).pad.active).toBe(true);
    await pad.disconnect();
    const state = await getState(page);
    expect(state.paused).toBe(true);
    expect(state.pad).toMatchObject({ connected: 0, active: false });
    await expect(page.locator('.pause-hint')).toHaveText('Controller disconnected');
    // The mouse goes on as before.
    await page.locator('.pause-screen .play-button').click();
    await untilPlaying(page);
  });
});

test('Phase 5 AC2.8: disconnecting releases RT, LT and the stick; the notices show', async ({
  page,
}) => {
  await installFakePads(page);
  await openGame(page, { mode: 'gathering' });
  const pad = new Pad(page);
  await pad.connect();
  expect(await noticeText(page)).toBe('Controller connected');
  const { px, pz } = await facingPlatform(page, DIRT);
  await pad.press(BUTTON.RT);
  await pad.press(BUTTON.LT);
  await pad.stick('left', 0, -1);
  expect((await getState(page)).breaking).not.toBeNull();
  await pad.disconnect();
  expect(await noticeText(page)).toBe('Controller disconnected');
  const before = (await getState(page)).player;
  await step(page, 60);
  const state = await getState(page);
  expect(state.breaking).toBeNull();
  expect(state.player.z).toBeCloseTo(before.z, 9);
  expect(await getBlock(page, px, PLATFORM_Y, pz - 1)).toBe(DIRT);
  expect(state.pad).toMatchObject({ connected: 0, active: false });
});

test('Phase 5 AC2.8: a pad with another mapping is not supported and does nothing', async ({
  page,
}) => {
  await installFakePads(page);
  await openGame(page);
  await standOnPlatform(page);
  const ground = (await getState(page)).player.y;
  const pad = new Pad(page, { mapping: '' });
  await pad.connect({ wake: false });
  expect((await getState(page)).pad).toMatchObject({ connected: 1, unsupported: false });
  await pad.press(BUTTON.A);
  expect(await noticeText(page)).toBe('This controller is not supported');
  await pad.stick('left', 0, -1);
  await step(page, 30);
  const state = await getState(page);
  expect(state.player.y).toBeCloseTo(ground, 5);
  expect(state.pad).toMatchObject({ connected: 1, active: false, unsupported: true });
});

test.describe('touch mode', () => {
  test.use(TOUCH_DEVICE);

  test('Phase 5 AC2.7: the pad covers the touch controls; a finger uncovers them and acts on nothing', async ({
    page,
  }) => {
    await installFakePads(page);
    const fingers: Fingers = await openTouchGame(page);
    const before = (await getState(page)).render;
    const { px, pz } = await facingPlatform(page);
    const pad = new Pad(page);
    await pad.connect();
    await expect(page.locator('.touch-hud')).not.toHaveClass(/covered/);
    await pad.stick('left', 0.7, 0);
    await pad.stick('left', 0, 0);
    await expect(page.locator('.touch-hud')).toHaveClass(/covered/);

    // A finger on the Break button's place: it only brings the controls back.
    const at = await centerOf(page, '[data-touch="break"]');
    await fingers.tap(1, at.x, at.y);
    await expect(page.locator('.touch-hud')).not.toHaveClass(/covered/);
    await step(page, 5);
    expect(await getBlock(page, px, PLATFORM_Y, pz - 1)).toBe(STONE);
    const state = await getState(page);
    expect(state.pad.active).toBe(false);
    expect(state.render.pixelRatio).toBe(before.pixelRatio);
    expect(state.render.renderDistance).toBe(before.renderDistance);

    // The next tap on Break works as always.
    await fingers.tap(1, at.x, at.y);
    expect(await getBlock(page, px, PLATFORM_Y, pz - 1)).toBe(AIR);
  });
});
