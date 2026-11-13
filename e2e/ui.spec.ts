// Start/pause screen, settings and debug overlay in the browser (plan step 11).
import type { Page } from '@playwright/test';
import { test, expect } from './fixtures';
import {
  createWorld,
  getState,
  openGame,
  pauseWithMouse,
  setPlayer,
  untilPlaying,
  whenIdle,
} from './game';

const STORAGE_KEY = 'markuscraft.settings.v1';

/** Opens the game the way a player does: no test mode, start screen first. */
async function openNormal(page: Page, query: string, settings?: object): Promise<void> {
  if (settings) {
    // Only seed the storage when it is empty, so reloads keep what the page saved.
    await page.addInitScript(
      ([key, value]) => {
        if (window.localStorage.getItem(key) === null) window.localStorage.setItem(key, value);
      },
      [STORAGE_KEY, JSON.stringify(settings)],
    );
  }
  await page.goto(`/${query}`);
  await page.waitForFunction(() => window.__mc !== undefined);
}

const SMALL = { renderDistance: 2, mouseSensitivity: 1, fov: 75 };

async function waitFrames(page: Page, frames: number): Promise<void> {
  await page.evaluate(
    (count) =>
      new Promise<void>((resolve) => {
        let left = count;
        const tick = (): void => {
          if (--left <= 0) resolve();
          else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }),
    frames,
  );
}

async function setSlider(page: Page, id: string, value: number): Promise<void> {
  await page.locator(`#${id}`).evaluate((node, v) => {
    const input = node as HTMLInputElement;
    input.value = String(v);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }, value);
}

test('the pause screen shows the controls and the simulation stands still (AC11.1, AC11.5)', async ({
  page,
}) => {
  await openNormal(page, '', SMALL);
  // Phase 3: the start screen is the world menu; the pause screen belongs to a world.
  await expect(page.locator('.world-menu')).toBeVisible();
  await expect(page.locator('.pause-screen')).toBeHidden();
  await expect(page.locator('.crosshair')).toBeHidden();
  await expect(page.locator('.hotbar')).toBeHidden();
  expect((await getState(page)).paused).toBe(true);

  await createWorld(page, { seed: '1337' });
  await pauseWithMouse(page);
  await expect(page.locator('.pause-screen')).toBeVisible();
  await expect(page.locator('.pause-title')).toHaveText(['MarkusCraft', 'MarkusCraft']);
  await expect(page.locator('.play-button:visible')).toHaveText('Click to continue');
  await expect(page.locator('.controls-list dt')).toHaveCount(11);
  await expect(page.locator('.controls-list')).toContainText('Toggle fly mode');
  // Crosshair and selector bar are hidden behind the pause screen.
  await expect(page.locator('.crosshair')).toBeHidden();
  await expect(page.locator('.hotbar')).toBeHidden();

  await whenIdle(page);
  const before = await getState(page);
  expect(before.paused).toBe(true);
  expect(before.chunks.loaded).toBe(25);
  // Keys do nothing while paused.
  await page.keyboard.down('KeyW');
  await waitFrames(page, 30);
  await page.keyboard.up('KeyW');
  const after = await getState(page);
  expect(after.time).toBe(before.time);
  expect(after.player).toEqual(before.player);
});

test('clicking play captures the mouse and resumes; losing the lock pauses (AC11.7, Phase 3 AC4.10)', async ({
  page,
}) => {
  await openNormal(page, '?seed=1337', SMALL);
  await page.locator('.world-create-button').click();
  await untilPlaying(page);
  const before = await getState(page);
  await expect(page.locator('.world-menu')).toBeHidden();
  await expect(page.locator('.pause-screen')).toBeHidden();
  await expect(page.locator('.crosshair')).toBeVisible();
  await expect(page.locator('.hotbar')).toBeVisible();
  expect(await page.evaluate(() => document.pointerLockElement?.tagName)).toBe('CANVAS');

  // The real-time loop runs now: the clock advances and W moves the player.
  await page.keyboard.down('KeyW');
  await page.waitForFunction(
    ([time, z]) => {
      const state = window.__mc.getState();
      return state.time > time && Math.abs(state.player.z - z) > 0.5;
    },
    [before.time, before.player.z],
  );
  await page.keyboard.up('KeyW');

  // Not automated: looking around with the locked mouse. Headless Chromium reports no
  // movement deltas for synthetic mouse moves under pointer lock (see the phase report).

  // Esc releases the lock in a real browser; headless we release it through the API.
  await page.evaluate(() => document.exitPointerLock());
  await page.waitForFunction(() => window.__mc.getState().paused);
  await expect(page.locator('.pause-screen')).toBeVisible();
  await expect(page.locator('.play-button:visible')).toHaveText('Click to continue');
  await expect(page.locator('.crosshair')).toBeHidden();

  // "Click to continue" captures the mouse again.
  await page.locator('.play-button:visible').click();
  await untilPlaying(page);
  expect(await page.evaluate(() => document.pointerLockElement?.tagName)).toBe('CANVAS');

  // Back in the world menu, the play button of the list does the same.
  await page.evaluate(() => document.exitPointerLock());
  await page.waitForFunction(() => window.__mc.getState().paused);
  await page.locator('.back-button').click();
  await expect(page.locator('.world-play-button')).toHaveText('Click to play');
  await page.locator('.world-play-button').click();
  await untilPlaying(page);
  expect(await page.evaluate(() => document.pointerLockElement?.tagName)).toBe('CANVAS');
});

test('settings apply live, persist across reloads and survive corrupt storage (AC11.2)', async ({
  page,
}) => {
  await openNormal(page, '');
  // Defaults on a fresh profile.
  await expect(page.locator('#setting-render-distance')).toHaveValue('8');
  await expect(page.locator('#setting-fov')).toHaveValue('75');
  await expect(page.locator('#setting-sensitivity')).toHaveValue('1');

  // Software WebGL is slow: go down to 2 chunks before a world is opened.
  await setSlider(page, 'setting-render-distance', 2);
  await createWorld(page, { seed: '1337' });
  await pauseWithMouse(page);
  await whenIdle(page);
  let state = await getState(page);
  expect(state.chunks.loaded).toBe(25);
  expect(state.chunks.pending).toBe(0);

  await setSlider(page, 'setting-fov', 100);
  await setSlider(page, 'setting-sensitivity', 2);
  expect((await getState(page)).render.fov).toBe(100);
  expect(await page.evaluate((key) => window.localStorage.getItem(key), STORAGE_KEY)).toBe(
    JSON.stringify({ renderDistance: 2, mouseSensitivity: 2, fov: 100 }),
  );

  await page.reload();
  await page.waitForFunction(() => window.__mc !== undefined);
  await expect(page.locator('#setting-render-distance')).toHaveValue('2');
  await expect(page.locator('#setting-fov')).toHaveValue('100');
  await expect(page.locator('#setting-sensitivity')).toHaveValue('2');
  // Continue the saved world: it loads with the stored render distance.
  await page.locator('.world-play-button').click();
  await untilPlaying(page);
  await pauseWithMouse(page);
  await whenIdle(page);
  state = await getState(page);
  expect(state.chunks.loaded).toBe(25);
  expect(state.render.fov).toBe(100);
  // Sensitivity 2 doubles the rotation per pixel.
  // The click on the play button may have turned the view through the captured mouse.
  await page.evaluate(() => {
    window.__mc.setPlayer({ yaw: 0, pitch: 0 });
    window.__mc.look(100, 0);
  });
  expect((await getState(page)).player.yaw).toBeCloseTo(-0.5, 5);

  // Corrupt content falls back to defaults; the console fixture proves there is no error.
  await page.evaluate((key) => window.localStorage.setItem(key, '{broken json'), STORAGE_KEY);
  await page.reload();
  await page.waitForFunction(() => window.__mc !== undefined);
  await expect(page.locator('#setting-render-distance')).toHaveValue('8');
  await expect(page.locator('#setting-fov')).toHaveValue('75');
  expect((await getState(page)).render.fov).toBe(75);

  // Out-of-range values are clamped.
  await page.evaluate(
    (key) =>
      window.localStorage.setItem(key, '{"renderDistance":2,"fov":500,"mouseSensitivity":"x"}'),
    STORAGE_KEY,
  );
  await page.reload();
  await page.waitForFunction(() => window.__mc !== undefined);
  await expect(page.locator('#setting-fov')).toHaveValue('110');
  await expect(page.locator('#setting-sensitivity')).toHaveValue('1');
});

test('test mode ignores stored settings', async ({ page }) => {
  await page.addInitScript(
    ([key, value]) => window.localStorage.setItem(key, value),
    [STORAGE_KEY, JSON.stringify({ renderDistance: 2, mouseSensitivity: 3, fov: 110 })],
  );
  await openGame(page);
  const state = await getState(page);
  expect(state.chunks.loaded).toBe(81);
  expect(state.render.fov).toBe(75);
  expect(state.paused).toBe(false);
  await expect(page.locator('.pause-screen')).toHaveCount(0);
  await expect(page.locator('.crosshair')).toBeVisible();
  await expect(page.locator('.hotbar')).toBeVisible();
});

test('F3 toggles the debug overlay with live values (AC11.3)', async ({ page }) => {
  await openGame(page);
  const overlay = page.locator('.debug-overlay');
  await expect(overlay).toBeHidden();
  await page.keyboard.press('F3');
  await expect(overlay).toBeVisible();

  await setPlayer(page, { x: 3.25, y: 80.5, z: -7.75, yaw: Math.PI / 2, pitch: -0.5, mode: 'fly' });
  const { player } = await getState(page);
  const value = (name: string) => page.locator(`[data-debug="${name}"]`);
  await expect(value('position')).toHaveText(
    `${player.x.toFixed(2)} / ${player.y.toFixed(2)} / ${player.z.toFixed(2)}`,
  );
  await expect(value('position')).toHaveText('3.25 / 80.50 / -7.75');
  await expect(value('facing')).toHaveText('west (yaw 90.0°, pitch -28.6°)');
  await expect(value('chunk')).toHaveText('0 / -1');
  await expect(value('chunks')).toHaveText('81 loaded, 0 pending');
  await expect(value('render')).toHaveText(/^\d+ draw calls, \d+ triangles$/);
  await expect(value('seed')).toHaveText('1337');
  await expect(value('time')).toHaveText('0.250 (noon)');
  await expect(value('mode')).toHaveText('fly');
  await expect(value('target')).toHaveText('none');
  await expect(value('fps')).toHaveText(/^\d+$/);

  // Looking at the ground shows the targeted block.
  await page.evaluate(() => {
    const mc = window.__mc;
    const p = mc.getState().player;
    const x = Math.floor(p.x);
    const z = Math.floor(p.z);
    mc.setPlayer({ y: mc.surfaceY(x, z) + 1, pitch: -1.5, mode: 'walk' });
  });
  await whenIdle(page);
  await expect(value('target')).toHaveText(/^[a-z]+ at 3 \/ \d+ \/ -8$/);

  await page.keyboard.press('F3');
  await expect(overlay).toBeHidden();
});

// Phase 1 AC11.4 (random seed per visit, seed from the URL, copy link) is now covered by
// "Phase 3 AC4.2" and "Phase 3 AC4.5" in worldMenu.spec.ts: seeds belong to worlds.

test('matches the pause screen reference screenshot (AC11.6)', async ({ page }) => {
  await openNormal(page, '', SMALL);
  await createWorld(page, { seed: '1337' });
  await pauseWithMouse(page);
  await whenIdle(page);
  await expect(page.locator('.save-state')).toHaveText('Saved');
  // The world behind the screen is not part of this reference: hide the canvas.
  await page.locator('canvas.game-canvas').evaluate((node) => {
    (node as HTMLElement).style.visibility = 'hidden';
  });
  // Text-only screen: CI renders the system font slightly differently (3.7 % of pixels),
  // so this reference uses the raised tolerance the phase plan allows (section 5.5).
  await expect(page).toHaveScreenshot('pause-screen.png', { maxDiffPixelRatio: 0.05 });
});

test('shows a readable message when WebGL2 is unavailable', async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string) {
      if (type === 'webgl2') return null;
      return Reflect.apply(original, this, [type]);
    } as typeof original;
  });
  await page.goto('/?seed=1');
  await expect(page.locator('.fatal-message')).toBeVisible();
  await expect(page.locator('.fatal-message')).toContainText('WebGL2');
  await expect(page.locator('canvas')).toHaveCount(0);
});
