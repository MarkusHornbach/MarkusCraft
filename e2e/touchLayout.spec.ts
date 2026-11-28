// Phone and tablet adaptation of the touch controls (Phase 2, part A, step 3).
import type { Page } from '@playwright/test';
import { test, expect } from './fixtures';
import { getState, whenIdle } from './game';
import { expectPartOfSixthRow, expectRowsNeverMove } from './recipeRows';
import { TOUCH_DEVICE, Fingers, centerOf, openTouchGame, swipe, withoutFullscreen } from './touch';

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
async function tapCreate(page: Page, mode: 'creative' | 'gathering' = 'creative'): Promise<void> {
  // A Creative world by default: these tests are about all controls, the fly button included.
  await page.locator(`.world-mode-button[data-mode="${mode}"]`).tap();
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
    // "Your player" and "Playing together" (Phase 6) are the last sections and reached by
    // scrolling on a phone (Phase 6 AC7.13, AC13.5); everything else fits without scrolling.
    const menuButtons = await boxes(
      page,
      '.pause-screen button:not(.room-panel button):not(.player-section button)',
    );
    expect(menuButtons.map((b) => b.name)).toEqual([
      'play-button',
      'menu-button back-button',
      'copy-link-button',
      'fullscreen-button',
    ]);
    expectInside(menuButtons, view);
    expectFingerSized(menuButtons);
    const inputs = await boxes(page, '.pause-screen input:not(.player-section input)');
    expect(inputs.length).toBeGreaterThanOrEqual(5);
    expectInside(inputs, view);
    expectNoOverlap([...menuButtons, ...inputs]);
    // Nothing of the menu is cut off: the panel fits without scrolling.
    expectInside(
      await boxes(
        page,
        '.pause-buttons, .controls-list, .pause-right > .pause-section:not(.room-panel):not(.player-section)',
      ),
      view,
    );
    expect(await page.evaluate(() => document.scrollingElement?.scrollTop)).toBe(0);

    // Phase 4 AC4.3: the Brightness slider is as large as the other sliders and follows
    // a finger: a tap at three quarters of its length sets about 75 %.
    const brightness = inputs.find((box) => box.name.endsWith('setting-brightness'));
    const other = inputs.find((box) => box.name.endsWith('setting-fov'));
    if (!brightness || !other) throw new Error('slider missing');
    expect(brightness.width).toBe(other.width);
    expect(brightness.height).toBe(other.height);
    expect((await getState(page)).settings.brightness).toBe(0.5);
    await page.touchscreen.tap(
      brightness.x + brightness.width * 0.75,
      brightness.y + brightness.height / 2,
    );
    const chosen = (await getState(page)).settings.brightness;
    expect(chosen).toBeGreaterThan(0.65);
    expect(chosen).toBeLessThan(0.85);
    await expect(page.locator('#setting-brightness')).toHaveValue(String(chosen));
    expect(
      await page.evaluate(
        (key) => JSON.parse(window.localStorage.getItem(key) ?? '{}'),
        STORAGE_KEY,
      ),
    ).toMatchObject({ brightness: chosen });

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

// --- Phase 3 step 8: the inventory screen on a phone and a tablet --------------------

for (const [device, view] of [
  ['phone', PHONE],
  ['tablet', TABLET],
] as const) {
  test(`Phase 3 AC8.5: the bag button opens an inventory that fits a ${view.width} × ${view.height} ${device} and works by taps`, async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await page.setViewportSize(view);
    await page.addInitScript(
      ([key, value]) => window.localStorage.setItem(key, value),
      [STORAGE_KEY, JSON.stringify({ renderDistance: 2, mouseSensitivity: 1, fov: 75 })],
    );
    await openOnDevice(page);
    await tapCreate(page, 'gathering');
    // No fly button in Gathering; the bag button is finger-sized and on screen.
    await expect(page.locator('.touch-fly')).toHaveCount(0);
    const bag = await boxes(page, '.touch-bag');
    expect(bag).toHaveLength(1);
    expectFingerSized(bag);
    expectInside(bag, view);
    expectNoOverlap(await boxes(page, '.touch-button'));

    await page.evaluate(() => {
      window.__mc.give(2, 40);
      window.__mc.give(4, 5);
      window.__mc.give(256, 3);
    });
    await page.locator('.touch-bag').tap();
    await expect(page.locator('.inventory-screen')).toBeVisible();
    expect((await getState(page)).paused).toBe(false);

    const slots = await boxes(page, '.inventory-screen .inv-slot');
    // 27 slots, the bar and the bin.
    expect(slots).toHaveLength(37);
    const close = await boxes(page, '.inventory-close');
    expect(close).toHaveLength(1);
    expectFingerSized([...slots, ...close]);
    expectInside([...slots, ...close], view);
    expectNoOverlap([...slots, ...close]);
    // The whole panel fits: nothing has to be scrolled.
    expectInside(await boxes(page, '.inventory-panel'), view);
    const scrolls = await page
      .locator('.inventory-screen')
      .evaluate((node) => node.scrollHeight > node.clientHeight);
    expect(scrolls).toBe(false);

    const slot = (index: number) => page.locator(`.inv-slot[data-index="${index}"]`);
    const items = async () => (await getState(page)).inventory.slots;
    // Move, merge, swap, bin and release, all by taps.
    await slot(0).tap();
    await expect(slot(0)).toHaveClass(/picked/);
    await slot(35).tap();
    expect((await items())[35]).toEqual({ item: 2, count: 40 });
    expect((await items())[0]).toBeNull();
    await page.evaluate(() => window.__mc.give(2, 70));
    await slot(35).tap();
    await slot(0).tap();
    expect((await items())[0]).toEqual({ item: 2, count: 99 });
    expect((await items())[35]).toEqual({ item: 2, count: 11 });
    await slot(1).tap();
    await slot(2).tap();
    expect((await items())[1]).toEqual({ item: 256, count: 3 });
    expect((await items())[2]).toEqual({ item: 4, count: 5 });
    await slot(2).tap();
    await page.locator('.inv-bin').tap();
    expect((await items())[2]).toBeNull();
    await slot(1).tap();
    await slot(1).tap();
    await expect(page.locator('.inv-slot.picked')).toHaveCount(0);

    if (device === 'phone') {
      // The world behind the screen is not part of this reference: hide the canvas.
      await page.locator('canvas.game-canvas').evaluate((node) => {
        (node as HTMLElement).style.visibility = 'hidden';
      });
      await expect(page).toHaveScreenshot('inventory-touch.png', { maxDiffPixelRatio: 0.05 });
    }

    await page.locator('.inventory-close').tap();
    await expect(page.locator('.inventory-screen')).toBeHidden();
    expect((await getState(page)).paused).toBe(false);
    await expect(page.locator('.touch-bag')).toBeVisible();
  });
}

// --- Phase 3 step 12: the recipe list on a phone and a tablet ------------------------

for (const [device, view] of [
  ['phone', PHONE],
  ['tablet', TABLET],
] as const) {
  test(`Phase 3 AC12.6: the recipe list fits a ${view.width} × ${view.height} ${device}, scrolls by finger and crafts by taps`, async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await page.setViewportSize(view);
    await page.addInitScript(
      ([key, value]) => window.localStorage.setItem(key, value),
      [STORAGE_KEY, JSON.stringify({ renderDistance: 2, mouseSensitivity: 1, fov: 75 })],
    );
    await openOnDevice(page);
    await tapCreate(page, 'gathering');
    await page.evaluate(() => {
      window.__mc.give(5, 2);
      window.__mc.give(7, 3);
    });
    await page.locator('.touch-bag').tap();
    await expect(page.locator('.inventory-screen')).toBeVisible();

    // The four tabs (Tasks since Phase 8, Map since Phase 8B1) and "Close" are
    // finger-sized and on screen.
    const header = '.inventory-tab, .inventory-close';
    expect(await boxes(page, header)).toHaveLength(5);
    expectFingerSized(await boxes(page, header));
    await page.locator('.inventory-tab[data-tab="crafting"]').tap();
    const list = page.locator('.recipe-list');
    await expect(list).toBeVisible();
    expect((await getState(page)).ui.tab).toBe('crafting');
    const top = await boxes(page, header);
    expectFingerSized(top);
    expectInside(top, view);
    expectNoOverlap(top);
    // The panel fits the screen: only the list scrolls.
    expectInside(await boxes(page, '.inventory-panel'), view);
    const screenScrolls = await page
      .locator('.inventory-screen')
      .evaluate((node) => node.scrollHeight > node.clientHeight);
    expect(screenScrolls).toBe(false);
    const listBox = (await boxes(page, '.recipe-list'))[0];
    expect(await list.evaluate((node) => node.scrollHeight > node.clientHeight)).toBe(true);

    // Every recipe has a row at least 48 px high; no text leaves its row.
    const rows = await boxes(page, '.recipe-row');
    expect(rows).toHaveLength(21);
    for (const row of rows) {
      expect(row.height, row.name).toBeGreaterThanOrEqual(48);
      expect(row.x, row.name).toBeGreaterThanOrEqual(listBox.x);
      expect(row.x + row.width, row.name).toBeLessThanOrEqual(listBox.x + listBox.width);
    }
    expectNoOverlap(rows);
    const overflowing = await page
      .locator('.recipe-row, .recipe-name, .recipe-ingredients, .recipe-action')
      .evaluateAll(
        (nodes) =>
          nodes.filter(
            (node) =>
              node.scrollWidth > node.clientWidth + 1 || node.scrollHeight > node.clientHeight + 1,
          ).length,
      );
    expect(overflowing).toBe(0);
    // Two logs and three planks: planks and sticks can be made; their buttons are
    // finger-sized and visible without scrolling.
    const buttons = await boxes(page, '.recipe-craft');
    expect(buttons).toHaveLength(2);
    expectFingerSized(buttons);
    expectInside(buttons, view);
    for (const button of buttons) {
      expect(button.y + button.height, button.name).toBeLessThanOrEqual(listBox.y + listBox.height);
    }

    if (device === 'phone') {
      // The world behind the screen is not part of this reference: hide the canvas.
      const canvas = page.locator('canvas.game-canvas');
      await canvas.evaluate((node) => {
        (node as HTMLElement).style.visibility = 'hidden';
      });
      await expect(page).toHaveScreenshot('recipe-list-touch.png', { maxDiffPixelRatio: 0.05 });
      await canvas.evaluate((node) => {
        (node as HTMLElement).style.visibility = '';
      });
    }

    // A finger that drags a row upwards scrolls the list and crafts nothing.
    const items = async () => (await getState(page)).inventory.slots;
    const before = await items();
    const start = rows[2];
    const x = start.x + 150;
    const y = start.y + start.height / 2;
    await swipe(page, { x, y }, { x, y: y - 100 });
    await expect.poll(() => list.evaluate((node) => node.scrollTop)).toBeGreaterThan(40);
    expect(await items()).toEqual(before);
    // The last row can be reached by scrolling.
    await list.evaluate((node) => node.scrollTo(0, node.scrollHeight));
    const last = (await boxes(page, '.recipe-row')).at(-1);
    expect(last && last.y + last.height).toBeLessThanOrEqual(listBox.y + listBox.height + 1);
    await list.evaluate((node) => node.scrollTo(0, 0));

    // Crafting by taps: two logs become eight planks.
    const count = async (item: number) =>
      (await items()).reduce((sum, s) => sum + (s?.item === item ? s.count : 0), 0);
    const craftPlanks = page.locator('.recipe-row[data-recipe="planks"] .recipe-craft');
    await craftPlanks.tap();
    await expect.poll(() => count(7)).toBe(7);
    await craftPlanks.tap();
    await expect.poll(() => count(7)).toBe(11);
    expect(await count(5)).toBe(0);
    await expect(craftPlanks).toBeHidden();

    await page.locator('.inventory-close').tap();
    await expect(page.locator('.inventory-screen')).toBeHidden();
    expect((await getState(page)).paused).toBe(false);
  });
}

// --- Phase 4 part B: the torch on a phone and a tablet ---------------------------------

for (const [device, view] of [
  ['phone', PHONE],
  ['tablet', TABLET],
] as const) {
  test(`Phase 4 AC8.5: the torch row of the recipe list is reachable on a ${view.width} × ${view.height} ${device}`, async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await page.setViewportSize(view);
    await page.addInitScript(
      ([key, value]) => window.localStorage.setItem(key, value),
      [STORAGE_KEY, JSON.stringify({ renderDistance: 2, mouseSensitivity: 1, fov: 75 })],
    );
    await openOnDevice(page);
    await tapCreate(page, 'gathering');
    await page.evaluate(() => {
      // Every recipe unlocked (Phase 8): the torch comes with a task of the book.
      window.__mc.setProgress({ xp: 480, done: Array.from({ length: 21 }, (_, i) => i + 1) });
      window.__mc.give(257, 1);
      window.__mc.give(256, 1);
    });
    await page.locator('.touch-bag').tap();
    await page.locator('.inventory-tab[data-tab="crafting"]').tap();
    const list = page.locator('.recipe-list');
    const listBox = (await boxes(page, '.recipe-list'))[0];
    // The list keeps table order (polishing session 1): the torch is its last row, and
    // scrolling to the end brings its button into the list's view.
    await expect(page.locator('.inventory-tab[data-tab="crafting"] .tab-count')).toHaveText('1');
    await list.evaluate((node) => node.scrollTo(0, node.scrollHeight));
    const craft = page.locator('.recipe-row[data-recipe="torch"] .recipe-craft');
    const button = await boxes(page, '.recipe-row[data-recipe="torch"] .recipe-craft');
    expect(button).toHaveLength(1);
    expectFingerSized(button);
    expectInside(button, view);
    expect(button[0].y).toBeGreaterThanOrEqual(listBox.y);
    expect(button[0].y + button[0].height).toBeLessThanOrEqual(listBox.y + listBox.height);
    await craft.tap();
    await expect
      .poll(async () =>
        (await getState(page)).inventory.slots.reduce(
          (sum, s) => sum + (s?.item === 19 ? s.count : 0),
          0,
        ),
      )
      .toBe(4);
  });

  test(`Phase 4 AC8.5: the palette's 17th block, the torch, is reachable on a ${view.width} × ${view.height} ${device}`, async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await page.setViewportSize(view);
    await page.addInitScript(
      ([key, value]) => window.localStorage.setItem(key, value),
      [STORAGE_KEY, JSON.stringify({ renderDistance: 2, mouseSensitivity: 1, fov: 75 })],
    );
    await openOnDevice(page);
    await tapCreate(page, 'creative');
    await page.locator('.touch-bag').tap();
    // The tap that opens the screen does not also close it, although "Close" now lies
    // under the finger.
    await expect(page.locator('.inventory-screen')).toBeVisible();
    await expect(page.locator('.palette-slot')).toHaveCount(17);
    const torch = page.locator('.palette-slot[data-item="torch"]');
    await torch.scrollIntoViewIfNeeded();
    const slot = await boxes(page, '.palette-slot[data-item="torch"]');
    expectFingerSized(slot);
    expectInside(slot, view);
    await torch.tap();
    await expect(page.locator('.inv-slot[data-index="0"]')).toHaveAttribute('data-item', 'torch');
  });
}

// --- Polishing session 1: rows that never move, on a phone and a tablet ----------------

for (const [device, view] of [
  ['phone', PHONE],
  ['tablet', TABLET],
] as const) {
  test(`Polish 1 AC1.3 and AC1.5: the recipe rows keep their places and the list shows part of a sixth row on a ${view.width} × ${view.height} ${device}`, async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await page.setViewportSize(view);
    await page.addInitScript(
      ([key, value]) => window.localStorage.setItem(key, value),
      [STORAGE_KEY, JSON.stringify({ renderDistance: 2, mouseSensitivity: 1, fov: 75 })],
    );
    await openOnDevice(page);
    await tapCreate(page, 'gathering');
    // Every recipe unlocked (Phase 8): the walk through the list crafts coal and torches.
    await page.evaluate(() =>
      window.__mc.setProgress({ xp: 480, done: Array.from({ length: 21 }, (_, i) => i + 1) }),
    );
    await page.locator('.touch-bag').tap();
    await page.locator('.inventory-tab[data-tab="crafting"]').tap();
    await expect(page.locator('.recipe-list')).toBeVisible();
    await expectPartOfSixthRow(page);
    if (device === 'phone') {
      // One height for every row, set by the finger-sized "Craft" button.
      expect(await expectRowsNeverMove(page)).toBeCloseTo(52, 0);
      // The panel still fits the screen with the bar running.
      expectInside(await boxes(page, '.inventory-panel'), view);
    }
  });
}
