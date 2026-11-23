// The world menu: create, continue, delete and switch worlds (Phase 3 step 4).
import type { Page } from '@playwright/test';
import { test, expect } from './fixtures';
import {
  backToWorlds,
  createWorld,
  getBlock,
  getState,
  openMenu,
  pauseWithMouse,
  untilPlaying,
  whenIdle,
} from './game';
import { TOUCH_DEVICE, withoutFullscreen } from './touch';
import {
  TERRAIN_CHECKSUM_1337_V1,
  TERRAIN_CHECKSUMS_1337_V2,
} from '../src/testing/terrainChecksum';
import { findSpawn } from '../src/world/generation/spawn';
import { getTerrain } from '../src/world/generation/terrain';

// Several worlds are created per test, each under slow software rendering.
test.describe.configure({ timeout: 180_000 });

const AIR = 0;
const BRICKS = 8;
const NOTE = 'Worlds are saved in this browser, on this device only.';
const NO_TREES_HINT = 'No trees only in Creative: Gathering needs wood.';

function rows(page: Page) {
  return page.locator('.world-row');
}

/** Names of the listed worlds, top to bottom. */
function listedNames(page: Page): Promise<string[]> {
  return page.locator('.world-row-name').allTextContents();
}

/** Raw world records in IndexedDB, read by a second connection. */
function storedWorlds(page: Page): Promise<{ id: string; name: string; seed: number }[]> {
  return page.evaluate(
    () =>
      new Promise<{ id: string; name: string; seed: number }[]>((resolve, reject) => {
        const open = indexedDB.open('markuscraft');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const all = open.result.transaction('worlds').objectStore('worlds').getAll();
          all.onsuccess = () => {
            open.result.close();
            resolve(all.result as { id: string; name: string; seed: number }[]);
          };
        };
      }),
  );
}

/** Places a marker block next to the player (test tool) and returns its position. */
async function mark(page: Page, id = BRICKS): Promise<{ x: number; y: number; z: number }> {
  const { player } = await getState(page);
  const cell = { x: Math.floor(player.x) + 1, y: 100, z: Math.floor(player.z) };
  await page.evaluate(
    ([x, y, z, block]) => window.__mc.setBlock(x, y, z, block),
    [cell.x, cell.y, cell.z, id],
  );
  return cell;
}

test('a first visit creates a world; after a reload it is listed and continues (Phase 3 AC4.1)', async ({
  page,
}) => {
  await openMenu(page);
  // No world yet: the form is what the screen shows.
  await expect(page.locator('.world-form')).toBeVisible();
  await expect(page.locator('.world-list-view')).toBeHidden();
  await expect(page.locator('#world-name')).toHaveValue('My world');
  await expect(page.locator('#world-seed')).toHaveValue('');
  await expect(page.locator('.world-back-button')).toBeHidden();
  await expect(page.locator('.world-note')).toHaveText(NOTE);
  expect((await getState(page)).world).toBeNull();

  await createWorld(page);
  const created = await getState(page);
  expect(created.world).toMatchObject({
    name: 'My world',
    generatorVersion: 2,
    options: { terrain: 'balanced', trees: 'few' },
  });
  expect(created.mode).toBe('creative');
  const cell = await mark(page);

  // Pausing saves; the page is reloaded without going back to the menu first.
  await pauseWithMouse(page);
  await expect(page.locator('.save-state')).toHaveText('Saved');
  await page.reload();
  await page.waitForFunction(() => window.__mc !== undefined);
  await expect(rows(page)).toHaveCount(1);
  await expect(page.locator('.world-form')).toBeHidden();
  await expect(rows(page).first()).toHaveClass(/selected/);
  await expect(page.locator('.world-row-name')).toHaveText('My world');
  await expect(page.locator('.world-row-mode')).toHaveText('Creative · Balanced · Few trees');
  await expect(page.locator('.world-row-date')).toHaveText(/^[A-Z][a-z]{2} \d{1,2}, \d{4}$/);
  await expect(page.locator('.world-play-button')).toHaveText('Click to play');

  await page.locator('.world-play-button').click();
  await untilPlaying(page);
  await whenIdle(page);
  const continued = await getState(page);
  expect(continued.world).toEqual(created.world);
  expect(continued.seed).toBe(created.seed);
  expect(await getBlock(page, cell.x, cell.y, cell.z)).toBe(BRICKS);
});

test('seeds: digits are the number, empty is random; the list is ordered by last play (Phase 3 AC4.2)', async ({
  page,
}) => {
  await openMenu(page);
  await createWorld(page, { name: 'First' });
  const first = (await getState(page)).seed;
  await pauseWithMouse(page);
  await backToWorlds(page);

  await page.locator('.world-new-button').click();
  // The default name avoids names that are taken; "First" is not the default.
  await expect(page.locator('#world-name')).toHaveValue('My world');
  await createWorld(page, { name: 'Digits', seed: '1337' });
  expect((await getState(page)).seed).toBe(1337);
  await pauseWithMouse(page);
  await backToWorlds(page);

  await createWorld(page, { name: 'Random too' });
  const third = (await getState(page)).seed;
  expect(third).not.toBe(first);
  await pauseWithMouse(page);
  await backToWorlds(page);

  await createWorld(page, { name: 'Words', seed: 'Bear cave' });
  const words = (await getState(page)).seed;
  await pauseWithMouse(page);
  await backToWorlds(page);
  await createWorld(page, { name: 'Words again', seed: ' Bear cave ' });
  expect((await getState(page)).seed).toBe(words);
  await pauseWithMouse(page);
  await backToWorlds(page);

  // Most recently played first.
  expect(await listedNames(page)).toEqual([
    'Words again',
    'Words',
    'Random too',
    'Digits',
    'First',
  ]);
  await expect(rows(page).first()).toHaveClass(/selected/);

  // Playing an older world moves it to the top.
  await rows(page).nth(3).click();
  await expect(rows(page).nth(3)).toHaveClass(/selected/);
  await page.locator('.world-play-button').click();
  await untilPlaying(page);
  expect((await getState(page)).world?.name).toBe('Digits');
  await pauseWithMouse(page);
  await backToWorlds(page);
  expect(await listedNames(page)).toEqual([
    'Digits',
    'Words again',
    'Words',
    'Random too',
    'First',
  ]);
});

test('deleting asks first; "Keep" keeps, "Delete" removes for good (Phase 3 AC4.3)', async ({
  page,
}) => {
  await openMenu(page);
  await createWorld(page, { name: 'Stays' });
  await mark(page);
  await pauseWithMouse(page);
  await backToWorlds(page);
  await createWorld(page, { name: 'Goes' });
  await mark(page);
  await pauseWithMouse(page);
  await backToWorlds(page);
  expect(await listedNames(page)).toEqual(['Goes', 'Stays']);

  await page.locator('.world-delete-button').click();
  await expect(page.locator('.world-confirm')).toBeVisible();
  await expect(page.locator('.world-confirm-name')).toHaveText('Goes');
  await expect(page.locator('.world-confirm-question')).toHaveText('Delete this world for ever?');
  await expect(page.locator('.world-confirm-delete')).toHaveText('Delete');
  await expect(page.locator('.world-confirm-keep')).toHaveText('Keep');
  await page.locator('.world-confirm-keep').click();
  await expect(page.locator('.world-confirm')).toBeHidden();
  expect(await listedNames(page)).toEqual(['Goes', 'Stays']);
  expect((await storedWorlds(page)).length).toBe(2);

  await page.locator('.world-delete-button').click();
  await page.locator('.world-confirm-delete').click();
  await expect(rows(page)).toHaveCount(1);
  expect(await listedNames(page)).toEqual(['Stays']);
  const stored = await storedWorlds(page);
  expect(stored.map((w) => w.name)).toEqual(['Stays']);
  // Its chunk records are gone as well.
  const chunkOwners = await page.evaluate(
    () =>
      new Promise<string[]>((resolve) => {
        const open = indexedDB.open('markuscraft');
        open.onsuccess = () => {
          const all = open.result.transaction('chunks').objectStore('chunks').getAll();
          all.onsuccess = () => {
            open.result.close();
            resolve((all.result as { worldId: string }[]).map((c) => c.worldId));
          };
        };
      }),
  );
  expect(chunkOwners).toEqual([stored[0].id]);

  await page.reload();
  await page.waitForFunction(() => window.__mc !== undefined);
  await expect(rows(page)).toHaveCount(1);
  expect(await listedNames(page)).toEqual(['Stays']);

  // Deleting the last world leads back to the form.
  await page.locator('.world-delete-button').click();
  await page.locator('.world-confirm-delete').click();
  await expect(page.locator('.world-form')).toBeVisible();
  await expect(rows(page)).toHaveCount(0);
});

test('"Save and back to worlds" switches worlds without a page reload (Phase 3 AC4.4)', async ({
  page,
}) => {
  await openMenu(page);
  // A value on the page object survives only as long as the page is not reloaded.
  await page.evaluate(() => {
    (window as unknown as { marker: string }).marker = 'same page';
  });
  await createWorld(page, { name: 'One', seed: '1' });
  const one = await getState(page);
  const cell = await mark(page);
  await pauseWithMouse(page);
  await expect(page.locator('.back-button')).toHaveText('Save and back to worlds');
  await backToWorlds(page);
  expect((await getState(page)).world).toBeNull();
  expect((await getState(page)).paused).toBe(true);
  await expect(page.locator('.hotbar')).toBeHidden();

  await createWorld(page, { name: 'Two', seed: '2' });
  const two = await getState(page);
  expect(two.world?.name).toBe('Two');
  expect(two.seed).toBe(2);
  await whenIdle(page);
  expect((await getState(page)).chunks).toMatchObject({ loaded: 25, pending: 0 });
  expect(await getBlock(page, cell.x, cell.y, cell.z)).toBe(AIR);
  await page.evaluate(
    ([x, y, z]) => window.__mc.setBlock(x, y, z, 8),
    [cell.x, cell.y + 1, cell.z],
  );
  await pauseWithMouse(page);
  await backToWorlds(page);

  await rows(page).filter({ hasText: 'One' }).click();
  await page.locator('.world-play-button').click();
  await untilPlaying(page);
  await whenIdle(page);
  const again = await getState(page);
  expect(again.world).toEqual(one.world);
  expect(again.seed).toBe(1);
  expect(again.player.x).toBeCloseTo(one.player.x, 2);
  expect(await getBlock(page, cell.x, cell.y, cell.z)).toBe(BRICKS);
  expect(await getBlock(page, cell.x, cell.y + 1, cell.z)).toBe(AIR);
  expect(await page.evaluate(() => (window as unknown as { marker: string }).marker)).toBe(
    'same page',
  );
});

test('a seed link opens the form with that seed; the pause menu copies such a link (Phase 3 AC4.5)', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await openMenu(page, '?seed=42');
  await expect(page.locator('.world-form')).toBeVisible();
  await expect(page.locator('#world-seed')).toHaveValue('42');
  await createWorld(page);
  expect((await getState(page)).seed).toBe(42);
  await pauseWithMouse(page);
  await expect(page.locator('.seed-value')).toHaveText('42');
  const link = await page.locator('.seed-link').inputValue();
  expect(link).toBe('http://localhost:4173/?seed=42');
  await page.locator('.copy-link-button').click();
  await expect(page.locator('.copy-link-button')).toHaveText('Link copied');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(link);

  // With a world stored, the link still opens the form, now with a way back to the list.
  await page.goto(link);
  await page.waitForFunction(() => window.__mc !== undefined);
  await expect(page.locator('.world-form')).toBeVisible();
  await expect(page.locator('#world-seed')).toHaveValue('42');
  await expect(page.locator('#world-name')).toHaveValue('My world 2');
  await page.locator('.world-back-button').click();
  await expect(rows(page)).toHaveCount(1);
});

test('a world that is open in another tab cannot be opened a second time (Phase 3 AC4.6)', async ({
  page,
  context,
}) => {
  await openMenu(page);
  await createWorld(page, { name: 'Shared' });
  await pauseWithMouse(page);

  const second = await context.newPage();
  await openMenu(second);
  await expect(second.locator('.world-row-name')).toHaveText('Shared');
  await second.locator('.world-play-button').click();
  await expect(second.locator('.world-message')).toHaveText('This world is open in another tab.');
  await expect(second.locator('.world-menu')).toBeVisible();
  expect((await second.evaluate(() => window.__mc.getState())).world).toBeNull();
  expect(await second.evaluate(() => document.pointerLockElement)).toBeNull();
  // It cannot be deleted from there either.
  await second.locator('.world-delete-button').click();
  await second.locator('.world-confirm-delete').click();
  await expect(second.locator('.world-message')).toHaveText('This world is open in another tab.');
  await expect(second.locator('.world-row')).toHaveCount(1);

  await page.close();
  // The lock goes with the tab; the browser may need a moment to release it.
  await expect(async () => {
    // Under load the world may arrive after a round gave up: then the button is gone.
    const open = await second.evaluate(() => window.__mc.getState().world !== null);
    if (!open) await second.locator('.world-play-button').click({ timeout: 2000 });
    await second.waitForFunction(() => window.__mc.getState().world !== null, null, {
      timeout: 5000,
    });
  }).toPass();
  expect((await second.evaluate(() => window.__mc.getState())).world?.name).toBe('Shared');
});

test('a damaged world is listed, cannot be played, and can be deleted (Phase 3 AC4.7)', async ({
  page,
}) => {
  await openMenu(page);
  await createWorld(page, { name: 'Healthy' });
  const cell = await mark(page);
  await pauseWithMouse(page);
  await backToWorlds(page);

  // Records as a broken or a future version of the game might leave them.
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('markuscraft');
        open.onsuccess = () => {
          const tx = open.result.transaction('worlds', 'readwrite');
          tx.objectStore('worlds').put({ id: 'broken', name: 'Broken world', seed: 'oops' });
          tx.objectStore('worlds').put({
            id: 'future',
            name: 'From the future',
            formatVersion: 99,
          });
          tx.oncomplete = () => {
            open.result.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
  );
  await page.reload();
  await page.waitForFunction(() => window.__mc !== undefined);
  await expect(rows(page)).toHaveCount(3);
  expect(await listedNames(page)).toEqual(['Healthy', 'Broken world', 'From the future']);
  const broken = rows(page).filter({ hasText: 'Broken world' });
  const future = rows(page).filter({ hasText: 'From the future' });
  await expect(broken.locator('.world-row-problem')).toHaveText('Damaged');
  await expect(future.locator('.world-row-problem')).toHaveText('Saved by a newer version');

  // Neither can be played …
  await broken.click();
  await expect(page.locator('.world-play-button')).toBeDisabled();
  await future.click();
  await expect(page.locator('.world-play-button')).toBeDisabled();
  await expect(page.locator('.world-delete-button')).toBeEnabled();
  // … the damaged one can be deleted …
  await broken.click();
  await page.locator('.world-delete-button').click();
  await expect(page.locator('.world-confirm-name')).toHaveText('Broken world');
  await page.locator('.world-confirm-delete').click();
  await expect(rows(page)).toHaveCount(2);
  expect((await storedWorlds(page)).map((w) => w.id).sort()).not.toContain('broken');

  // … and the healthy world works as before.
  await expect(rows(page).first()).toHaveClass(/selected/);
  await expect(page.locator('.world-play-button')).toBeEnabled();
  await page.locator('.world-play-button').click();
  await untilPlaying(page);
  await whenIdle(page);
  expect((await getState(page)).world?.name).toBe('Healthy');
  expect(await getBlock(page, cell.x, cell.y, cell.z)).toBe(BRICKS);
});

for (const answer of ['granted', 'rejecting'] as const) {
  test(`persistent storage is requested once after the first world is created (${answer}; Phase 3 AC4.8)`, async ({
    page,
  }) => {
    await page.addInitScript((kind) => {
      const calls = { count: 0 };
      (window as unknown as { persistCalls: { count: number } }).persistCalls = calls;
      Object.defineProperty(navigator.storage, 'persist', {
        configurable: true,
        value: () => {
          calls.count++;
          return kind === 'granted' ? Promise.resolve(true) : Promise.reject(new Error('no'));
        },
      });
    }, answer);
    const calls = (): Promise<number> =>
      page.evaluate(
        () => (window as unknown as { persistCalls: { count: number } }).persistCalls.count,
      );

    await openMenu(page);
    expect(await calls()).toBe(0);
    await createWorld(page, { name: 'One' });
    expect(await calls()).toBe(1);
    await pauseWithMouse(page);
    await backToWorlds(page);
    // Neither a second world nor continuing one asks again.
    await createWorld(page, { name: 'Two' });
    await pauseWithMouse(page);
    await backToWorlds(page);
    await page.locator('.world-play-button').click();
    await untilPlaying(page);
    expect(await calls()).toBe(1);
    // The console fixture proves that a rejection causes no message.
  });
}

test('the settings page opens from the world menu and leads back (Phase 3 AC4.10)', async ({
  page,
}) => {
  await openMenu(page);
  await page.locator('.world-form-settings-button').click();
  await expect(page.locator('.world-menu')).toBeHidden();
  await expect(page.locator('.pause-screen')).toBeVisible();
  await expect(page.locator('.controls-list dt')).toHaveCount(12);
  await expect(page.locator('#setting-fov')).toBeVisible();
  // No world is open: no continue button, no seed, no link.
  await expect(page.locator('.pause-screen .play-button')).toHaveCount(0);
  await expect(page.locator('.seed-value, .copy-link-button')).toHaveCount(0);
  await expect(page.locator('.back-button')).toHaveText('Back to worlds');
  await page.locator('.back-button').click();
  await expect(page.locator('.world-menu')).toBeVisible();
  await expect(page.locator('.pause-screen')).toBeHidden();
  await expect(page.locator('.world-form')).toBeVisible();
});

test('a refused mouse capture leaves the pause menu with a way on', async ({ page }) => {
  // Browsers sometimes refuse to capture the mouse, e.g. shortly after it was released.
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.requestPointerLock;
    let refusals = 1;
    HTMLCanvasElement.prototype.requestPointerLock = function (
      this: HTMLCanvasElement,
      ...args: []
    ) {
      if (refusals-- > 0) return Promise.reject(new DOMException('refused', 'NotAllowedError'));
      return Reflect.apply(original, this, args) as Promise<void>;
    } as typeof original;
  });
  await openMenu(page);
  await page.locator('.world-create-button').click();
  // The world is open, but paused: the pause menu says what to do.
  await expect(page.locator('.pause-screen')).toBeVisible();
  await expect(page.locator('.pause-hint')).toHaveText(
    'The browser did not capture the mouse yet. Please click again.',
  );
  await expect(page.locator('.play-button:visible')).toHaveText('Click to play');
  const state = await getState(page);
  expect(state.paused).toBe(true);
  expect(state.world?.name).toBe('My world');

  await page.locator('.play-button:visible').click();
  await page.waitForFunction(() => !window.__mc.getState().paused);
  expect(await page.evaluate(() => document.pointerLockElement?.tagName)).toBe('CANVAS');
  await expect(page.locator('.pause-hint')).toHaveText('');
});

test('a world menu without IndexedDB plays in memory and says so', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'indexedDB', {
      configurable: true,
      get: () => {
        throw new Error('blocked');
      },
    });
  });
  await openMenu(page);
  await expect(page.locator('.world-message')).toHaveText(
    'Worlds cannot be saved in this browser window.',
  );
  await createWorld(page);
  expect((await getState(page)).world?.name).toBe('My world');
  await pauseWithMouse(page);
  await backToWorlds(page);
  // The world lives as long as the page does.
  await expect(rows(page)).toHaveCount(1);
});

test('matches the world menu reference screenshot (Phase 3 AC4.11)', async ({ page }) => {
  // A fixed date: the list shows when each world was played last.
  await page.clock.setFixedTime(new Date('2026-07-04T12:00:00Z'));
  await openMenu(page);
  await createWorld(page, { name: 'Castle by the lake', seed: '1337' });
  await pauseWithMouse(page);
  await backToWorlds(page);
  await page.clock.setFixedTime(new Date('2026-07-05T12:00:00Z'));
  await createWorld(page, { name: 'My world', seed: '7' });
  await pauseWithMouse(page);
  await backToWorlds(page);
  await expect(rows(page)).toHaveCount(2);
  expect(await listedNames(page)).toEqual(['My world', 'Castle by the lake']);
  await expect(page.locator('.world-row-date').first()).toHaveText('Jul 5, 2026');
  // Text only, as the pause screen: the raised tolerance for other system fonts.
  await expect(page).toHaveScreenshot('world-menu.png', { maxDiffPixelRatio: 0.05 });
});

test.describe('by touch', () => {
  test.use(TOUCH_DEVICE);

  interface Box {
    name: string;
    x: number;
    y: number;
    width: number;
    height: number;
  }

  function boxes(page: Page, selector: string): Promise<Box[]> {
    return page.evaluate((sel) => {
      const result: Box[] = [];
      for (const node of document.querySelectorAll<HTMLElement>(sel)) {
        const r = node.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        result.push({ name: node.className, x: r.x, y: r.y, width: r.width, height: r.height });
      }
      return result;
    }, selector);
  }

  function check(list: Box[], view: { width: number; height: number }): void {
    for (const box of list) {
      expect(box.width, box.name).toBeGreaterThanOrEqual(48);
      expect(box.height, box.name).toBeGreaterThanOrEqual(48);
      expect(box.x, box.name).toBeGreaterThanOrEqual(0);
      expect(box.y, box.name).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width, box.name).toBeLessThanOrEqual(view.width);
      expect(box.y + box.height, box.name).toBeLessThanOrEqual(view.height);
    }
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i];
        const b = list[j];
        const overlap =
          a.x < b.x + b.width &&
          b.x < a.x + a.width &&
          a.y < b.y + b.height &&
          b.y < a.y + a.height;
        expect(overlap, `${a.name} / ${b.name}`).toBe(false);
      }
    }
  }

  for (const [device, view] of [
    ['phone', { width: 640, height: 360 }],
    ['tablet', { width: 1280, height: 800 }],
  ] as const) {
    test(`the world menu works by taps on a ${view.width} × ${view.height} ${device} (Phase 3 AC4.9, Phase 7 AC6.3)`, async ({
      page,
    }) => {
      await page.setViewportSize(view);
      await withoutFullscreen(page);
      await openMenu(page);
      expect((await getState(page)).touch).toBe(true);

      // The form: fields and buttons are finger-sized, on screen and apart. On the tablet
      // the world part fits without scrolling; on the phone the form scrolls since the
      // Terrain and Trees rows (Phase 7 AC6.3). "Join a world" (Phase 6) follows below it
      // and is reached by scrolling (its own check: Phase 6 AC7.13).
      const formParts = '.world-view button, .world-view input';
      if (device === 'tablet') {
        check(await boxes(page, formParts), view);
        const form = (await boxes(page, '.world-form'))[0];
        expect(form.y + form.height).toBeLessThanOrEqual(view.height);
      } else {
        check(await boxes(page, formParts), { width: view.width, height: Infinity });
        // Phase 7 AC6.3: "Create and play" is reached by scrolling and nothing covers it.
        const create = page.locator('.world-create-button');
        await create.scrollIntoViewIfNeeded();
        const [box] = await boxes(page, '.world-create-button');
        expect(box.y).toBeGreaterThanOrEqual(0);
        expect(box.y + box.height).toBeLessThanOrEqual(view.height);
        const hit = await page.evaluate(
          ([x, y]) => document.elementFromPoint(x, y)?.closest('button')?.className ?? '',
          [box.x + box.width / 2, box.y + box.height / 2],
        );
        expect(hit).toContain('world-create-button');
        // The trees row's four buttons fit the phone's width.
        check(await boxes(page, '.world-trees-field button'), {
          width: view.width,
          height: Infinity,
        });
        await page.locator('#world-name').scrollIntoViewIfNeeded();
      }
      await page.locator('#world-name').tap();
      await expect(page.locator('#world-name')).toBeFocused();
      await page.keyboard.press('Control+A');
      await page.keyboard.type('Tapped');
      await page.locator('#world-seed').tap();
      await page.keyboard.type('77');
      await page.locator('.world-create-button').tap();
      await page.waitForFunction(() => !window.__mc.getState().paused);
      const state = await getState(page);
      expect(state.world?.name).toBe('Tapped');
      expect(state.seed).toBe(77);
      expect(await page.evaluate(() => document.pointerLockElement)).toBeNull();

      // Leave by the menu button and "Save and back to worlds".
      await page.locator('.touch-menu').tap();
      await page.waitForFunction(() => window.__mc.getState().paused);
      // "Your player" and "Playing together" (Phase 6) are reached by scrolling: Phase 6
      // AC7.13, AC13.5.
      check(
        await boxes(
          page,
          '.pause-screen button:not(.room-panel button):not(.player-section button)',
        ),
        view,
      );
      await backToWorlds(page, true);

      // Five more worlds, so the list has to scroll on the phone.
      for (let i = 1; i <= 5; i++) {
        await createWorld(page, { name: `World ${i}`, tap: true });
        await page.locator('.touch-menu').tap();
        await page.waitForFunction(() => window.__mc.getState().paused);
        await backToWorlds(page, true);
      }
      await expect(rows(page)).toHaveCount(6);
      await expect(page.locator('.world-play-button')).toHaveText('Tap to play');
      // Everything outside the list is on screen; the panel is not cut off.
      check(await boxes(page, '.world-view button:not(.world-row)'), view);
      const [panel] = await boxes(page, '.world-list-view');
      expect(panel.y).toBeGreaterThanOrEqual(0);
      expect(panel.y + panel.height).toBeLessThanOrEqual(view.height);
      // Rows are finger-sized; the ones below the fold are reached by scrolling the list.
      const [list] = await boxes(page, '.world-list');
      const last = rows(page).last();
      await last.scrollIntoViewIfNeeded();
      const rowBoxes = await boxes(page, '.world-row');
      for (const row of rowBoxes) expect(row.height).toBeGreaterThanOrEqual(48);
      const lastBox = rowBoxes[rowBoxes.length - 1];
      expect(lastBox.y).toBeGreaterThanOrEqual(list.y);
      expect(lastBox.y + lastBox.height).toBeLessThanOrEqual(list.y + list.height + 1);
      expect(lastBox.y + lastBox.height).toBeLessThanOrEqual(view.height);

      // Select the oldest world by tap, delete it by taps.
      await last.tap();
      await expect(last).toHaveClass(/selected/);
      await expect(last.locator('.world-row-name')).toHaveText('Tapped');
      await page.locator('.world-delete-button').tap();
      check(await boxes(page, '.world-confirm button'), view);
      await page.locator('.world-confirm-delete').tap();
      await expect(rows(page)).toHaveCount(5);
      expect(await listedNames(page)).not.toContain('Tapped');

      // Continue the newest one by tap.
      await page.locator('.world-play-button').tap();
      await page.waitForFunction(() => !window.__mc.getState().paused);
      expect((await getState(page)).world?.name).toBe('World 5');
      await expect(page.locator('.touch-hud')).toBeVisible();
    });
  }
});

// --- World options (Phase 7 part A) ---

function terrainChoice(page: Page, value: string) {
  return page.locator(`.world-mode-button[data-terrain="${value}"]`);
}

function treesChoice(page: Page, value: string) {
  return page.locator(`.world-mode-button[data-trees="${value}"]`);
}

test('Phase 7 AC6.1, AC6.2: the Terrain and Trees rows; None only in Creative', async ({
  page,
}) => {
  await openMenu(page);
  await expect(page.locator('[role="radiogroup"][aria-label="Terrain"]')).toBeVisible();
  await expect(page.locator('[role="radiogroup"][aria-label="Trees"]')).toBeVisible();
  await expect(page.locator('.world-terrain-field .world-mode-button')).toHaveText([
    'Flat',
    'Balanced',
    'Hilly',
  ]);
  await expect(page.locator('.world-trees-field .world-mode-button')).toHaveText([
    'None',
    'Few',
    'Normal',
    'Many',
  ]);
  // The defaults: Balanced and Few. The form starts in Gathering, so None is disabled.
  await expect(terrainChoice(page, 'balanced')).toHaveAttribute('aria-checked', 'true');
  await expect(treesChoice(page, 'few')).toHaveAttribute('aria-checked', 'true');
  await expect(treesChoice(page, 'none')).toBeDisabled();
  await expect(page.locator('.world-trees-hint')).toHaveText(NO_TREES_HINT);

  // The mouse selects; the selection shows on exactly one button per row.
  await terrainChoice(page, 'hilly').click();
  await treesChoice(page, 'many').click();
  await expect(terrainChoice(page, 'hilly')).toHaveAttribute('aria-checked', 'true');
  await expect(terrainChoice(page, 'balanced')).toHaveAttribute('aria-checked', 'false');
  await expect(treesChoice(page, 'many')).toHaveClass(/selected/);
  await expect(page.locator('.world-trees-field .selected')).toHaveCount(1);

  // Creative allows None; switching back to Gathering turns it into Few, with the hint.
  await page.locator('.world-mode-button[data-mode="creative"]').click();
  await expect(treesChoice(page, 'none')).toBeEnabled();
  await expect(page.locator('.world-trees-hint')).toBeHidden();
  await treesChoice(page, 'none').click();
  await expect(treesChoice(page, 'none')).toHaveAttribute('aria-checked', 'true');
  await page.locator('.world-mode-button[data-mode="gathering"]').click();
  await expect(treesChoice(page, 'few')).toHaveAttribute('aria-checked', 'true');
  await expect(treesChoice(page, 'none')).toHaveAttribute('aria-checked', 'false');
  await expect(treesChoice(page, 'none')).toBeDisabled();
  await expect(page.locator('.world-trees-hint')).toBeVisible();
  await expect(page.locator('.world-trees-hint')).toHaveText(NO_TREES_HINT);
});

test('Phase 7 AC5.1: a flat world with many trees reloads with its options, terrain and spawn', async ({
  page,
}) => {
  await openMenu(page);
  await createWorld(page, { name: 'Flatland', seed: '1337', terrain: 'flat', trees: 'many' });
  const created = await getState(page);
  const options = { terrain: 'flat', trees: 'many' } as const;
  expect(created.world).toMatchObject({ name: 'Flatland', generatorVersion: 2, options });
  const checksum = TERRAIN_CHECKSUMS_1337_V2['flat/many'];
  expect(await page.evaluate(() => window.__mc.terrainChecksum())).toBe(checksum);
  // The world starts at the spawn of its own generator (the wood rule of generator 2).
  const spawn = findSpawn(getTerrain(1337, { version: 2, options }));
  expect(created.player.x).toBe(spawn.x + 0.5);
  expect(created.player.z).toBe(spawn.z + 0.5);

  await pauseWithMouse(page);
  await expect(page.locator('.save-state')).toHaveText('Saved');
  await page.reload();
  await page.waitForFunction(() => window.__mc !== undefined);
  await expect(rows(page)).toHaveCount(1);
  await expect(page.locator('.world-row-mode')).toHaveText('Creative · Flat · Many trees');
  await page.locator('.world-play-button').click();
  await untilPlaying(page);
  const again = await getState(page);
  expect(again.world).toEqual(created.world);
  expect(await page.evaluate(() => window.__mc.terrainChecksum())).toBe(checksum);
  expect(again.player.x).toBe(created.player.x);
  expect(again.player.z).toBe(created.player.z);
});

test('Phase 7 AC1.2: a world of an earlier build is listed as Classic', async ({ page }) => {
  await openMenu(page);
  // The menu has opened the store; a format 2 record of a generator 1 world goes into it.
  const record = {
    id: 'wclassic-fixture1',
    name: 'Old world',
    seed: 1337,
    mode: 'creative',
    generatorVersion: 1,
    formatVersion: 2,
    createdMs: 1_810_000_000_000,
    playedMs: 1_810_000_720_000,
    time: 0.45,
    pose: { x: 0.5, y: 70, z: 0.5, yaw: 0, pitch: 0 },
    moveMode: 'walk',
    player: {
      slots: [
        ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map((item) => ({ item, count: 1 })),
        ...Array.from({ length: 27 }, () => null),
      ],
      selectedSlot: 0,
      breaking: null,
    },
    guests: [],
  };
  await page.evaluate(
    (meta) =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('markuscraft');
        open.onerror = () => reject(new Error('open failed'));
        open.onsuccess = () => {
          const tx = open.result.transaction('worlds', 'readwrite');
          tx.objectStore('worlds').put(meta);
          tx.oncomplete = () => {
            open.result.close();
            resolve();
          };
          tx.onerror = () => reject(new Error('write failed'));
        };
      }),
    record,
  );
  await page.reload();
  await page.waitForFunction(() => window.__mc !== undefined);
  await expect(rows(page)).toHaveCount(1);
  await expect(page.locator('.world-row-mode')).toHaveText('Creative · Classic');
  await page.locator('.world-play-button').click();
  await untilPlaying(page);
  const state = await getState(page);
  expect(state.world).toMatchObject({ id: record.id, generatorVersion: 1, options: null });
  expect(await page.evaluate(() => window.__mc.terrainChecksum())).toBe(TERRAIN_CHECKSUM_1337_V1);
});
