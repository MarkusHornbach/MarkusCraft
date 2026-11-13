// Touch controls in the browser (Phase 2, part A).
import { test, expect } from './fixtures';
import { DEG, PLATFORM_Y, getState, openGame, standOnPlatform, step, whenIdle } from './game';
import { TOUCH_DEVICE, Fingers, centerOf, openTouchGame } from './touch';

test.use(TOUCH_DEVICE);

/** A point in the stick zone (lower left) and one in the look area (right half). */
const STICK = { x: 160, y: 400 };
const LOOK = { x: 700, y: 250 };

test('the stick moves the player along the facing direction (AC1.2)', async ({ page }) => {
  const fingers = await openTouchGame(page);
  const { px, pz } = await standOnPlatform(page);
  expect((await getState(page)).touch).toBe(true);

  await expect(page.locator('.touch-stick')).toBeHidden();
  await fingers.touchDown(1, STICK.x, STICK.y);
  await expect(page.locator('.touch-stick')).toBeVisible();
  // Full deflection forward: sprinting towards -Z for one second.
  await fingers.touchMove(1, STICK.x, STICK.y - 80, 4);
  await step(page, 60);
  let { player } = await getState(page);
  expect(pz + 0.5 - player.z).toBeGreaterThan(5.0);
  expect(pz + 0.5 - player.z).toBeLessThan(5.7);
  expect(player.x).toBeCloseTo(px + 0.5, 5);

  // Released: the stick disappears and the player stops.
  await fingers.touchUp(1);
  await step(page, 30);
  await expect(page.locator('.touch-stick')).toBeHidden();
  const stopped = (await getState(page)).player.z;
  await step(page, 30);
  expect((await getState(page)).player.z).toBe(stopped);

  // Half deflection to the right: walking at half speed towards +X.
  await fingers.touchDown(1, STICK.x, STICK.y);
  await fingers.touchMove(1, STICK.x + 30, STICK.y, 3);
  await step(page, 60);
  ({ player } = await getState(page));
  expect(player.x - (px + 0.5)).toBeGreaterThan(1.9);
  expect(player.x - (px + 0.5)).toBeLessThan(2.2);
  expect(player.z).toBeCloseTo(stopped, 5);
  await fingers.touchUp(1);
});

test('dragging on the right half looks around like the mouse (AC1.2)', async ({ page }) => {
  const fingers = await openTouchGame(page);
  await standOnPlatform(page);

  await fingers.touchDown(1, LOOK.x, LOOK.y);
  await fingers.touchMove(1, LOOK.x + 100, LOOK.y - 50, 5);
  await whenIdle(page);
  let { player } = await getState(page);
  // Dragging right turns right (yaw decreases), dragging up looks up: as with the mouse.
  expect(player.yaw).toBeCloseTo(-0.4, 5);
  expect(player.pitch).toBeCloseTo(0.2, 5);

  // The mouse-style test API call has the same signs.
  await page.evaluate(() => window.__mc.look(40, -40));
  ({ player } = await getState(page));
  expect(player.yaw).toBeCloseTo(-0.5, 5);
  expect(player.pitch).toBeCloseTo(0.3, 5);

  // Pitch stays clamped however far the finger travels.
  await fingers.touchMove(1, LOOK.x + 100, LOOK.y - 1050, 10);
  await whenIdle(page);
  expect((await getState(page)).player.pitch).toBeCloseTo(89 * DEG, 5);
  await fingers.touchMove(1, LOOK.x + 100, LOOK.y + 1500, 10);
  await whenIdle(page);
  ({ player } = await getState(page));
  expect(player.pitch).toBeCloseTo(-89 * DEG, 5);
  await fingers.touchUp(1);

  // A lifted finger no longer turns the view; a drag on the left half never does.
  const yaw = player.yaw;
  await fingers.touchDown(2, 200, 100);
  await fingers.touchMove(2, 400, 120, 3);
  await fingers.touchUp(2);
  await whenIdle(page);
  expect((await getState(page)).player.yaw).toBe(yaw);
});

test('stick and look drag work at the same time with two fingers (AC1.3)', async ({ page }) => {
  const fingers = await openTouchGame(page);
  const { px, pz } = await standOnPlatform(page);

  await fingers.touchDown(1, STICK.x, STICK.y);
  await fingers.touchDown(2, LOOK.x, LOOK.y);
  await fingers.touchMove(1, STICK.x, STICK.y - 40, 2);
  // 90° to the left: forward now points towards -X.
  await fingers.touchMove(2, LOOK.x - (90 * DEG) / 0.004, LOOK.y, 6);
  await whenIdle(page);
  expect((await getState(page)).player.yaw).toBeCloseTo(90 * DEG, 5);
  await step(page, 60);
  const { player } = await getState(page);
  expect(px + 0.5 - player.x).toBeGreaterThan(2.5);
  expect(player.z).toBeCloseTo(pz + 0.5, 3);
  expect(player.y).toBe(PLATFORM_Y + 1);

  // Lifting the look finger keeps the stick working.
  await fingers.touchUp(2);
  const x = player.x;
  await step(page, 30);
  expect((await getState(page)).player.x).toBeLessThan(x - 1);
  await fingers.touchUp(1);
});

test('"Tap to play" starts the game without pointer lock; the menu button pauses (AC1.4)', async ({
  page,
}) => {
  await page.goto('/?seed=1337&time=0.25');
  await page.waitForFunction(() => window.__mc !== undefined);
  await whenIdle(page);
  const before = await getState(page);
  expect(before.paused).toBe(true);
  await expect(page.locator('.play-button')).toHaveText('Tap to play');
  await expect(page.locator('.touch-hud')).toBeHidden();

  await page.locator('.play-button').tap();
  await page.waitForFunction(() => !window.__mc.getState().paused);
  await expect(page.locator('.pause-screen')).toBeHidden();
  await expect(page.locator('.touch-hud')).toBeVisible();
  await expect(page.locator('.touch-menu')).toBeVisible();
  await expect(page.locator('.crosshair')).toBeVisible();
  expect(await page.evaluate(() => document.pointerLockElement)).toBeNull();
  expect((await getState(page)).touch).toBe(true);

  // The real-time loop runs: the clock advances and the stick moves the player.
  const fingers = new Fingers(page);
  await fingers.touchDown(1, STICK.x, STICK.y);
  await fingers.touchMove(1, STICK.x, STICK.y - 80, 4);
  await page.waitForFunction(
    ([time, z]) => {
      const state = window.__mc.getState();
      return state.time > time && Math.abs(state.player.z - z) > 0.5;
    },
    [before.time, before.player.z],
  );

  // The menu button opens the menu and pauses, even with a finger still on the stick.
  const menu = await centerOf(page, '.touch-menu');
  await fingers.tap(2, menu.x, menu.y);
  await page.waitForFunction(() => window.__mc.getState().paused);
  await expect(page.locator('.pause-screen')).toBeVisible();
  await expect(page.locator('.play-button')).toHaveText('Tap to continue');
  await expect(page.locator('.touch-hud')).toBeHidden();
  await fingers.touchUp(1);
  const paused = await getState(page);
  await whenIdle(page);
  await whenIdle(page);
  const later = await getState(page);
  expect(later.time).toBe(paused.time);
  expect(later.player).toEqual(paused.player);

  // Continue: the held stick was forgotten. The player only loses the speed they had
  // when the menu opened and then stands still.
  await page.locator('.play-button').tap();
  // 0.001 of a day is 1.2 s of running clock.
  await page.waitForFunction(
    (time) => !window.__mc.getState().paused && window.__mc.getState().time > time + 0.001,
    paused.time,
  );
  const resumed = await getState(page);
  expect(Math.abs(resumed.player.z - paused.player.z)).toBeLessThan(0.5);
  await whenIdle(page);
  expect((await getState(page)).player.z).toBe(resumed.player.z);
});

test.describe('with a mouse', () => {
  test.use({ hasTouch: false, isMobile: false });

  test('in mouse mode no touch control is in the document (AC1.5)', async ({ page }) => {
    await openGame(page);
    expect((await getState(page)).touch).toBe(false);
    await expect(page.locator('.touch-hud, .touch-button, .touch-stick, [data-touch]')).toHaveCount(
      0,
    );
    await expect(page.locator('.rotate-overlay')).toHaveCount(0);

    // The same holds for the start screen and after starting with a mouse click.
    await page.goto('/?seed=1337');
    await page.waitForFunction(() => window.__mc !== undefined);
    await expect(page.locator('.play-button')).toHaveText('Click to play');
    await page.locator('.play-button').click();
    await page.waitForFunction(() => !window.__mc.getState().paused);
    expect((await getState(page)).touch).toBe(false);
    await expect(page.locator('.touch-hud, [data-touch], .rotate-overlay')).toHaveCount(0);
    await expect(page.locator('#setting-touch-sensitivity, #setting-debug')).toHaveCount(0);
  });
});
