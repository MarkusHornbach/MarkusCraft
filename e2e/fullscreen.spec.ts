// Fullscreen on the touch play buttons (Phase 3 step 5). The browser API is stubbed:
// headless fullscreen is unreliable, and the rule under test is when the game asks.
import type { Page } from '@playwright/test';
import { test, expect } from './fixtures';
import {
  backToWorlds,
  createWorld,
  getState,
  openMenu,
  pauseWithMouse,
  untilPlaying,
} from './game';
import { TOUCH_DEVICE } from './touch';

type Stub = 'works' | 'rejects' | 'throws' | 'missing';

interface FullscreenLog {
  /** Event type that was being handled at each request ("click" for a tap). */
  requests: string[];
  active: boolean[];
  exits: number;
}

/** Replaces the fullscreen API by a recording fake before the page starts. */
async function stubFullscreen(page: Page, kind: Stub): Promise<void> {
  await page.addInitScript((stub) => {
    const log = { requests: [] as string[], active: [] as boolean[], exits: 0 };
    let element: Element | null = null;
    (window as unknown as { fullscreenLog: typeof log }).fullscreenLog = log;
    Object.defineProperty(Document.prototype, 'fullscreenElement', {
      configurable: true,
      get: () => element,
    });
    const change = (next: Element | null): void => {
      element = next;
      document.dispatchEvent(new Event('fullscreenchange'));
    };
    if (stub === 'missing') {
      // An iPhone: pages have no fullscreen at all.
      Object.defineProperty(Element.prototype, 'requestFullscreen', {
        configurable: true,
        value: undefined,
      });
      return;
    }
    Element.prototype.requestFullscreen = function (this: Element): Promise<void> {
      // `window.event` is the event whose handler is running right now.
      log.requests.push(window.event?.type ?? 'none');
      log.active.push(navigator.userActivation.isActive);
      if (stub === 'throws') throw new TypeError('not allowed');
      if (stub === 'rejects') return Promise.reject(new TypeError('not allowed'));
      change(this);
      return Promise.resolve();
    };
    Document.prototype.exitFullscreen = function (): Promise<void> {
      log.exits++;
      change(null);
      return Promise.resolve();
    };
  }, kind);
}

function fullscreenLog(page: Page): Promise<FullscreenLog> {
  return page.evaluate(() => (window as unknown as { fullscreenLog: FullscreenLog }).fullscreenLog);
}

async function tapMenu(page: Page): Promise<void> {
  await page.locator('.touch-menu').tap();
  await page.waitForFunction(() => window.__mc.getState().paused);
}

async function tapContinue(page: Page): Promise<void> {
  await page.locator('.play-button:visible').tap();
  await page.waitForFunction(() => !window.__mc.getState().paused);
}

test.describe('by touch', () => {
  test.use(TOUCH_DEVICE);

  test('a tap on a play or continue button requests fullscreen once, inside the tap (Phase 3 AC5.1)', async ({
    page,
  }) => {
    await stubFullscreen(page, 'works');
    await openMenu(page);
    expect((await fullscreenLog(page)).requests).toEqual([]);

    // "Create and play".
    await createWorld(page, { tap: true });
    let log = await fullscreenLog(page);
    expect(log.requests).toEqual(['click']);
    expect(log.active).toEqual([true]);
    expect(await page.evaluate(() => document.fullscreenElement === document.documentElement)).toBe(
      true,
    );

    // Already in fullscreen: "Tap to continue" and the list's play button do not ask again.
    await tapMenu(page);
    await expect(page.locator('.fullscreen-button')).toHaveText('Exit fullscreen');
    await tapContinue(page);
    await tapMenu(page);
    await backToWorlds(page, true);
    await page.locator('.world-play-button').tap();
    await page.waitForFunction(() => !window.__mc.getState().paused);
    expect((await fullscreenLog(page)).requests).toEqual(['click']);

    // Fullscreen was left by the system (back gesture): the next continue asks again.
    await tapMenu(page);
    await page.evaluate(() => document.exitFullscreen());
    await expect(page.locator('.fullscreen-button')).toHaveText('Fullscreen');
    await tapContinue(page);
    log = await fullscreenLog(page);
    expect(log.requests).toEqual(['click', 'click']);
    expect(log.active).toEqual([true, true]);

    // The player chooses "Exit fullscreen": from now on no button asks unasked …
    await tapMenu(page);
    await page.locator('.fullscreen-button').tap();
    await expect(page.locator('.fullscreen-button')).toHaveText('Fullscreen');
    await tapContinue(page);
    await tapMenu(page);
    await backToWorlds(page, true);
    await page.locator('.world-play-button').tap();
    await page.waitForFunction(() => !window.__mc.getState().paused);
    expect((await fullscreenLog(page)).requests).toEqual(['click', 'click']);
    // … but the fullscreen button itself still works.
    await tapMenu(page);
    await page.locator('.fullscreen-button').tap();
    await expect(page.locator('.fullscreen-button')).toHaveText('Exit fullscreen');
    expect((await fullscreenLog(page)).requests.length).toBe(3);
  });

  for (const kind of ['rejects', 'throws', 'missing'] as const) {
    test(`the game starts without a message when fullscreen ${kind} (Phase 3 AC5.1)`, async ({
      page,
    }) => {
      await stubFullscreen(page, kind);
      await openMenu(page);
      await createWorld(page, { tap: true });
      expect((await getState(page)).paused).toBe(false);
      await expect(page.locator('.touch-hud')).toBeVisible();
      await tapMenu(page);
      await expect(page.locator('.pause-hint')).toHaveText('');
      await tapContinue(page);
      if (kind !== 'missing') {
        // Each tap tried once; the refusal showed nothing.
        expect((await fullscreenLog(page)).requests).toEqual(['click', 'click']);
      }
      // The console fixture proves that no error or warning was logged.
    });
  }
});

test('in mouse mode no button requests fullscreen (Phase 3 AC5.1)', async ({ page }) => {
  await stubFullscreen(page, 'works');
  await openMenu(page);
  await createWorld(page);
  await pauseWithMouse(page);
  await page.locator('.play-button:visible').click();
  await untilPlaying(page);
  await pauseWithMouse(page);
  await backToWorlds(page);
  await page.locator('.world-play-button').click();
  await untilPlaying(page);
  expect((await getState(page)).touch).toBe(false);
  expect((await fullscreenLog(page)).requests).toEqual([]);
});
