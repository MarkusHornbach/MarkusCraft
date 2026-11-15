// Performance test (Phase 4 part P): start page, the quick run, interrupts, result screen.
// Everything here runs without `test=1`, in the real loop under software WebGL: the tests
// wait on `getState().bench` and never look at a measured time or a light.
import type { Page } from '@playwright/test';
import { parseIssueBody } from '../src/bench/benchReport';
import { SAMPLE_RESULT } from '../src/bench/sampleResult';
import { expect, test } from './fixtures';
import { backToWorlds, createWorld, getState, pauseWithMouse } from './game';
import { TOUCH_DEVICE, swipe, withoutFullscreen } from './touch';

const SETTINGS_KEY = 'markuscraft.settings.v1';
const RESULT_KEY = 'markuscraft.lastPerfRun.v1';
const STORED_SETTINGS = JSON.stringify({ renderDistance: 2, mouseSensitivity: 1, fov: 75 });
const ORDER = [
  'stand',
  'walk',
  'fly',
  'edit',
  'torches',
  'stand',
  'walk',
  'fly',
  'edit',
  'torches',
  'stand',
];
const HINTS = [
  'Takes about 4 minutes',
  'Plug in the charger',
  'Close other apps and tabs',
  'Switch battery saver off',
  'Do not touch the screen during the test',
  'The result can be sent as a public GitHub issue',
];

/** Opens the page with the performance test's start page (or its sample result). */
async function openBench(page: Page, bench: '1' | 'quick' | 'sample'): Promise<void> {
  await page.addInitScript(
    ([key, value]) => {
      if (window.localStorage.getItem(key) === null) window.localStorage.setItem(key, value);
    },
    [SETTINGS_KEY, STORED_SETTINGS],
  );
  await page.goto(`/?bench=${bench}`);
  await page.waitForFunction(() => window.__mc?.getState().bench !== null);
}

function phase(page: Page): Promise<string | null> {
  return page.evaluate(() => window.__mc.getState().bench?.phase ?? null);
}

async function untilPhase(page: Page, wanted: string, timeout = 200_000): Promise<void> {
  await page.waitForFunction((p) => window.__mc.getState().bench?.phase === p, wanted, { timeout });
}

/** Waits until the run has loaded its world: from then on the rules of 5.5 watch it. */
async function untilMeasuring(page: Page): Promise<void> {
  await expect(page.locator('.bench-progress')).toContainText('scenario 1 of 11', {
    timeout: 60_000,
  });
}

function storedWorlds(page: Page): Promise<{ worlds: number; chunks: number }> {
  return page.evaluate(
    () =>
      new Promise<{ worlds: number; chunks: number }>((resolve, reject) => {
        const open = indexedDB.open('markuscraft');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const tx = open.result.transaction(['worlds', 'chunks']);
          const worlds = tx.objectStore('worlds').count();
          const chunks = tx.objectStore('chunks').count();
          tx.oncomplete = () => {
            open.result.close();
            resolve({ worlds: worlds.result, chunks: chunks.result });
          };
        };
      }),
  );
}

// --- AC3.1: the ways in -----------------------------------------------------------------

test('Phase 4P AC3.1: the world menu and ?bench=1 both lead to the start page', async ({
  page,
}) => {
  await openBench(page, '1');
  expect((await getState(page)).bench).toEqual({
    phase: 'start',
    suite: 'full',
    index: 0,
    total: 0,
    scenario: null,
    reason: null,
  });
  await expect(page.locator('.bench-title')).toHaveText('Performance test');
  await expect(page.locator('.bench-hint')).toHaveText(HINTS);
  await expect(page.locator('.bench-start-button')).toHaveText('Start');
  // Nothing was ever measured in this browser.
  await expect(page.locator('.bench-last-button')).toBeHidden();
  await expect(page.locator('.world-menu')).toBeHidden();
  expect((await getState(page)).ui.screen).toBe('bench');

  await page.locator('.bench-back-button').click();
  await expect(page.locator('.world-menu')).toBeVisible();
  await expect(page.locator('.bench-screen')).toBeHidden();
  expect((await getState(page)).bench).toBeNull();

  // No world yet: the form is shown, and it has the button too.
  await expect(page.locator('.world-form')).toBeVisible();
  const button = page.locator('.world-bench-button:visible');
  await expect(button).toHaveText('Performance test');
  await button.click();
  await expect(page.locator('.bench-start')).toBeVisible();
  await expect(page.locator('.bench-hint')).toHaveText(HINTS);
  expect(await phase(page)).toBe('start');
  // Nothing runs before "Start".
  expect((await getState(page)).world).toBeNull();
});

test('Phase 4P AC2.9: without bench the test is not there; test mode ignores the parameter', async ({
  page,
}) => {
  await page.goto('/?test=1&seed=1337&bench=quick');
  await page.waitForFunction(() => window.__mc?.isReady());
  const state = await getState(page);
  expect(state.bench).toBeNull();
  expect(state.world).not.toBeNull();
  expect(await page.evaluate(() => window.__mc.benchResult())).toBeNull();
  await expect(page.locator('.bench-screen')).toHaveCount(0);
});

// --- The quick run by mouse -------------------------------------------------------------

test('Phase 4P AC2.5, AC2.6, AC2.8, AC3.2, AC3.3, AC3.5, AC3.6, AC4.5: the quick run by mouse, from the world menu to a valid issue link', async ({
  page,
  context,
  baseURL,
}) => {
  test.setTimeout(240_000);
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const requests: string[] = [];
  page.on('request', (request) => requests.push(request.url()));

  // A player with a stored world and stored settings.
  await openBench(page, 'quick');
  await page.locator('.bench-back-button').click();
  await createWorld(page, { name: 'Home', seed: '7' });
  await pauseWithMouse(page);
  await backToWorlds(page);
  const settingsBefore = await page.evaluate((key) => localStorage.getItem(key), SETTINGS_KEY);
  expect(settingsBefore).toBe(STORED_SETTINGS);
  const storedBefore = await storedWorlds(page);
  expect(storedBefore.worlds).toBe(1);

  await page.locator('.world-bench-button:visible').click();
  await expect(page.locator('.bench-title')).toHaveText('Performance test (quick)');
  await page.locator('.bench-start-button').click();
  expect(await phase(page)).toBe('running');

  // AC2.6: keys and the mouse belong to nobody during a run.
  await page.keyboard.down('KeyD');
  await page.keyboard.down('Space');
  await page.keyboard.press('KeyE');
  await page.keyboard.press('KeyF');
  // AC3.2: the progress line names the scenario and counts up.
  const seen: string[] = [];
  let flying: { x: number; y: number; yaw: number } | null = null;
  while ((await phase(page)) === 'running') {
    const text = (await page.locator('.bench-progress').textContent()) ?? '';
    if (seen[seen.length - 1] !== text) seen.push(text);
    await page.mouse.move(300 + (seen.length % 5) * 40, 200);
    const state = await getState(page);
    expect(state.ui.screen).not.toBe('inventory');
    if (state.bench?.scenario === 'fly' && state.player.y === 100 && !flying) {
      flying = { x: state.player.x, y: state.player.y, yaw: state.player.yaw };
    }
    await page.waitForTimeout(100);
  }
  await page.keyboard.up('KeyD');
  await page.keyboard.up('Space');
  expect(await phase(page)).toBe('result');
  // Flying goes straight north whatever is pressed, and the run ends where it stood.
  expect(flying).toEqual({ x: -0.5, y: 100, yaw: 0 });
  const end = (await getState(page)).player;
  expect([end.x, end.z, end.yaw, end.pitch]).toEqual([-0.5, 4.5, 0, 0]);
  const lines = seen.filter((text) => text.includes('scenario'));
  expect(lines.length).toBeGreaterThanOrEqual(5);
  for (const text of lines) {
    expect(text).toMatch(
      /^Performance test – scenario \d+ of 11: (standing|walking|flying|building|torches at night)$/,
    );
  }
  const numbers = lines.map((text) => Number(/scenario (\d+)/.exec(text)?.[1]));
  expect(numbers).toEqual([...numbers].sort((a, b) => a - b));
  expect(numbers[numbers.length - 1]).toBe(11);

  // AC2.5: a complete, valid record.
  const result = await page.evaluate(() => window.__mc.benchResult());
  if (!result) throw new Error('no result');
  expect(result.quick).toBe(true);
  expect(result.format).toBe(1);
  expect(result.suite).toBe(2);
  expect(result.workers).toBe('quick');
  expect(result.scenarios.map((s) => s.id)).toEqual(ORDER);
  expect(result.scenarios.map((s) => s.rd)).toEqual([2, 2, 2, 2, 2, 3, 3, 3, 3, 3, 2]);
  for (const s of result.scenarios) {
    expect(s.frames, s.id).toBeGreaterThan(0);
    expect(s.ms, s.id).toBeGreaterThan(0);
    expect(
      s.fh.reduce((a, b) => a + b),
      s.id,
    ).toBe(s.frames);
    expect(
      s.ch.reduce((a, b) => a + b),
      s.id,
    ).toBe(s.frames);
    expect(s.catchUpMs === null, s.id).toBe(s.id !== 'fly');
  }
  expect(result.ready.map((r) => r.rd)).toEqual([2, 3, 2]);
  expect(result.commit).toMatch(/^[0-9a-f]{7}$|^dev$/);
  expect(Math.abs(Date.parse(result.date) - Date.now())).toBeLessThan(600_000);
  expect(result.env.ua).toContain('Chrome');
  expect(result.env.gpu.length).toBeGreaterThan(3);
  expect(result.env).toMatchObject({
    input: 'mouse',
    screenW: 960,
    screenH: 540,
    dpr: 1,
    pixelRatio: 1,
    canvasW: 960,
    canvasH: 540,
  });
  expect(result.env.cores).toBeGreaterThan(0);

  // AC3.2: the result screen.
  const rows = page.locator('.bench-row');
  await expect(rows).toHaveCount(11);
  expect(
    await rows.evaluateAll((list) => list.map((r) => (r as HTMLElement).dataset.scenario)),
  ).toEqual(ORDER);
  const lights = await page.locator('.bench-row .bench-light').allTextContents();
  expect(lights.length).toBe(11);
  for (const light of lights) expect(light).toMatch(/^[GYR]( \(cut off\))?$/);
  await expect(page.locator('.bench-workers')).toHaveText(
    'Web Workers (Part C): not a measurement',
  );
  await expect(page.locator('.bench-result-buttons > *')).toHaveText([
    'Open GitHub issue',
    'Copy result',
    'Show text',
    'Run again',
    'Back',
  ]);

  // AC3.3: the link opens a pre-filled issue of this repository. It is not followed.
  const link = page.locator('.bench-issue-link');
  const href = (await link.getAttribute('href')) ?? '';
  expect(href.startsWith('https://github.com/MarkusHornbach/MarkusCraft/issues/new?')).toBe(true);
  expect(href.length).toBeLessThanOrEqual(7000);
  expect(await link.getAttribute('target')).toBe('_blank');
  const url = new URL(href);
  expect(url.searchParams.get('labels')).toBe('perf-run');
  expect(url.searchParams.get('title')).toMatch(
    /^Performance run \(quick\): mouse, 960×540, build /,
  );
  expect(parseIssueBody(url.searchParams.get('body'))).toEqual(result);

  // AC3.5: the copied text and the shown text are the issue text.
  await page.locator('.bench-copy-button').click();
  await expect(page.locator('.bench-status')).toHaveText('Copied');
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(parseIssueBody(copied)).toEqual(result);
  expect(copied).toBe(url.searchParams.get('body'));
  await expect(page.locator('.bench-text')).toBeHidden();
  await page.locator('.bench-text-button').click();
  await expect(page.locator('.bench-text')).toBeVisible();
  await expect(page.locator('.bench-table-wrap')).toBeHidden();
  expect(await page.locator('.bench-text').inputValue()).toBe(copied);
  await page.locator('.bench-text-button').click();
  await expect(page.locator('.bench-table-wrap')).toBeVisible();

  // AC2.8: nothing was stored but the result, and the settings are untouched.
  expect(await page.evaluate((key) => localStorage.getItem(key), SETTINGS_KEY)).toBe(
    settingsBefore,
  );
  expect(await page.evaluate(() => Object.keys(localStorage).sort())).toEqual([
    RESULT_KEY,
    SETTINGS_KEY,
  ]);
  expect(
    parseIssueBody(await page.evaluate((key) => localStorage.getItem(key), RESULT_KEY)),
  ).toEqual(result);
  expect(await storedWorlds(page)).toEqual(storedBefore);
  await page.locator('.bench-result-back').click();
  await expect(page.locator('.world-list-view')).toBeVisible();
  await expect(page.locator('.world-row-name')).toHaveText(['Home']);
  expect((await getState(page)).bench).toBeNull();
  expect((await getState(page)).world).toBeNull();
  // A world opened afterwards plays at the stored render distance, not at the test's.
  await page.locator('.world-play-button').click();
  await page.waitForFunction(() => window.__mc.getState().world?.name === 'Home');
  expect((await getState(page)).render.renderDistance).toBe(2);
  expect((await getState(page)).seed).toBe(7);
  await page.evaluate(() => document.exitPointerLock());

  // AC4.5: the page talked to nobody but its own server.
  expect(requests.length).toBeGreaterThan(0);
  expect(requests.filter((request) => !request.startsWith(`${baseURL}/`))).toEqual([]);

  // AC3.6: after a reload the start page offers the last result.
  await page.goto('/?bench=quick');
  await untilPhase(page, 'start');
  await expect(page.locator('.bench-last-button')).toBeVisible();
  await page.locator('.bench-last-button').click();
  expect(await phase(page)).toBe('result');
  expect(await page.evaluate(() => window.__mc.benchResult())).toEqual(result);
  await expect(page.locator('.bench-row')).toHaveCount(11);
  // An interrupted run does not replace it.
  await page.locator('.bench-again-button').click();
  await untilPhase(page, 'running');
  await page.locator('.bench-cancel-button').click();
  await untilPhase(page, 'interrupted');
  expect(
    parseIssueBody(await page.evaluate((key) => localStorage.getItem(key), RESULT_KEY)),
  ).toEqual(result);
  await page.locator('.bench-interrupted-back').click();
  await page.locator('.world-bench-button:visible').click();
  await page.locator('.bench-last-button').click();
  expect(await page.evaluate(() => window.__mc.benchResult())).toEqual(result);
});

test('Phase 4P AC3.6: a damaged stored result offers nothing and logs nothing', async ({
  page,
}) => {
  await page.addInitScript((key) => {
    window.localStorage.setItem(key, '<!-- markuscraft-perf v1 -->\n```json\n{"f":1,\n```');
  }, RESULT_KEY);
  await openBench(page, '1');
  await expect(page.locator('.bench-start-button')).toBeVisible();
  await expect(page.locator('.bench-last-button')).toBeHidden();
  expect(await page.evaluate(() => window.__mc.benchResult())).toBeNull();
});

test('Phase 4P AC3.6: the sample result is shown without a run and is not stored', async ({
  page,
}) => {
  await openBench(page, 'sample');
  expect(await phase(page)).toBe('result');
  expect(await page.evaluate(() => window.__mc.benchResult())).toEqual(SAMPLE_RESULT);
  await expect(page.locator('.bench-workers')).toHaveText('Web Workers (Part C): borderline');
  await expect(page.locator('.bench-note').first()).toContainText('slowed down');
  expect(await page.evaluate((key) => localStorage.getItem(key), RESULT_KEY)).toBeNull();
  await page.locator('.bench-result-back').click();
  await page.locator('.world-bench-button:visible').click();
  await expect(page.locator('.bench-last-button')).toBeHidden();
});

// --- AC2.7: what throws a run away ------------------------------------------------------

const STOPS: [string, string, (page: Page) => Promise<void>][] = [
  [
    'hiding the page',
    'hidden',
    (page) =>
      page.evaluate(() => {
        Object.defineProperty(document, 'visibilityState', {
          configurable: true,
          get: () => 'hidden',
        });
        document.dispatchEvent(new Event('visibilitychange'));
      }),
  ],
  [
    'a change of the view size',
    'resize',
    (page) => page.setViewportSize({ width: 900, height: 540 }),
  ],
  ['"Cancel"', 'cancel', (page) => page.locator('.bench-cancel-button').click()],
  ['Esc (AC2.6)', 'cancel', (page) => page.keyboard.press('Escape')],
];

for (const [name, reason, stop] of STOPS) {
  test(`Phase 4P AC2.7: ${name} interrupts the run and nothing is recorded`, async ({ page }) => {
    await openBench(page, 'quick');
    await page.locator('.bench-start-button').click();
    await untilMeasuring(page);
    expect((await getState(page)).world?.name).toBe('Performance test');
    await stop(page);
    await untilPhase(page, 'interrupted', 30_000);
    const state = await getState(page);
    expect(state.bench).toMatchObject({ phase: 'interrupted', reason, suite: 'quick' });
    expect(state.world).toBeNull();
    expect(state.paused).toBe(true);
    expect(await page.evaluate(() => window.__mc.benchResult())).toBeNull();
    expect(await page.evaluate((key) => localStorage.getItem(key), RESULT_KEY)).toBeNull();
    await expect(page.locator('.bench-interrupted-title')).toHaveText(
      'Interrupted – nothing was recorded',
    );
    await expect(page.locator('.bench-reason')).not.toBeEmpty();
    await expect(page.locator('.bench-retry-button')).toHaveText('Start again');
    // "Start again" begins a new run; "Back" after that leads to the world menu.
    await page.locator('.bench-retry-button').click();
    await untilPhase(page, 'running', 30_000);
    await page.locator('.bench-cancel-button').click();
    await untilPhase(page, 'interrupted', 30_000);
    await page.locator('.bench-interrupted-back').click();
    await expect(page.locator('.world-menu')).toBeVisible();
    expect(await page.evaluate((key) => localStorage.getItem(key), 'markuscraft.settings.v1')).toBe(
      STORED_SETTINGS,
    );
  });
}

// --- Touch -------------------------------------------------------------------------------

test.describe('on a touch device', () => {
  test.use(TOUCH_DEVICE);

  test('Phase 4P AC3.4: a tap on "Start" runs the test in touch mode; fingers and portrait', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    // A headless window in fullscreen cannot be turned.
    await withoutFullscreen(page);
    await openBench(page, 'quick');
    await page.locator('.bench-start-button').tap();
    await untilMeasuring(page);
    expect((await getState(page)).touch).toBe(true);
    // The touch controls are in the document but take nothing: a look drag turns nobody.
    await expect(page.locator('.touch-hud')).toHaveClass(/covered/);
    while ((await phase(page)) === 'running') {
      await swipe(page, { x: 700, y: 300 }, { x: 800, y: 260 }, 3);
      await swipe(page, { x: 150, y: 400 }, { x: 150, y: 330 }, 3);
      const state = await getState(page);
      // Flying looks north; the height tells that the player was put in place already.
      if (state.bench?.scenario === 'fly' && state.player.y === 100) {
        expect(state.player.yaw).toBe(0);
        expect(state.player.x).toBe(-0.5);
      }
    }
    expect(await phase(page)).toBe('result');
    const result = await page.evaluate(() => window.__mc.benchResult());
    if (!result) throw new Error('no result');
    expect(result.env.input).toBe('touch');
    expect(result.env.pixelRatio).toBeLessThanOrEqual(1.5);
    expect(result.scenarios.map((s) => s.id)).toEqual(ORDER);
    expect(result.workers).toBe('quick');
    const end = (await getState(page)).player;
    expect([end.x, end.z, end.yaw, end.pitch]).toEqual([-0.5, 4.5, 0, 0]);

    // Turning the device upright during a run throws it away.
    await page.locator('.bench-again-button').tap();
    await untilMeasuring(page);
    await page.setViewportSize({ width: 540, height: 960 });
    await untilPhase(page, 'interrupted', 30_000);
    expect((await getState(page)).bench?.reason).toBe('portrait');
    expect(await page.evaluate(() => window.__mc.benchResult())).toBeNull();
    // The result of the finished run is still the stored one.
    expect(
      parseIssueBody(await page.evaluate((key) => localStorage.getItem(key), RESULT_KEY)),
    ).toEqual(result);
  });

  for (const view of [
    { width: 640, height: 360 },
    { width: 1280, height: 800 },
  ]) {
    test(`Phase 4P AC3.7: start page and result fit ${view.width} × ${view.height}`, async ({
      page,
    }) => {
      await page.setViewportSize(view);
      await openBench(page, 'sample');
      const pageFits = (): Promise<boolean> =>
        page.evaluate(() => {
          const root = document.scrollingElement;
          return (
            !!root &&
            root.scrollHeight <= window.innerHeight &&
            root.scrollWidth <= window.innerWidth
          );
        });
      const boxes = async (selector: string) => {
        const list = [];
        for (const item of await page.locator(selector).all()) {
          if (!(await item.isVisible())) continue;
          const box = await item.boundingBox();
          if (box) list.push({ ...box, name: (await item.textContent()) ?? '' });
        }
        return list;
      };
      const expectUsable = (list: Awaited<ReturnType<typeof boxes>>): void => {
        for (const box of list) {
          expect(box.width, box.name).toBeGreaterThanOrEqual(48);
          expect(box.height, box.name).toBeGreaterThanOrEqual(48);
          expect(box.x, box.name).toBeGreaterThanOrEqual(0);
          expect(box.y, box.name).toBeGreaterThanOrEqual(0);
          expect(box.x + box.width, box.name).toBeLessThanOrEqual(view.width);
          expect(box.y + box.height, box.name).toBeLessThanOrEqual(view.height);
        }
      };

      // The result screen: five buttons, all on screen; the panel inside the view.
      await expect(page.locator('.bench-row')).toHaveCount(11);
      expect(await pageFits()).toBe(true);
      const resultButtons = await boxes('.bench-result-buttons > *');
      expect(resultButtons.map((b) => b.name)).toEqual([
        'Open GitHub issue',
        'Copy result',
        'Show text',
        'Run again',
        'Back',
      ]);
      expectUsable(resultButtons);
      const panel = await page.locator('.bench-panel').boundingBox();
      expect(panel && panel.y >= 0 && panel.y + panel.height <= view.height).toBe(true);
      const scroll = await page.locator('.bench-table-wrap').evaluate((wrap) => {
        wrap.scrollTop = 10_000;
        return { moved: wrap.scrollTop, room: wrap.scrollHeight - wrap.clientHeight };
      });
      if (view.height === 360) {
        // On the phone the table is longer than its place and scrolls inside the panel.
        expect(scroll.room).toBeGreaterThan(0);
        expect(scroll.moved).toBe(scroll.room);
      }
      expect(await pageFits()).toBe(true);
      // The text view keeps the buttons on screen as well.
      await page.locator('.bench-text-button').tap();
      await expect(page.locator('.bench-text')).toBeVisible();
      expectUsable(await boxes('.bench-result-buttons > *'));
      expect(await pageFits()).toBe(true);

      // The start page.
      await page.locator('.bench-result-back').tap();
      await page.locator('.world-bench-button:visible').tap();
      await expect(page.locator('.bench-hint')).toHaveCount(6);
      const startButtons = await boxes('.bench-start button');
      expect(startButtons.map((b) => b.name)).toEqual(['Start', 'Back']);
      expectUsable(startButtons);
      for (const hint of await boxes('.bench-hint')) {
        expect(hint.y, hint.name).toBeGreaterThanOrEqual(0);
        expect(hint.y + hint.height, hint.name).toBeLessThanOrEqual(startButtons[0].y);
      }
      expect(await pageFits()).toBe(true);
    });
  }
});

// --- AC3.8: reference screenshots -------------------------------------------------------

test('Phase 4P AC3.8: the start page and the result screen match their references', async ({
  page,
}) => {
  await openBench(page, 'sample');
  await expect(page.locator('.bench-row')).toHaveCount(11);
  await expect(page).toHaveScreenshot('bench-result.png', { maxDiffPixelRatio: 0.05 });
  await page.locator('.bench-result-back').click();
  await page.locator('.world-bench-button:visible').click();
  await expect(page.locator('.bench-start')).toBeVisible();
  await expect(page).toHaveScreenshot('bench-start.png', { maxDiffPixelRatio: 0.05 });
});
