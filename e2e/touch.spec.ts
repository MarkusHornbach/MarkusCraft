// Touch controls in the browser (Phase 2, part A).
import type { Page } from '@playwright/test';
import { test, expect } from './fixtures';
import {
  DEG,
  PLATFORM_Y,
  getBlock,
  getState,
  openGame,
  setBlock,
  setPlayer,
  standOnPlatform,
  step,
  whenIdle,
} from './game';
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

const AIR = 0;
const GRASS = 1;
const STONE = 3;
const BRICKS = 8;

/** Puts a finger on a touch button and returns its id for lifting it again. */
async function press(page: Page, fingers: Fingers, id: number, button: string): Promise<void> {
  const centre = await centerOf(page, `.touch-${button}`);
  await fingers.touchDown(id, centre.x, centre.y);
}

test('break removes the block at the crosshair, place puts the selected one (AC2.1)', async ({
  page,
}) => {
  const fingers = await openTouchGame(page);
  const { px, pz } = await standOnPlatform(page);
  // Look down at the platform block in front of the feet.
  await setPlayer(page, { pitch: -50 * DEG });
  const row = (): Promise<number[]> =>
    Promise.all([1, 2, 3, 4].map((dz) => getBlock(page, px, PLATFORM_Y, pz - dz)));
  expect((await getState(page)).target).toMatchObject({ x: px, y: PLATFORM_Y, z: pz - 1 });

  await press(page, fingers, 1, 'break');
  await fingers.touchUp(1);
  expect(await row()).toEqual([AIR, STONE, STONE, STONE]);

  // The side of the next block is targeted now; placing fills the hole with bricks.
  expect((await getState(page)).target).toMatchObject({ z: pz - 2, face: [0, 0, 1] });
  const slot = await centerOf(page, '.hotbar-slot[data-slot="8"]');
  await fingers.tap(1, slot.x, slot.y);
  await press(page, fingers, 1, 'place');
  await fingers.touchUp(1);
  expect(await row()).toEqual([BRICKS, STONE, STONE, STONE]);

  // Holding break repeats every 15 steps: the press and 40 steps break two blocks.
  await press(page, fingers, 1, 'break');
  expect(await row()).toEqual([AIR, STONE, STONE, STONE]);
  await step(page, 40);
  expect((await row()).filter((id) => id === AIR).length).toBeGreaterThanOrEqual(2);
  await fingers.touchUp(1);

  // Released: nothing more breaks.
  const after = await row();
  await step(page, 40);
  expect(await row()).toEqual(after);
});

test('up jumps, fly switches the mode, up and down change height when flying (AC2.2)', async ({
  page,
}) => {
  const fingers = await openTouchGame(page);
  await standOnPlatform(page);

  await press(page, fingers, 1, 'up');
  await step(page, 10);
  await fingers.touchUp(1);
  let { player } = await getState(page);
  expect(player.mode).toBe('walk');
  expect(player.onGround).toBe(false);
  expect(player.y).toBeGreaterThan(PLATFORM_Y + 1.5);
  await step(page, 60);
  expect((await getState(page)).player.y).toBe(PLATFORM_Y + 1);

  await press(page, fingers, 1, 'fly');
  await fingers.touchUp(1);
  expect((await getState(page)).player.mode).toBe('fly');
  await step(page, 1);
  await expect(page.locator('.touch-fly')).toHaveClass(/active/);

  await press(page, fingers, 1, 'up');
  await step(page, 30);
  await fingers.touchUp(1);
  await step(page, 30);
  ({ player } = await getState(page));
  const high = player.y;
  expect(high).toBeGreaterThan(PLATFORM_Y + 4);
  // Flying: the player keeps the height when nothing is pressed.
  await step(page, 30);
  expect((await getState(page)).player.y).toBe(high);

  await press(page, fingers, 1, 'down');
  await step(page, 20);
  await fingers.touchUp(1);
  await step(page, 30);
  expect((await getState(page)).player.y).toBeLessThan(high - 1.5);

  await press(page, fingers, 1, 'fly');
  await fingers.touchUp(1);
  expect((await getState(page)).player.mode).toBe('walk');
  await step(page, 1);
  await expect(page.locator('.touch-fly')).not.toHaveClass(/active/);
});

test('tapping slot 5 of the block bar selects slot 5 (AC2.3)', async ({ page }) => {
  const fingers = await openTouchGame(page);
  expect((await getState(page)).selectedSlot).toBe(1);
  const slot = await centerOf(page, '.hotbar-slot[data-slot="5"]');
  await fingers.tap(1, slot.x, slot.y);
  expect((await getState(page)).selectedSlot).toBe(5);
  await expect(page.locator('.hotbar-slot.selected')).toHaveAttribute('data-slot', '5');
  await expect(page.locator('.hotbar-label')).toHaveText('Log');
  // A tap on the bar neither moves nor turns the player, and breaks nothing.
  const { player } = await getState(page);
  expect(player.yaw).toBe(0);
  expect(player.pitch).toBe(0);
});

test('three fingers: stick moves, a drag turns, break breaks (AC2.4)', async ({ page }) => {
  const fingers = await openTouchGame(page);
  const { px, pz } = await standOnPlatform(page);
  // A wall block ahead at eye height, in reach after the turn below.
  // The player drifts from column pz into pz - 1 meanwhile, so the wall covers both.
  await setBlock(page, px - 3, PLATFORM_Y + 2, pz, BRICKS);
  await setBlock(page, px - 3, PLATFORM_Y + 2, pz - 1, BRICKS);

  await fingers.touchDown(1, STICK.x, STICK.y);
  await fingers.touchDown(2, LOOK.x, LOOK.y);
  // Strafe right slowly (towards -Z after the turn), turn 90° left to face -X.
  await fingers.touchMove(1, STICK.x + 20, STICK.y, 2);
  await fingers.touchMove(2, LOOK.x - (90 * DEG) / 0.004, LOOK.y, 6);
  await whenIdle(page);
  await step(page, 30);
  let state = await getState(page);
  expect(state.player.yaw).toBeCloseTo(90 * DEG, 5);
  expect(pz + 0.5 - state.player.z).toBeGreaterThan(0.4);
  expect(pz + 0.5 - state.player.z).toBeLessThan(0.95);
  const target = state.target;
  expect(target).toMatchObject({ x: px - 3, y: PLATFORM_Y + 2, id: BRICKS });
  if (!target) throw new Error('no target');

  await press(page, fingers, 3, 'break');
  expect(await getBlock(page, target.x, target.y, target.z)).toBe(AIR);
  // The other two fingers keep working while the third rests on the button.
  const z = state.player.z;
  await fingers.touchMove(2, LOOK.x - (90 * DEG) / 0.004 - 50, LOOK.y, 2);
  await whenIdle(page);
  await step(page, 10);
  state = await getState(page);
  expect(state.player.yaw).toBeCloseTo(90 * DEG + 0.2, 5);
  expect(state.player.z).not.toBe(z);
  await fingers.touchUp(3);
  await fingers.touchUp(2);
  await fingers.touchUp(1);
});

test('buttons do not turn the view; stick and look area do not break or place (AC2.5)', async ({
  page,
}) => {
  const fingers = await openTouchGame(page);
  const { px, pz } = await standOnPlatform(page);
  await setPlayer(page, { pitch: -50 * DEG });
  const before = await getState(page);
  expect(before.target).toMatchObject({ x: px, y: PLATFORM_Y, z: pz - 1 });

  // A drag that starts on a button and wanders over the look area.
  for (const button of ['up', 'down', 'fly', 'place']) {
    await press(page, fingers, 1, button);
    await fingers.touchMove(1, LOOK.x - 150, LOOK.y - 80, 4);
    await fingers.touchUp(1);
    await whenIdle(page);
    const { player } = await getState(page);
    expect([button, player.yaw, player.pitch]).toEqual([button, before.player.yaw, -50 * DEG]);
  }
  // Fly was toggled once by its button; the placed block (slot 1, grass) is the only edit.
  expect((await getState(page)).player.mode).toBe('fly');
  expect(await getBlock(page, px, PLATFORM_Y + 1, pz - 1)).toBe(GRASS);
  await setBlock(page, px, PLATFORM_Y + 1, pz - 1, AIR);

  // Fingers on the stick and in the look area, also when they pass over buttons.
  const breakButton = await centerOf(page, '.touch-break');
  const placeButton = await centerOf(page, '.touch-place');
  await fingers.touchDown(1, STICK.x, STICK.y);
  await fingers.touchDown(2, LOOK.x, 120);
  await fingers.touchMove(2, breakButton.x, breakButton.y, 4);
  await fingers.touchMove(2, placeButton.x, placeButton.y, 2);
  await fingers.touchMove(1, placeButton.x, placeButton.y, 4);
  await step(page, 40);
  await fingers.touchUp(1);
  await fingers.touchUp(2);
  for (let dz = 0; dz <= 4; dz++) {
    expect(await getBlock(page, px, PLATFORM_Y, pz - dz)).toBe(STONE);
    expect(await getBlock(page, px, PLATFORM_Y + 1, pz - dz)).toBe(AIR);
  }
});
