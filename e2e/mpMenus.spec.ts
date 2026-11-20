// Phase 6 part B, step 7: joining from the world menu, the room panel of the pause menu,
// notices, leaving and losing the host, the wake lock, controller and touch.
import type { Locator, Page } from '@playwright/test';
import { createWorld, openMenu } from './game';
import { BUTTON, Pad, focusOn, installFakePads } from './gamepad';
import {
  type Player,
  type Players,
  expect,
  hostRoom,
  joinError,
  joinRoom,
  netOf,
  netQuery,
  openTestPlayer,
  test,
  untilNet,
} from './multiplayer';

test.setTimeout(180_000);

function state(page: Page) {
  return page.evaluate(() => window.__mc.getState());
}

/** A player on the world menu (no test mode), with this name stored. */
async function menuPlayer(
  players: Players,
  name: string,
  options: Parameters<Players['open']>[0] = {},
  extra: Record<string, string> = {},
): Promise<Player> {
  const player = await players.open(options);
  await openMenu(player.page, netQuery({ name, ...extra }));
  return player;
}

/** A player that created a Creative world and paused it (mouse released). */
async function pausedHost(players: Players, name: string, options = {}): Promise<Player> {
  const host = await menuPlayer(players, name, options, { seed: '1337' });
  await createWorld(host.page);
  await pause(host.page);
  return host;
}

async function pause(page: Page): Promise<void> {
  await page.evaluate(() => document.exitPointerLock());
  await page.waitForFunction(() => window.__mc.getState().paused);
  await page.locator('.pause-screen:not(.hidden)').waitFor();
}

/** The texts of the player list in the pause menu. */
function playerList(page: Page): Promise<string[]> {
  return page.locator('.room-panel .room-player').allTextContents();
}

async function untilList(page: Page, expected: string[], timeout = 2000): Promise<void> {
  await expect.poll(() => playerList(page), { timeout }).toEqual(expected);
}

test('Phase 6 AC7.1: the world menu has "Join a world"; the name survives a reload', async ({
  players,
}) => {
  const p = await menuPlayer(players, '');
  const section = p.page.locator('.join-section');
  await expect(section.locator('h2')).toHaveText('Join a world');
  await expect(section.locator('#player-name')).toBeVisible();
  await expect(section.locator('.room-list')).toBeVisible();
  await expect(section.locator('#room-code')).toBeVisible();
  await expect(section.locator('.room-list')).toContainText('No open worlds right now.');
  await section.locator('#player-name').fill('Mira');
  await p.page.reload();
  await p.page.locator('.world-menu[data-ready]').waitFor();
  await expect(p.page.locator('#player-name')).toHaveValue('Mira');
});

test('Phase 6 AC7.2: the room list shows a room within 6 s; "Join" joins; other builds are not listed', async ({
  players,
}) => {
  const host = await openTestPlayer(players, { query: { name: 'Ada' } });
  const other = await openTestPlayer(players, { query: { name: 'Zed' } });
  const code = await hostRoom(host.page);
  const otherCode = await hostRoom(other.page, { build: 'zzz9999' });
  const guest = await menuPlayer(players, 'Bo');
  const row = guest.page.locator(`.room-row[data-code="${code}"]`);
  await expect(row).toBeVisible({ timeout: 6000 });
  await expect(row).toContainText('Test');
  await expect(row).toContainText('Ada');
  await expect(row).toContainText('Creative');
  await expect(row).toContainText('1/4');
  await expect(guest.page.locator(`.room-row[data-code="${otherCode}"]`)).toHaveCount(0);
  // AC7.2, second half: the other build's code typed by hand gives the version message.
  await guest.page.locator('#room-code').fill(otherCode);
  await guest.page.locator('.join-code-button').click();
  await expect(guest.page.locator('.join-status')).toHaveText(
    'Different game version. Reload the page on both devices.',
    { timeout: 15_000 },
  );
  await row.locator('.room-join-button').click();
  await untilNet(guest.page, (n) => n.role === 'guest' && n.status === 'online', 20_000);
  await untilNet(host.page, (n) => n.players.length === 2);
});

test('Phase 6 AC7.3: "Copy join link" and a typed code in lower case', async ({ players }) => {
  const host = await pausedHost(players, 'Ada', {
    permissions: ['clipboard-read', 'clipboard-write'],
  });
  await host.page.locator('.room-open-button').click();
  const codeText = host.page.locator('.room-code');
  await expect(codeText).toHaveText(/^[A-Z2-9]{6}$/, { timeout: 15_000 });
  const code = (await codeText.textContent()) ?? '';
  await host.page.locator('.room-copy-button').click();
  await expect(host.page.locator('.room-message')).toHaveText('Link copied');
  const link = await host.page.evaluate(() => navigator.clipboard.readText());
  expect(new URL(link).searchParams.get('join')).toBe(code);
  const guest = await players.open();
  const url = new URL(link);
  await openMenu(guest.page, url.search);
  const linkButton = guest.page.locator('.join-link-button');
  await expect(linkButton).toHaveText(`Join world ${code}`);
  await linkButton.click();
  await untilNet(guest.page, (n) => n.role === 'guest' && n.status === 'online', 20_000);
  // Typed in lower case with a space.
  const typed = await menuPlayer(players, 'Cy');
  await typed.page
    .locator('#room-code')
    .fill(`${code.slice(0, 3).toLowerCase()} ${code.slice(3).toLowerCase()}`);
  await typed.page.locator('.join-code-button').click();
  await untilNet(typed.page, (n) => n.role === 'guest' && n.status === 'online', 20_000);
  await untilNet(host.page, (n) => n.players.length === 3);
});

test('Phase 6 AC7.4, AC7.6: the player list follows joins and leaves; "Leave world"', async ({
  players,
}) => {
  const host = await pausedHost(players, 'Ada');
  const code = await hostRoom(host.page);
  await untilList(host.page, ['Ada (host) (you)']);
  const bo = await menuPlayer(players, 'Bo');
  await joinRoom(bo.page, code);
  await bo.page.locator('.pause-screen:not(.hidden)').waitFor();
  await untilList(host.page, ['Ada (host) (you)', 'Bo']);
  await untilList(bo.page, ['Ada (host)', 'Bo (you)']);
  await expect(bo.page.locator('.back-button')).toHaveText('Leave world');
  const cy = await openTestPlayer(players, { query: { name: 'Cy' } });
  await joinRoom(cy.page, code);
  await untilList(host.page, ['Ada (host) (you)', 'Bo', 'Cy']);
  await untilList(bo.page, ['Ada (host)', 'Bo (you)', 'Cy']);
  // Cy sees the others' figures.
  await untilNet(cy.page, (n) => n.figures === 2);
  // AC7.6: Bo leaves with "Leave world".
  await bo.page.locator('.back-button').click();
  await untilList(host.page, ['Ada (host) (you)', 'Cy']);
  await untilNet(cy.page, (n) => n.players.length === 2 && n.figures === 1, 2000);
  await bo.page.locator('.world-menu:not(.hidden)').waitFor();
  expect((await netOf(bo.page)).role).toBe('off');
  expect((await state(bo.page)).ui.screen).toBe('worlds');
});

test('Phase 6 AC7.5: notices come and go; a fifth pushes out the oldest', async ({ players }) => {
  const host = await openTestPlayer(players, { query: { name: 'Ada' } });
  const code = await hostRoom(host.page);
  const guests: Player[] = [];
  for (const name of ['Bo', 'Cy', 'Di']) {
    const g = await openTestPlayer(players, { query: { name } });
    await joinRoom(g.page, code);
    guests.push(g);
  }
  // Every notice is gone 5 s after it came.
  await untilNet(host.page, (n) => n.notices.length === 0, 8000);
  await expect(host.page.locator('.net-notice')).toHaveCount(0);
  // Five notices at once: three leave, two come back.
  await Promise.all(guests.map((g) => g.page.evaluate(() => window.__mc.net.leave())));
  await untilNet(host.page, (n) => n.players.length === 1);
  await Promise.all(
    guests.slice(0, 2).map((g) => g.page.evaluate((c) => window.__mc.net.join(c), code)),
  );
  await untilNet(host.page, (n) => n.players.length === 3);
  const notices = (await netOf(host.page)).notices;
  expect(notices).toHaveLength(4);
  expect(notices.filter((t) => t.endsWith(' left'))).toHaveLength(2);
  expect(notices.slice(2).sort()).toEqual(['Bo joined', 'Cy joined']);
  await expect(host.page.locator('.net-notice')).toHaveCount(4);
  await expect(host.page.locator('.net-notice').last()).toHaveText(/^(Bo|Cy) joined$/);
});

test('Phase 6 AC7.7: "Close to others" sends every guest back with the notice', async ({
  players,
}) => {
  const host = await pausedHost(players, 'Ada');
  const code = await hostRoom(host.page);
  const guest = await menuPlayer(players, 'Bo');
  await joinRoom(guest.page, code);
  await host.page.locator('.room-close-button').click();
  const started = Date.now();
  await guest.page.locator('.world-menu:not(.hidden)').waitFor({ timeout: 2000 });
  expect(Date.now() - started).toBeLessThan(2000);
  await expect(guest.page.locator('.world-message')).toHaveText('The host closed the world.');
  const h = await state(host.page);
  expect(h.net.role).toBe('off');
  expect(h.world).not.toBeNull();
  expect(h.paused).toBe(true);
  await expect(host.page.locator('.room-open-button')).toBeVisible();
  // The pause menu pauses again.
  const t = h.time;
  await host.page.waitForTimeout(1200);
  expect((await state(host.page)).time).toBe(t);
});

test('Phase 6 AC7.8: an abruptly closed host: reconnecting, then the lost notice', async ({
  players,
}) => {
  const host = await openTestPlayer(players);
  const code = await hostRoom(host.page);
  const guest = await menuPlayer(players, 'Bo');
  await joinRoom(guest.page, code);
  // A crash: no goodbye, no page-hide handler.
  const cdp = await host.context.newCDPSession(host.page);
  void cdp.send('Page.crash').catch(() => {});
  const started = Date.now();
  await untilNet(guest.page, (n) => n.status === 'reconnecting', 10_000);
  await guest.page.locator('.world-menu:not(.hidden)').waitFor({ timeout: 17_000 });
  expect(Date.now() - started).toBeLessThan(17_000);
  await expect(guest.page.locator('.world-message')).toHaveText('Lost the connection to the host.');
  expect((await netOf(guest.page)).role).toBe('off');
});

test('Phase 6 AC7.9: a guest whose connection dropped is back with the edits and its bar', async ({
  players,
}) => {
  const host = await openTestPlayer(players);
  const guest = await openTestPlayer(players);
  const code = await hostRoom(host.page);
  await joinRoom(guest.page, code);
  await guest.page.evaluate(() => window.__mc.submit({ kind: 'setBarSlot', slot: 0, item: 19 }));
  await untilNet(guest.page, (n) => n.lastResult !== null);
  await guest.page.evaluate(() => window.__mc.net.dropConnection());
  await untilNet(guest.page, (n) => n.status === 'reconnecting');
  const { player } = await state(host.page);
  const cell = {
    x: Math.floor(player.x) + 2,
    y: Math.floor(player.y) + 2,
    z: Math.floor(player.z),
  };
  await host.page.evaluate((c) => window.__mc.submit({ kind: 'place', ...c, slot: 3 }), cell);
  await untilNet(guest.page, (n) => n.status === 'online', 10_000);
  await expect
    .poll(() => guest.page.evaluate((c) => window.__mc.getBlock(c.x, c.y, c.z), cell))
    .not.toBe(0);
  expect((await state(guest.page)).inventory.slots[0]?.item).toBe(19);
  expect((await netOf(guest.page)).worldHash).toBe((await netOf(host.page)).worldHash);
});

test.describe('five players', () => {
  test('Phase 6 AC7.10: a fifth player sees "Room is full"; Gathering cannot be opened yet', async ({
    players,
  }) => {
    const host = await openTestPlayer(players);
    const code = await hostRoom(host.page);
    for (let i = 0; i < 3; i++) {
      const g = await openTestPlayer(players);
      await joinRoom(g.page, code);
    }
    await untilNet(host.page, (n) => n.players.length === 4);
    const fifth = await menuPlayer(players, 'Eve');
    expect(await joinError(fifth.page, code)).toBe('Room is full');
    await fifth.page.locator('#room-code').fill(code);
    await fifth.page.locator('.join-code-button').click();
    await expect(fifth.page.locator('.join-status')).toHaveText('Room is full', {
      timeout: 15_000,
    });
    // A Gathering world: the button is disabled with its reason.
    await createWorld(fifth.page, { mode: 'gathering' });
    await pause(fifth.page);
    await expect(fifth.page.locator('.room-open-button')).toBeDisabled();
    await expect(fifth.page.locator('.room-panel .room-note')).toHaveText(
      'Gathering worlds can be shared from a later version.',
    );
  });
});

/**
 * A reference of a menu section as a region of a fixed size from its top left corner: CI's
 * font makes text a few pixels taller or shorter, which an element screenshot cannot take.
 */
async function sectionShot(page: Page, section: Locator, name: string): Promise<void> {
  await section.scrollIntoViewIfNeeded();
  const box = await section.boundingBox();
  if (!box) throw new Error(`${name}: no box`);
  const size =
    name === 'join-section.png' ? { width: 472, height: 270 } : { width: 340, height: 140 };
  await expect(page).toHaveScreenshot(name, {
    clip: { x: Math.round(box.x), y: Math.round(box.y), ...size },
    maxDiffPixelRatio: 0.08,
  });
}

/** A stub of the screen wake lock that records requests and releases on `window.__wake`. */
async function stubWakeLock(page: Page, reject = false): Promise<void> {
  await page.addInitScript((rejecting) => {
    const log: string[] = [];
    (window as unknown as { __wake: string[] }).__wake = log;
    Object.defineProperty(navigator, 'wakeLock', {
      configurable: true,
      value: {
        request: () => {
          log.push('request');
          if (rejecting) return Promise.reject(new Error('not allowed'));
          return Promise.resolve({
            release: () => {
              log.push('release');
              return Promise.resolve();
            },
            addEventListener: () => {},
          });
        },
      },
    });
  }, reject);
}

function wakeLog(page: Page): Promise<string[]> {
  return page.evaluate(() => (window as unknown as { __wake: string[] }).__wake);
}

test('Phase 6 AC7.11: the wake lock while networked; the hosting hint in touch mode only', async ({
  players,
}) => {
  const host = await players.open();
  await stubWakeLock(host.page);
  await host.page.goto(`/${netQuery({ test: '1', seed: '1337', freeze: '1' })}`);
  await host.page.waitForFunction(() => window.__mc?.isReady());
  const guest = await players.open();
  await stubWakeLock(guest.page, true);
  await guest.page.goto(`/${netQuery({ test: '1', seed: '1337', freeze: '1' })}`);
  await guest.page.waitForFunction(() => window.__mc?.isReady());
  expect(await wakeLog(host.page)).toEqual([]);
  const code = await hostRoom(host.page);
  await expect.poll(() => wakeLog(host.page)).toEqual(['request']);
  await joinRoom(guest.page, code);
  // A refused lock changes nothing and logs nothing.
  await expect.poll(() => wakeLog(guest.page)).toEqual(['request']);
  await host.page.evaluate(() => window.__mc.net.leave());
  await expect.poll(() => wakeLog(host.page)).toEqual(['request', 'release']);
  // The hint: touch host only.
  const mouseHost = await pausedHost(players, 'Ada');
  await mouseHost.page.locator('.room-open-button').click();
  await expect(mouseHost.page.locator('.room-code')).toBeVisible({ timeout: 15_000 });
  await expect(mouseHost.page.locator('.room-touch-hint')).toHaveCount(0);
  const touchHost = await menuPlayer(
    players,
    'Tia',
    { touch: true, viewport: { width: 960, height: 540 } },
    { touch: '1', seed: '1337' },
  );
  await createWorld(touchHost.page, { tap: true });
  await touchHost.page.locator('.touch-menu').tap();
  await touchHost.page.locator('.room-open-button').tap();
  await expect(touchHost.page.locator('.room-touch-hint')).toBeVisible({ timeout: 15_000 });
});

test('Phase 6 AC7.12: a controller joins a listed room and leaves it', async ({ players }) => {
  const host = await openTestPlayer(players, { query: { name: 'Ada' } });
  const code = await hostRoom(host.page);
  const guest = await players.open();
  await installFakePads(guest.page);
  await openMenu(guest.page, netQuery({ name: 'Pat' }));
  const pad = new Pad(guest.page);
  await pad.connect();
  await pad.tap(BUTTON.DOWN);
  await guest.page.waitForFunction(() => window.__mc.getState().ui.focus !== undefined);
  const join = `.room-row[data-code="${code}"] .room-join-button`;
  await guest.page.locator(join).waitFor({ timeout: 6000 });
  await focusOn(guest.page, pad, join);
  await pad.tap(BUTTON.A);
  await untilNet(guest.page, (n) => n.role === 'guest' && n.status === 'online', 20_000);
  await guest.page.waitForFunction(() => !window.__mc.getState().paused);
  await pad.tap(BUTTON.START);
  await guest.page.waitForFunction(() => window.__mc.getState().ui.screen === 'pause');
  await focusOn(guest.page, pad, '.back-button');
  expect((await state(guest.page)).ui.focus).toBe('Leave world');
  await pad.tap(BUTTON.A);
  await guest.page.locator('.world-menu:not(.hidden)').waitFor();
  expect((await netOf(guest.page)).role).toBe('off');
  await untilNet(host.page, (n) => n.players.length === 1);
});

/** Every visible button of `scope`, scrolled into view, lies in the 640 × 360 view and is 48 × 48. */
async function fingerSized(scope: Locator): Promise<void> {
  const buttons = scope.locator('button:visible');
  expect(await buttons.count()).toBeGreaterThan(0);
  for (const control of await buttons.all()) {
    await control.scrollIntoViewIfNeeded();
    const box = await control.boundingBox();
    const name = (await control.textContent()) ?? '';
    if (!box) throw new Error(`no box: ${name}`);
    expect(box.width, name).toBeGreaterThanOrEqual(48);
    expect(box.height, name).toBeGreaterThanOrEqual(48);
    expect(box.x, name).toBeGreaterThanOrEqual(0);
    expect(box.y, name).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width, name).toBeLessThanOrEqual(640);
    expect(box.y + box.height, name).toBeLessThanOrEqual(360);
  }
}

test('Phase 6 AC7.13: join section and room panel are reachable and finger-sized at 640 × 360', async ({
  players,
}) => {
  const other = await openTestPlayer(players, { query: { name: 'Ada' } });
  const code = await hostRoom(other.page);
  const small = { touch: true, viewport: { width: 640, height: 360 } };
  const guest = await menuPlayer(players, 'Bo', small, { touch: '1' });
  await guest.page.locator(`.room-row[data-code="${code}"]`).waitFor({ timeout: 6000 });
  await fingerSized(guest.page.locator('.join-section'));
  const host = await menuPlayer(players, 'Cy', small, { touch: '1', seed: '1337' });
  await createWorld(host.page, { tap: true });
  await host.page.locator('.touch-menu').tap();
  await host.page.locator('.room-open-button').scrollIntoViewIfNeeded();
  await host.page.locator('.room-open-button').tap();
  await expect(host.page.locator('.room-code')).toBeVisible({ timeout: 15_000 });
  await fingerSized(host.page.locator('.room-panel'));
});

test('Phase 6 AC7.14: reference screenshots of the join section and the room panel', async ({
  players,
}) => {
  const a = await openTestPlayer(players, { query: { name: 'Ada', world: 'Castle' } });
  const b = await openTestPlayer(players, { query: { name: 'Bo', world: 'Harbour' } });
  await hostRoom(a.page, { code: 'ADA234' });
  await hostRoom(b.page, { code: 'BEN567' });
  const guest = await menuPlayer(players, 'Mira');
  await expect(guest.page.locator('.room-row')).toHaveCount(2, { timeout: 6000 });
  await sectionShot(guest.page, guest.page.locator('.join-section'), 'join-section.png');
  // The room panel: a host with a fixed code and one guest.
  for (const page of [a.page, b.page]) await page.close();
  const host = await pausedHost(players, 'Ada');
  await hostRoom(host.page, { code: 'HAPPY2' });
  const bo = await openTestPlayer(players, { query: { name: 'Bo' } });
  await joinRoom(bo.page, 'HAPPY2');
  await untilList(host.page, ['Ada (host) (you)', 'Bo'], 10_000);
  await sectionShot(host.page, host.page.locator('.room-panel'), 'room-panel.png');
});
