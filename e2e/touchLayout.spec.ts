// Phone and tablet adaptation of the touch controls (Phase 2, part A, step 3).
import type { Page } from '@playwright/test';
import { test, expect } from './fixtures';
import { getState, whenIdle } from './game';
import { TOUCH_DEVICE, Fingers, centerOf, openTouchGame, withoutFullscreen } from './touch';

test.use(TOUCH_DEVICE);

const STORAGE_KEY = 'markuscraft.settings.v1';
const PHONE = { width: 640, height: 360 };
const TABLET = { width: 1280, height: 800 };

interface Box {
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Opens the game like a player on a touch device: start screen first, no test mode. */
async function openOnDevice(page: Page, query = '?seed=1337&time=0.25'): Promise<void> {
  await withoutFullscreen(page);
  await page.goto(`/${query}`);
  await page.waitForFunction(() => window.__mc !== undefined);
  // The form is reset when the list of stored worlds arrives.
  await page.locator('.world-menu[data-ready]').waitFor();
}

/** Creates a world from the form of the world menu (Phase 3) and starts it by tap. */
async function tapCreate(page: Page): Promise<void> {
  // A Creative world: these tests are about all controls, the fly button included.
  await page.locator('.world-mode-button[data-mode="creative"]').tap();
  await page.locator('.world-create-button').tap();
  await page.waitForFunction(() => !window.__mc.getState().paused);
}

/** Opens the pause menu with the on-screen menu button. */
async function tapMenu(page: Page): Promise<void> {
  await page.locator('.touch-menu').tap();
  await page.waitForFunction(() => window.__mc.getState().paused);
}

async function tapPlay(page: Page): Promise<void> {
  await page.locator('.play-button:visible').tap();
  await page.waitForFunction(() => !window.__mc.getState().paused);
}

/** Bounding boxes of all visible elements that match the selector. */
function boxes(page: Page, selector: string): Promise<Box[]> {
  return page.evaluate((sel) => {
    const result: Box[] = [];
    for (const node of document.querySelectorAll<HTMLElement>(sel)) {
      const r = node.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const name = node.dataset.touch ?? node.dataset.slot ?? node.id ?? '';
      result.push({
        name: `${node.className} ${name}`.trim(),
        x: r.x,
        y: r.y,
        width: r.width,
        height: r.height,
      });
    }
    return result;
  }, selector);
}

function overlap(a: Box, b: Box): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

function expectInside(list: Box[], view: { width: number; height: number }): void {
  for (const box of list) {
    expect(box.x, box.name).toBeGreaterThanOrEqual(0);
    expect(box.y, box.name).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width, box.name).toBeLessThanOrEqual(view.width);
    expect(box.y + box.height, box.name).toBeLessThanOrEqual(view.height);
  }
}

function expectFingerSized(list: Box[]): void {
  for (const box of list) {
    expect(box.width, box.name).toBeGreaterThanOrEqual(48);
    expect(box.height, box.name).toBeGreaterThanOrEqual(48);
  }
}

function expectNoOverlap(list: Box[]): void {
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      expect(overlap(list[i], list[j]), `${list[i].name} / ${list[j].name}`).toBe(false);
    }
  }
}

for (const [device, view] of [
  ['phone', PHONE],
  ['tablet', TABLET],
] as const) {
  test(`controls and menu buttons fit a ${view.width} × ${view.height} ${device} (AC3.1)`, async ({
    page,
  }) => {
    await page.setViewportSize(view);
    await openOnDevice(page);

    await tapCreate(page);
    await tapMenu(page);
    // The pause menu: every button is on screen, finger-sized and free of its neighbours.
    const menuButtons = await boxes(page, '.pause-screen button');
    expect(menuButtons.map((b) => b.name)).toEqual([
      'play-button',
      'menu-button back-button',
      'copy-link-button',
      'fullscreen-button',
    ]);
    expectInside(menuButtons, view);
    expectFingerSized(menuButtons);
    const inputs = await boxes(page, '.pause-screen input');
    expect(inputs.length).toBeGreaterThanOrEqual(4);
    expectInside(inputs, view);
    expectNoOverlap([...menuButtons, ...inputs]);
    // Nothing of the menu is cut off: the panel fits without scrolling.
    expectInside(await boxes(page, '.pause-panel'), view);

    await tapPlay(page);
    const buttons = await boxes(page, '.touch-button');
    expect(buttons.map((b) => b.name.split(' ').pop()).sort()).toEqual([
      'bag',
      'break',
      'down',
      'fly',
      'menu',
      'place',
      'up',
    ]);
    const slots = await boxes(page, '.hotbar-slot');
    expect(slots).toHaveLength(9);
    expectInside([...buttons, ...slots], view);
    expectFingerSized([...buttons, ...slots]);
    // Buttons overlap neither each other nor the block bar nor the crosshair.
    const bar = await boxes(page, '.hotbar');
    const crosshair = await boxes(page, '.crosshair');
    expectInside(bar, view);
    expectNoOverlap([...buttons, ...bar, ...crosshair]);
    expectNoOverlap(slots);

    // Sizes follow the shorter screen side.
    const size = buttons[0].width;
    expect(size).toBeCloseTo(Math.min(88, Math.max(48, 0.15 * view.height)), 0);
  });
}

test('portrait shows the rotate overlay and pauses; landscape removes it (AC3.2)', async ({
  page,
}) => {
  await page.setViewportSize(PHONE);
  await openOnDevice(page);
  await expect(page.locator('.rotate-overlay')).toBeHidden();
  await tapCreate(page);

  await page.setViewportSize({ width: 360, height: 640 });
  await expect(page.locator('.rotate-overlay')).toBeVisible();
  await expect(page.locator('.rotate-overlay')).toContainText('rotate your device');
  await page.waitForFunction(() => window.__mc.getState().paused);
  const before = await getState(page);
  await whenIdle(page);
  await whenIdle(page);
  expect((await getState(page)).time).toBe(before.time);
  // The overlay covers the whole view, so nothing behind it can be tapped.
  const [overlay] = await boxes(page, '.rotate-overlay');
  expect(overlay).toMatchObject({ x: 0, y: 0, width: 360, height: 640 });

  await page.setViewportSize(PHONE);
  await expect(page.locator('.rotate-overlay')).toBeHidden();
  await expect(page.locator('.play-button:visible')).toHaveText('Tap to continue');
  await tapPlay(page);
  await page.waitForFunction((time) => window.__mc.getState().time > time, before.time);

  // Starting upright: the overlay is there from the beginning.
  await page.setViewportSize({ width: 360, height: 640 });
  await page.reload();
  await page.waitForFunction(() => window.__mc !== undefined);
  await expect(page.locator('.rotate-overlay')).toBeVisible();
  expect((await getState(page)).paused).toBe(true);
});

test('pinch, swipe and long press do not zoom, scroll or open a menu (AC3.3)', async ({ page }) => {
  const fingers = await openTouchGame(page);
  await page.evaluate(() => {
    const seen: boolean[] = [];
    (window as unknown as { __menus: boolean[] }).__menus = seen;
    // Registered on the window: runs after the game's own handler on the way up.
    window.addEventListener('contextmenu', (e) => seen.push(e.defaultPrevented));
  });
  const view = (): Promise<{ scale: number; x: number; y: number; top: number }> =>
    page.evaluate(() => ({
      scale: window.visualViewport?.scale ?? 1,
      x: window.scrollX,
      y: window.scrollY,
      top: document.scrollingElement?.scrollTop ?? 0,
    }));
  const still = { scale: 1, x: 0, y: 0, top: 0 };
  expect(await view()).toEqual(still);

  // Pinch out and in again with two fingers on the right half.
  await fingers.touchDown(1, 600, 270);
  await fingers.touchDown(2, 680, 270);
  await fingers.touchMove(1, 500, 200, 5);
  await fingers.touchMove(2, 900, 340, 5);
  expect(await view()).toEqual(still);
  await fingers.touchMove(2, 520, 210, 5);
  await fingers.touchUp(1);
  await fingers.touchUp(2);
  expect(await view()).toEqual(still);

  // Vertical swipes: down from the top edge (pull-to-refresh) and up from the bottom.
  await fingers.touchDown(1, 700, 5);
  await fingers.touchMove(1, 700, 500, 8);
  await fingers.touchUp(1);
  await fingers.touchDown(1, 700, 530);
  await fingers.touchMove(1, 700, 40, 8);
  await fingers.touchUp(1);
  expect(await view()).toEqual(still);
  expect(new URL(page.url()).searchParams.get('touch')).toBe('1');

  // A long press, on the view and on a button. The browser's own long-press timer runs
  // here, so this is the one place that has to wait for real time.
  const button = await centerOf(page, '.touch-place');
  for (const spot of [{ x: 700, y: 200 }, button]) {
    await fingers.touchDown(1, spot.x, spot.y);
    await page.waitForTimeout(1200);
    await fingers.touchUp(1);
  }
  // Whether or not the emulation produced a menu request, none got through; and a request
  // sent directly is refused as well.
  await page.locator('.game-canvas').dispatchEvent('contextmenu');
  await page.locator('.touch-break').dispatchEvent('contextmenu');
  const menus = await page.evaluate(() => (window as unknown as { __menus: boolean[] }).__menus);
  expect(menus.length).toBeGreaterThanOrEqual(2);
  expect(menus.every((prevented) => prevented)).toBe(true);
  expect(await page.evaluate(() => window.getSelection()?.toString() ?? '')).toBe('');
});

test('the touch menu has fullscreen, debug overlay and touch sensitivity (AC3.4)', async ({
  page,
}) => {
  await page.setViewportSize({ width: 960, height: 540 });
  await openOnDevice(page);
  await tapCreate(page);
  await tapMenu(page);
  const menu = page.locator('.pause-screen');
  await expect(menu.locator('.fullscreen-button')).toHaveText('Fullscreen');
  await expect(menu).toContainText('Debug overlay');
  await expect(menu).toContainText('Touch sensitivity');
  await expect(menu).not.toContainText('Mouse sensitivity');
  await expect(menu.locator('#setting-sensitivity')).toHaveCount(0);

  // The controls list names the touch controls instead of keys.
  const list = menu.locator('.controls-list');
  for (const text of [
    'stick',
    'Drag right side',
    'Break / Place',
    'Up',
    'Down',
    'Fly',
    'Bag',
    'Menu',
  ]) {
    await expect(list).toContainText(text);
  }
  await expect(list.locator('dt')).toHaveCount(9);
  await expect(list).not.toContainText('W A S D');
  await expect(list).not.toContainText('F3');

  // The debug switch replaces F3.
  await expect(page.locator('.debug-overlay')).toBeHidden();
  await menu.locator('#setting-debug').tap();
  await expect(menu.locator('#setting-debug')).toBeChecked();
  await expect(page.locator('.debug-overlay')).toBeVisible();
  await tapPlay(page);
  await expect(page.locator('.debug-overlay')).toBeVisible();
  await expect(page.locator('[data-debug="seed"]')).toHaveText('1337');
  // The overlay does not hide under the menu button.
  const [overlay] = await boxes(page, '.debug-overlay');
  const [menuButton] = await boxes(page, '.touch-menu');
  expect(overlap(overlay, menuButton)).toBe(false);

  // The same drag at sensitivity 1 and 2: twice the turn.
  const fingers = new Fingers(page);
  const drag = async (): Promise<number> => {
    const from = (await getState(page)).player.yaw;
    await fingers.touchDown(1, 600, 250);
    await fingers.touchMove(1, 700, 250, 5);
    await fingers.touchUp(1);
    await whenIdle(page);
    return (await getState(page)).player.yaw - from;
  };
  const single = await drag();
  expect(single).toBeCloseTo(-0.4, 5);

  const menuCentre = await centerOf(page, '.touch-menu');
  await fingers.tap(1, menuCentre.x, menuCentre.y);
  await page.waitForFunction(() => window.__mc.getState().paused);
  await expect(menu.locator('#setting-touch-sensitivity')).toHaveValue('1');
  await menu.locator('#setting-touch-sensitivity').evaluate((node) => {
    const input = node as HTMLInputElement;
    input.value = '2';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await tapPlay(page);
  const double = await drag();
  expect(double / single).toBeGreaterThan(1.9);
  expect(double / single).toBeLessThan(2.1);

  // The setting is stored and survives a reload.
  expect(
    await page.evaluate((key) => JSON.parse(window.localStorage.getItem(key) ?? '{}'), STORAGE_KEY),
  ).toMatchObject({ touchSensitivity: 2 });
  await page.reload();
  await page.waitForFunction(() => window.__mc !== undefined);
  await expect(menu.locator('#setting-touch-sensitivity')).toHaveValue('2');
});

test.describe('on a high-density screen', () => {
  test.use({ viewport: PHONE, deviceScaleFactor: 3 });

  test('touch mode defaults: render distance 5, pixel ratio at most 1.5 (AC3.5)', async ({
    page,
  }) => {
    await openOnDevice(page);
    expect(await page.evaluate(() => window.devicePixelRatio)).toBe(3);
    let state = await getState(page);
    expect(state.touch).toBe(true);
    expect(state.render.renderDistance).toBe(5);
    expect(state.render.pixelRatio).toBe(1.5);
    await expect(page.locator('#setting-render-distance')).toHaveValue('5');
    const canvas = await page.evaluate(() => {
      const node = document.querySelector<HTMLCanvasElement>('.game-canvas');
      return [node?.width, node?.height];
    });
    expect(canvas).toEqual([960, 540]);
    // A default is not a choice: nothing was stored.
    expect(await page.evaluate((key) => window.localStorage.getItem(key), STORAGE_KEY)).toBeNull();

    // A stored render distance wins over the touch default.
    await page.evaluate(
      ([key, value]) => window.localStorage.setItem(key, value),
      [STORAGE_KEY, JSON.stringify({ renderDistance: 3, mouseSensitivity: 1, fov: 75 })],
    );
    await page.reload();
    await page.waitForFunction(() => window.__mc !== undefined);
    state = await getState(page);
    expect(state.render.renderDistance).toBe(3);
    expect(state.render.pixelRatio).toBe(1.5);
    await expect(page.locator('#setting-render-distance')).toHaveValue('3');
    await tapCreate(page);
    await whenIdle(page);
    expect((await getState(page)).chunks.loaded).toBe(49);
  });
});

test('matches the touch-controls reference; controls leave crosshair and bar free (AC3.7)', async ({
  page,
}) => {
  const fingers = await openTouchGame(page);
  // Thumb on the stick, pushed up and to the right, so the stick is in the picture.
  await fingers.touchDown(1, 150, 380);
  await fingers.touchMove(1, 180, 345, 3);
  await whenIdle(page);
  await expect(page.locator('.touch-stick')).toBeVisible();

  const buttons = await boxes(page, '.touch-button');
  const stick = await boxes(page, '.touch-stick');
  const bar = await boxes(page, '.hotbar');
  const crosshair = await boxes(page, '.crosshair');
  expect(buttons).toHaveLength(7);
  for (const control of [...buttons, ...stick]) {
    expect(overlap(control, bar[0]), control.name).toBe(false);
    expect(overlap(control, crosshair[0]), control.name).toBe(false);
  }
  // Every button shows a symbol drawn by code: its canvas has painted pixels.
  const painted = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLCanvasElement>('.touch-symbol')].map((canvas) => {
      const data = canvas.getContext('2d')?.getImageData(0, 0, canvas.width, canvas.height).data;
      let count = 0;
      if (data) for (let i = 3; i < data.length; i += 4) if (data[i] > 128) count++;
      return count / (canvas.width * canvas.height);
    }),
  );
  expect(painted).toHaveLength(7);
  for (const share of painted) {
    expect(share).toBeGreaterThan(0.05);
    expect(share).toBeLessThan(0.6);
  }

  await expect(page).toHaveScreenshot('touch-controls.png');
  await fingers.touchUp(1);
});
