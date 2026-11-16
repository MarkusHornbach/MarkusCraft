// The controller on the screens (Phase 5 step 3): the focus system, the menus, the
// performance test, the back guard, and the references of the controller's look.
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import {
  backToWorlds,
  createWorld,
  getState,
  openGame,
  openMenu,
  pauseWithMouse,
  untilPlaying,
} from './game';
import { BUTTON, Pad, installFakePads, polls } from './gamepad';

// Menus, worlds and software WebGL: several worlds are opened per test.
test.describe.configure({ timeout: 180_000 });

/** What the controller's focus is on. */
async function focusOf(page: Page): Promise<string | null> {
  return (await getState(page)).ui.focus;
}

/** Moves the focus with the D-pad until it is on `name`; fails after `limit` moves. */
async function focusTo(page: Page, pad: Pad, name: string | RegExp, moves: number[]) {
  const matches = (focus: string | null): boolean =>
    focus !== null && (typeof name === 'string' ? focus === name : name.test(focus));
  for (const move of moves) {
    if (matches(await focusOf(page))) return;
    await pad.tap(move);
  }
  expect(await focusOf(page)).toMatch(typeof name === 'string' ? new RegExp(`^${name}$`) : name);
}

/** The menu with the fake pads installed and a pad connected (not used yet). */
async function padMenu(page: Page, query = ''): Promise<Pad> {
  await installFakePads(page);
  await openMenu(page, query);
  const pad = new Pad(page);
  await pad.connect();
  return pad;
}

/** The performance test's start page (or its sample result) with a pad connected. */
async function padBench(page: Page, bench: 'quick' | 'sample'): Promise<Pad> {
  await installFakePads(page);
  await page.addInitScript(() => {
    const key = 'markuscraft.settings.v1';
    if (window.localStorage.getItem(key) === null) {
      window.localStorage.setItem(
        key,
        JSON.stringify({ renderDistance: 2, mouseSensitivity: 1, fov: 75 }),
      );
    }
  });
  await page.goto(`/?bench=${bench}`);
  await page.waitForFunction(() => window.__mc?.getState().bench !== null);
  const pad = new Pad(page);
  await pad.connect();
  return pad;
}

/** Rectangle of the focus frame and of the focused element. */
async function frameAndFocus(page: Page) {
  return page.evaluate(() => {
    const rect = (selector: string) => {
      const node = document.querySelector(selector);
      if (!node) return null;
      const r = node.getBoundingClientRect();
      return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
    };
    return { frame: rect('.pad-focus-frame'), focused: rect('.pad-focused') };
  });
}

test('Phase 5 AC3.1: the pad alone creates a world, plays, pauses, goes back and plays it again', async ({
  page,
}) => {
  const pad = await padMenu(page);
  // No world yet: the form shows, its focus starts on "Create and play".
  await expect(page.locator('.world-form')).toBeVisible();
  await pad.tap(BUTTON.LEFT);
  expect((await getState(page)).pad.active).toBe(true);
  await focusTo(page, pad, 'Create and play', [BUTTON.RIGHT]);
  await focusTo(page, pad, 'Gathering', [BUTTON.UP, BUTTON.LEFT, BUTTON.LEFT]);
  await pad.tap(BUTTON.A);
  await expect(page.locator('.world-mode-button[data-mode="gathering"]')).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await focusTo(page, pad, 'Create and play', [BUTTON.DOWN, BUTTON.DOWN, BUTTON.LEFT]);
  await pad.tap(BUTTON.A);
  await untilPlaying(page);
  let state = await getState(page);
  expect(state.world?.name).toBe('My world');
  expect(state.mode).toBe('gathering');
  expect(state.ui.focus).toBeNull();

  await pad.tap(BUTTON.START);
  state = await getState(page);
  expect(state.paused).toBe(true);
  expect(state.ui.focus).toBe('Press A to continue');
  await focusTo(page, pad, 'Save and back to worlds', [BUTTON.RIGHT]);
  await pad.tap(BUTTON.A);
  await page.locator('.world-list-view').waitFor();
  expect(await focusOf(page)).toBe('Press A to play');
  await focusTo(page, pad, /^My world/, [BUTTON.UP]);
  await pad.tap(BUTTON.A);
  await focusTo(page, pad, 'Press A to play', [BUTTON.DOWN]);
  await pad.tap(BUTTON.A);
  await untilPlaying(page);
  expect((await getState(page)).world?.name).toBe('My world');
});

test('Phase 5 AC3.2: the focus frame lies over the focused element while the pad is active', async ({
  page,
}) => {
  const pad = await padMenu(page);
  await expect(page.locator('.pad-focus-frame')).toHaveCount(0);
  await pad.tap(BUTTON.UP);
  for (const move of [BUTTON.UP, BUTTON.DOWN, BUTTON.RIGHT]) {
    await pad.tap(move);
    const { frame, focused } = await frameAndFocus(page);
    expect(frame).not.toBeNull();
    expect(focused).not.toBeNull();
    if (!frame || !focused) return;
    for (const edge of ['left', 'top', 'right', 'bottom'] as const) {
      expect(Math.abs(frame[edge] - focused[edge])).toBeLessThanOrEqual(4);
    }
  }
  await expect(page.locator('.pad-hints')).toBeVisible();
  // Moving the mouse hides frame and hints; nothing else happens.
  await page.mouse.move(100, 100);
  await page.mouse.move(140, 120);
  await expect(page.locator('.pad-focus-frame')).toHaveCount(0);
  await expect(page.locator('.pad-hints')).toHaveCount(0);
  const state = await getState(page);
  expect(state.pad.active).toBe(false);
  expect(state.ui.focus).toBeNull();
  await expect(page.locator('.world-form')).toBeVisible();
});

test('Phase 5 AC3.3: default focus, D-pad and stick moves and B on the world menu views', async ({
  page,
}) => {
  await installFakePads(page);
  await openMenu(page);
  await createWorld(page);
  await pauseWithMouse(page);
  await backToWorlds(page);
  const pad = new Pad(page);
  await pad.connect();

  // The list: the play button first; B does nothing here.
  await pad.tap(BUTTON.B);
  expect(await focusOf(page)).toBe('Press A to play');
  await expect(page.locator('.world-list-view')).toBeVisible();
  await pad.tap(BUTTON.DOWN);
  expect(await focusOf(page)).toMatch(/^(New world|Delete|Settings|Performance test)$/);
  await focusTo(page, pad, 'New world', [BUTTON.LEFT, BUTTON.LEFT, BUTTON.LEFT]);
  await pad.tap(BUTTON.RIGHT);
  expect(await focusOf(page)).toBe('Delete');
  // The left stick moves as the D-pad does.
  await pad.stick('left', 0.9, 0);
  await pad.stick('left', 0, 0);
  expect(await focusOf(page)).toBe('Settings');
  await pad.stick('left', 0, -0.9);
  await pad.stick('left', 0, 0);
  expect(await focusOf(page)).toBe('Press A to play');

  // The confirmation: "Keep" first, B keeps.
  await focusTo(page, pad, 'Delete', [BUTTON.DOWN, BUTTON.LEFT, BUTTON.LEFT, BUTTON.RIGHT]);
  await pad.tap(BUTTON.A);
  await expect(page.locator('.world-confirm')).toBeVisible();
  expect(await focusOf(page)).toBe('Keep');
  await pad.tap(BUTTON.LEFT);
  expect(await focusOf(page)).toBe('Delete');
  await pad.tap(BUTTON.B);
  await expect(page.locator('.world-list-view')).toBeVisible();
  await expect(page.locator('.world-row')).toHaveCount(1);
  // Back on the list, the list's own default.
  expect(await focusOf(page)).toBe('Press A to play');

  // The form: "Create and play" first, B back to the list; text fields are never focused.
  await focusTo(page, pad, 'New world', [BUTTON.DOWN, BUTTON.LEFT, BUTTON.LEFT]);
  await pad.tap(BUTTON.A);
  await expect(page.locator('.world-form')).toBeVisible();
  expect(await focusOf(page)).toBe('Create and play');
  const seen = new Set<string | null>();
  for (const move of [BUTTON.UP, BUTTON.UP, BUTTON.UP, BUTTON.UP, BUTTON.DOWN, BUTTON.DOWN]) {
    await pad.tap(move);
    seen.add(await focusOf(page));
  }
  expect([...seen].some((focus) => focus === 'world-name' || focus === 'world-seed')).toBe(false);
  expect(await page.locator('input[type=text].pad-focused').count()).toBe(0);
  await pad.tap(BUTTON.B);
  await expect(page.locator('.world-list-view')).toBeVisible();
});

test('Phase 5 AC3.3: the pause menu and the settings page', async ({ page }) => {
  await installFakePads(page);
  await openMenu(page);
  await createWorld(page);
  const pad = new Pad(page);
  await pad.connect();
  await pad.tap(BUTTON.START);
  expect((await getState(page)).paused).toBe(true);
  expect(await focusOf(page)).toBe('Press A to continue');
  await pad.tap(BUTTON.RIGHT);
  expect(await focusOf(page)).toBe('Save and back to worlds');
  await pad.tap(BUTTON.DOWN);
  expect(await focusOf(page)).toBe('Render distance');
  // B continues the game.
  await pad.tap(BUTTON.B);
  await untilPlaying(page);

  // The settings page from the world menu: the first slider first, B back to the worlds.
  await pad.tap(BUTTON.START);
  // The pause menu kept its last focus.
  expect(await focusOf(page)).toBe('Render distance');
  await focusTo(page, pad, 'Save and back to worlds', [BUTTON.UP, BUTTON.RIGHT]);
  await pad.tap(BUTTON.A);
  await page.locator('.world-list-view').waitFor();
  await focusTo(page, pad, 'Settings', [BUTTON.DOWN, BUTTON.RIGHT, BUTTON.RIGHT]);
  await pad.tap(BUTTON.A);
  expect((await getState(page)).ui.screen).toBe('settings');
  expect(await focusOf(page)).toBe('Render distance');
  await pad.tap(BUTTON.B);
  expect((await getState(page)).ui.screen).toBe('worlds');
  expect(await focusOf(page)).toBe('Settings');
});

test('Phase 5 AC3.4: the pad changes sliders step by step; up and down leave them', async ({
  page,
}) => {
  await installFakePads(page);
  await openMenu(page);
  await createWorld(page);
  const pad = new Pad(page);
  await pad.connect();
  await pad.tap(BUTTON.START);
  await focusTo(page, pad, 'Brightness', Array<number>(10).fill(BUTTON.DOWN));
  const start = (await getState(page)).settings.brightness;
  expect(start).toBe(0.5);
  await pad.tap(BUTTON.RIGHT);
  expect((await getState(page)).settings.brightness).toBeCloseTo(0.55, 9);
  await pad.tap(BUTTON.LEFT);
  await pad.tap(BUTTON.LEFT);
  expect((await getState(page)).settings.brightness).toBeCloseTo(0.45, 9);
  await expect(page.locator('#setting-brightness + .setting-value')).toHaveText('45 %');
  // Held, the slider repeats.
  await pad.press(BUTTON.RIGHT);
  await page.waitForFunction(() => window.__mc.getState().settings.brightness > 0.56);
  await pad.release(BUTTON.RIGHT);
  // The setting is stored as the mouse would store it.
  const stored = await page.evaluate(() => localStorage.getItem('markuscraft.settings.v1'));
  expect(JSON.parse(stored ?? '{}').brightness).toBe((await getState(page)).settings.brightness);
  await pad.tap(BUTTON.UP);
  expect(await focusOf(page)).not.toBe('Brightness');
  await pad.tap(BUTTON.DOWN);
  expect(await focusOf(page)).toBe('Brightness');

  // The switch toggles with A.
  await focusTo(page, pad, 'Invert controller look', [BUTTON.DOWN, BUTTON.DOWN]);
  await pad.tap(BUTTON.A);
  expect((await getState(page)).settings.padInvertY).toBe(true);
  await pad.tap(BUTTON.A);
  expect((await getState(page)).settings.padInvertY).toBe(false);
  // The seed link is a text field: never focused.
  for (let i = 0; i < 6; i++) {
    await pad.tap(BUTTON.DOWN);
    expect(await focusOf(page)).not.toBe('Link to this world');
  }
});

test('Phase 5 AC3.4: the debug switch toggles with A (touch mode)', async ({ page }) => {
  await installFakePads(page);
  await openMenu(page, '?touch=1');
  const pad = new Pad(page);
  await pad.connect();
  await focusTo(page, pad, 'Settings', [BUTTON.DOWN, BUTTON.RIGHT, BUTTON.RIGHT]);
  await pad.tap(BUTTON.A);
  expect((await getState(page)).ui.screen).toBe('settings');
  await focusTo(page, pad, 'Debug overlay', Array<number>(10).fill(BUTTON.DOWN));
  await pad.tap(BUTTON.A);
  await expect(page.locator('#setting-debug')).toBeChecked();
  await pad.tap(BUTTON.A);
  await expect(page.locator('#setting-debug')).not.toBeChecked();
});

test('Phase 5 AC3.5: the controller rows appear after the first press; the pad lines replace the others', async ({
  page,
}) => {
  await installFakePads(page);
  await openMenu(page);
  await page.locator('.world-form-settings-button').click();
  await expect(page.locator('#setting-pad-sensitivity')).toHaveCount(0);
  await expect(page.locator('#setting-pad-invert')).toHaveCount(0);
  const pad = new Pad(page);
  // The wake-up press: the pad is reported, not used yet.
  await pad.connect();
  await expect(page.locator('#setting-pad-sensitivity')).toHaveCount(0);
  await expect(page.locator('.controls-list')).toContainText(
    'Press a button on the controller to use it',
  );
  await expect(page.locator('.controls-list dt').first()).toHaveText('Mouse');

  await pad.tap(BUTTON.DOWN);
  await expect(page.locator('#setting-pad-sensitivity')).toHaveCount(1);
  await expect(page.locator('#setting-pad-invert')).toHaveCount(1);
  await expect(page.locator('.controls-list')).not.toContainText('Press a button');
  await expect(page.locator('.controls-list dt.control-glyphs')).toHaveCount(11);
  await expect(page.locator('.controls-list .pad-glyph[data-glyph="RT"]')).toHaveCount(1);

  // Back to the mouse: its lines return, the controller's rows stay for this visit.
  await page.mouse.move(50, 50);
  await page.mouse.move(80, 60);
  await expect(page.locator('.controls-list dt').first()).toHaveText('Mouse');
  await expect(page.locator('#setting-pad-sensitivity')).toHaveCount(1);
});

test('Phase 5 AC3.6: the performance test with the pad: start, cancel, start again, back', async ({
  page,
}) => {
  const pad = await padBench(page, 'quick');
  await expect(page.locator('.bench-start')).toBeVisible();
  await pad.tap(BUTTON.DOWN);
  await focusTo(page, pad, 'Start', [BUTTON.LEFT, BUTTON.LEFT]);
  await pad.tap(BUTTON.A);
  await page.waitForFunction(() => window.__mc.getState().bench?.phase === 'running');
  // Sticks and buttons do not reach the run; no frame is drawn over it.
  await pad.stick('left', 1, -1);
  await pad.stick('right', -1, 0.5);
  await pad.tap(BUTTON.A);
  await pad.tap(BUTTON.RT);
  await pad.stick('left', 0, 0);
  await pad.stick('right', 0, 0);
  let state = await getState(page);
  expect(state.bench?.phase).toBe('running');
  expect(state.ui.focus).toBeNull();
  await expect(page.locator('.pad-focus-frame')).toHaveCount(0);
  await pad.tap(BUTTON.B);
  state = await getState(page);
  expect(state.bench).toMatchObject({ phase: 'interrupted', reason: 'cancel' });
  expect(state.ui.focus).toBe('Start again');
  await pad.tap(BUTTON.A);
  await page.waitForFunction(() => window.__mc.getState().bench?.phase === 'running');
  await pad.tap(BUTTON.START);
  expect((await getState(page)).bench?.phase).toBe('interrupted');
  await pad.tap(BUTTON.B);
  state = await getState(page);
  expect(state.bench).toBeNull();
  expect(state.ui.screen).toBe('worlds');
});

test('Phase 5 AC3.6: from the result screen B goes back', async ({ page }) => {
  const pad = await padBench(page, 'sample');
  await expect(page.locator('.bench-result')).toBeVisible();
  await pad.tap(BUTTON.UP);
  expect(await focusOf(page)).toBe('Back');
  await pad.tap(BUTTON.LEFT);
  expect(await focusOf(page)).toBe('Run again');
  await pad.tap(BUTTON.B);
  expect((await getState(page)).ui.screen).toBe('worlds');
});

test.describe('the back guard', () => {
  test('Phase 5 AC3.7: Back pauses the game, returns from the form, leaves from the list', async ({
    page,
  }) => {
    await openMenu(page);
    const url = page.url();
    await createWorld(page);
    await page.goBack();
    await page.waitForFunction(() => window.__mc.getState().paused);
    expect((await getState(page)).ui.screen).toBe('pause');
    expect(page.url()).toBe(url);
    // Once more: the guard holds its entry again.
    await page.locator('.pause-screen .play-button').click();
    await untilPlaying(page);
    await page.goBack();
    await page.waitForFunction(() => window.__mc.getState().paused);
    await backToWorlds(page);

    await page.locator('.world-new-button').click();
    await expect(page.locator('.world-form')).toBeVisible();
    // The guard holds its entry again (after taking its own back on the list).
    await page.waitForFunction(() => window.history.state !== null);
    await page.goBack();
    await expect(page.locator('.world-list-view')).toBeVisible();
    expect(page.url()).toBe(url);
    // On the list no entry is held (the guard took its own back): Back leaves the page.
    await page.waitForFunction(() => window.history.state === null);
    await page.goBack();
    await page.waitForURL((u) => u.toString() !== url);
  });

  test('Phase 5 AC3.7: B followed within 150 ms by a browser Back acts once', async ({ page }) => {
    await installFakePads(page);
    await openMenu(page);
    await createWorld(page);
    const pad = new Pad(page);
    await pad.connect();
    await pad.tap(BUTTON.START);
    expect((await getState(page)).paused).toBe(true);
    // B, and the browser's Back right after the poll that saw it.
    await page.evaluate(async () => {
      const before = window.__mc.getState().pad.polls;
      window.__fakePadOp?.({ kind: 'button', index: 0, button: 1, value: 1 });
      await new Promise<void>((done) => {
        const check = (): void => {
          if (window.__mc.getState().pad.polls > before) done();
          else requestAnimationFrame(check);
        };
        requestAnimationFrame(check);
      });
      history.back();
    });
    await page.waitForFunction(() => !window.__mc.getState().paused);
    await pad.release(BUTTON.B);
    await polls(page, 5);
    // B continued the game; the Back that came with it did not pause it again.
    expect((await getState(page)).paused).toBe(false);
  });
});

test.describe('references', () => {
  test('Phase 5 AC3.8: pad-glyphs', async ({ page }) => {
    await openGame(page);
    await page.evaluate(() => window.__mc.glyphSheet());
    await expect(page.locator('.pad-glyph-sheet')).toHaveScreenshot('pad-glyphs.png', {
      maxDiffPixelRatio: 0.05,
    });
  });

  test('Phase 5 AC3.8: pad-world-menu', async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-07-04T12:00:00Z'));
    await installFakePads(page);
    await openMenu(page);
    await createWorld(page, { name: 'Castle by the lake', seed: '1337' });
    await pauseWithMouse(page);
    await backToWorlds(page);
    const pad = new Pad(page);
    await pad.connect();
    await pad.tap(BUTTON.UP);
    await focusTo(page, pad, 'Press A to play', [BUTTON.DOWN]);
    await expect(page.locator('.pad-hints')).toBeVisible();
    await expect(page).toHaveScreenshot('pad-world-menu.png', { maxDiffPixelRatio: 0.05 });
  });

  test('Phase 5 AC3.8: pad-pause', async ({ page }) => {
    await installFakePads(page);
    await openMenu(page);
    await createWorld(page, { seed: '1337' });
    const pad = new Pad(page);
    await pad.connect();
    await pad.tap(BUTTON.START);
    await focusTo(page, pad, 'Brightness', Array<number>(10).fill(BUTTON.DOWN));
    await expect(page.locator('#setting-pad-sensitivity')).toHaveCount(1);
    await expect(page.locator('.save-state')).toHaveText('Saved');
    await page.locator('canvas.game-canvas').evaluate((node) => {
      (node as HTMLElement).style.visibility = 'hidden';
    });
    await expect(page).toHaveScreenshot('pad-pause.png', { maxDiffPixelRatio: 0.05 });
  });
});
