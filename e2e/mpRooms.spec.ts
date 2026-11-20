// Phase 6 part B, step 5: the game as host and guest (rooms opened and joined through the
// test API; the menus are tested in `roomMenus.spec.ts`).
import type { Page } from '@playwright/test';
import { DEG, PLATFORM_Y, clickCenter, createWorld, openMenu } from './game';
import { capture, centerRegion, diffShare, meanLuminance } from './helpers';
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
import { TOUCH_DEVICE, centerOf } from './touch';

test.setTimeout(180_000);

const AIR = 0;
const STONE = 3;

function state(page: Page) {
  return page.evaluate(() => window.__mc.getState());
}

async function setPose(
  page: Page,
  pose: { x?: number; y?: number; z?: number; yaw?: number; pitch?: number; mode?: 'walk' | 'fly' },
): Promise<void> {
  await page.evaluate(async (p) => {
    window.__mc.setPlayer(p);
    await window.__mc.whenIdle();
  }, pose);
}

/** A host in test mode with an open room and one guest that joined it. */
async function hostAndGuest(
  players: Players,
  guestOptions: Parameters<typeof openTestPlayer>[1] = {},
): Promise<{ host: Player; guest: Player; code: string }> {
  const host = await openTestPlayer(players);
  const guest = await openTestPlayer(players, guestOptions);
  const code = await hostRoom(host.page);
  await joinRoom(guest.page, code);
  return { host, guest, code };
}

/**
 * A stone platform high above the terrain (set by the host, so every guest gets it), with
 * both players standing on it in the same place looking down at the block in front.
 */
async function platform(host: Page, guests: Page[]): Promise<{ px: number; pz: number }> {
  const { player } = await state(host);
  const px = Math.floor(player.x);
  const pz = Math.floor(player.z);
  await host.evaluate(
    ([x0, y, z0]) => {
      for (let z = z0 - 6; z <= z0 + 1; z++) {
        for (let x = x0 - 2; x <= x0 + 2; x++) window.__mc.setBlock(x, y, z, 3);
      }
    },
    [px, PLATFORM_Y, pz],
  );
  const pose = { x: px + 0.5, y: PLATFORM_Y + 1, z: pz + 0.5, yaw: 0, pitch: -50 * DEG };
  for (const page of [host, ...guests]) await setPose(page, pose);
  // The guests' copies of the platform arrive with the host's `blocks`.
  for (const page of guests) {
    await expect
      .poll(() =>
        page.evaluate(([x, y, z]) => window.__mc.getBlock(x, y, z), [px, PLATFORM_Y, pz - 1]),
      )
      .toBe(STONE);
    await page.evaluate(() => window.__mc.whenIdle());
  }
  return { px, pz };
}

test('Phase 6 AC5.1: a host opens a room, a guest joins it by code', async ({ players }) => {
  const host = await openTestPlayer(players);
  const guest = await openTestPlayer(players, { query: { seed: '42' } });
  const code = await hostRoom(host.page);
  expect(code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
  const net = await netOf(host.page);
  expect(net).toMatchObject({ role: 'host', status: 'online', roomCode: code });
  const started = Date.now();
  await guest.page.evaluate((c) => window.__mc.net.join(c), code);
  await untilNet(host.page, (n) => n.players.length === 2);
  await untilNet(guest.page, (n) => n.players.length === 2);
  expect(Date.now() - started).toBeLessThan(15_000);
  await untilNet(host.page, (n) => n.players.length === 2);
  await untilNet(guest.page, (n) => n.players.length === 2 && n.role === 'guest');
  const [h, g] = [await state(host.page), await state(guest.page)];
  expect(g.seed).toBe(h.seed);
  expect(g.mode).toBe(h.mode);
  expect(g.net.players.map((p) => p.host)).toEqual([true, false]);
  expect(g.net.players.find((p) => p.self)?.id).toBe(g.net.selfId);
});

test('Phase 6 AC5.2: edits made before the join exist on the guest, also 320 blocks away', async ({
  players,
}) => {
  const host = await openTestPlayer(players);
  const guest = await openTestPlayer(players);
  const { player } = await state(host.page);
  const x = Math.floor(player.x);
  const z = Math.floor(player.z);
  await host.page.evaluate(
    ([bx, bz]) => {
      window.__mc.setBlock(bx + 2, 100, bz, 17);
      window.__mc.setBlock(bx + 320, 100, bz, 8);
    },
    [x, z],
  );
  const code = await hostRoom(host.page);
  await joinRoom(guest.page, code);
  expect(
    await guest.page.evaluate(([bx, bz]) => window.__mc.getBlock(bx + 2, 100, bz), [x, z]),
  ).toBe(17);
  await setPose(guest.page, { x: x + 320.5, y: 102, z: z + 0.5, mode: 'fly' });
  expect(
    await guest.page.evaluate(([bx, bz]) => window.__mc.getBlock(bx + 320, 100, bz), [x, z]),
  ).toBe(8);
  const [h, g] = [await netOf(host.page), await netOf(guest.page)];
  expect(g.worldHash).toBe(h.worldHash);
});

test('Phase 6 AC5.3: real clicks break and place on both players', async ({ players }) => {
  const { host, guest } = await hostAndGuest(players);
  const { px, pz } = await platform(host.page, [guest.page]);
  const before = await capture(guest.page);
  // The host breaks the block in front with a real left click.
  await clickCenter(host.page, 'left');
  expect(
    await host.page.evaluate(
      ([x, y, z]) => window.__mc.getBlock(x, y, z),
      [px, PLATFORM_Y, pz - 1],
    ),
  ).toBe(AIR);
  await expect
    .poll(
      () =>
        guest.page.evaluate(([x, y, z]) => window.__mc.getBlock(x, y, z), [px, PLATFORM_Y, pz - 1]),
      {
        timeout: 2000,
      },
    )
    .toBe(AIR);
  await guest.page.evaluate(() => window.__mc.whenIdle());
  const after = await capture(guest.page);
  expect(diffShare(before, after, centerRegion(after, 0.1))).toBeGreaterThan(0.3);
  // The guest places a block with a real right click (its first bar slot: grass).
  const hostBefore = await capture(host.page);
  await clickCenter(guest.page, 'right');
  await expect
    .poll(
      () =>
        host.page.evaluate(([x, y, z]) => window.__mc.getBlock(x, y, z), [px, PLATFORM_Y, pz - 1]),
      {
        timeout: 2000,
      },
    )
    .not.toBe(AIR);
  await expect
    .poll(() =>
      guest.page.evaluate(([x, y, z]) => window.__mc.getBlock(x, y, z), [px, PLATFORM_Y, pz - 1]),
    )
    .not.toBe(AIR);
  await host.page.evaluate(() => window.__mc.whenIdle());
  const hostAfter = await capture(host.page);
  expect(diffShare(hostBefore, hostAfter, centerRegion(hostAfter, 0.1))).toBeGreaterThan(0.3);
  for (const page of [host.page, guest.page]) {
    expect(await page.evaluate(() => window.__mc.verifyLight())).toBe(0);
  }
});

test.describe('three players', () => {
  test.describe.configure({ mode: 'serial' });

  test('Phase 6 AC5.4: an edit by guest A reaches guest B', async ({ players }) => {
    const host = await openTestPlayer(players);
    const a = await openTestPlayer(players);
    const b = await openTestPlayer(players);
    const code = await hostRoom(host.page);
    await joinRoom(a.page, code);
    await joinRoom(b.page, code);
    await untilNet(b.page, (n) => n.players.length === 3);
    const { player } = await state(a.page);
    const cell = {
      x: Math.floor(player.x) + 1,
      y: Math.floor(player.y) + 1,
      z: Math.floor(player.z),
    };
    await a.page.evaluate((c) => window.__mc.submit({ kind: 'place', ...c, slot: 1 }), cell);
    await expect
      .poll(() => b.page.evaluate((c) => window.__mc.getBlock(c.x, c.y, c.z), cell), {
        timeout: 2000,
      })
      .not.toBe(AIR);
    const hashes = await Promise.all(
      [host, a, b].map(async (p) => (await netOf(p.page)).worldHash),
    );
    expect(new Set(hashes).size).toBe(1);
  });
});

test('Phase 6 AC5.5: the time of day follows the host', async ({ players }) => {
  const { host, guest } = await hostAndGuest(players);
  await setPose(guest.page, { pitch: 0.3 });
  const noon = meanLuminance(await capture(guest.page));
  await host.page.evaluate(() => window.__mc.setTime(0.75));
  await expect
    .poll(async () => Math.abs((await state(guest.page)).time - 0.75), { timeout: 2000 })
    .toBeLessThan(0.005);
  await guest.page.evaluate(() => window.__mc.whenIdle());
  const night = meanLuminance(await capture(guest.page));
  expect(night).toBeLessThanOrEqual(noon / 2);
});

test('Phase 6 AC5.6: unknown codes and an unreachable server fail with their message', async ({
  players,
}) => {
  const guest = await openTestPlayer(players);
  const started = Date.now();
  expect(await joinError(guest.page, 'ZZZZZZ')).toBe('Room not found');
  expect(Date.now() - started).toBeLessThan(15_000);
  // The menu keeps working: a world can be created and played afterwards.
  const lost = await players.open({
    // Chromium itself logs the refused WebSocket.
    allowConsole: [/WebSocket connection to 'ws:\/\/127\.0\.0\.1:9\/peerjs/],
  });
  const query = `?${new URLSearchParams({ signal: 'http://127.0.0.1:9/', stun: 'none' })}`;
  await openMenu(lost.page, query);
  expect(await joinError(lost.page, 'ABCDEF')).toBe(
    'Could not reach the connection service. Is this device on the home network?',
  );
  await expect(lost.page.locator('.world-message')).toContainText('Could not reach');
  await createWorld(lost.page);
  expect((await state(lost.page)).world).not.toBeNull();
});

test('Phase 6 AC5.7: an out-of-reach break sent raw changes nothing and yields reach', async ({
  players,
}) => {
  const { host, guest } = await hostAndGuest(players);
  const before = (await netOf(host.page)).worldHash;
  const { player } = await state(guest.page);
  const far = { x: Math.floor(player.x) + 40, y: 40, z: Math.floor(player.z) };
  await guest.page.evaluate(
    (f) => window.__mc.net.sendRaw({ t: 'action', seq: 9999, action: { kind: 'break', ...f } }),
    far,
  );
  await untilNet(guest.page, (n) => n.lastResult?.seq === 9999);
  expect((await netOf(guest.page)).lastResult).toEqual({ seq: 9999, ok: false, reason: 'reach' });
  expect((await netOf(host.page)).worldHash).toBe(before);
  expect((await netOf(guest.page)).worldHash).toBe(before);
});

test("Phase 6 AC5.8: a guest's world is never saved; the host saves the guest's edits", async ({
  players,
}) => {
  const host = await players.open();
  await openMenu(host.page, netQuery({ seed: '1337' }));
  await createWorld(host.page, { name: 'Shared', idle: true });
  const code = await hostRoom(host.page);
  const guest = await players.open();
  await openMenu(guest.page, netQuery());
  await joinRoom(guest.page, code);
  const { player } = await state(guest.page);
  const cell = {
    x: Math.floor(player.x),
    y: Math.floor(player.y) + 3,
    z: Math.floor(player.z) + 1,
  };
  await guest.page.evaluate((c) => window.__mc.submit({ kind: 'place', ...c, slot: 2 }), cell);
  await expect
    .poll(() => host.page.evaluate((c) => window.__mc.getBlock(c.x, c.y, c.z), cell))
    .not.toBe(AIR);
  const placed = await host.page.evaluate((c) => window.__mc.getBlock(c.x, c.y, c.z), cell);
  // The guest leaves: its world list stays empty, also in IndexedDB.
  await guest.page.evaluate(() => window.__mc.net.leave());
  await guest.page.locator('.world-menu:not(.hidden)').waitFor();
  await expect(guest.page.locator('.world-row')).toHaveCount(0);
  const stored = await guest.page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        const open = indexedDB.open('markuscraft');
        open.onsuccess = () => {
          const db = open.result;
          if (!db.objectStoreNames.contains('worlds')) return resolve(0);
          const count = db.transaction('worlds').objectStore('worlds').count();
          count.onsuccess = () => resolve(count.result);
        };
        open.onerror = () => resolve(0);
      }),
  );
  expect(stored).toBe(0);
  // The host's autosave has the guest's block: after a reload it is still there.
  await host.page.evaluate(() => window.__mc.save());
  // Without the seed in the URL, which would open the "New world" form.
  await host.page.goto(`/${netQuery()}`);
  await host.page.locator('.world-menu[data-ready]').waitFor();
  await host.page.locator('.world-play-button').click();
  await host.page.waitForFunction(() => window.__mc.getState().world !== null);
  await host.page.evaluate(() => window.__mc.whenIdle());
  expect(await host.page.evaluate((c) => window.__mc.getBlock(c.x, c.y, c.z), cell)).toBe(placed);
});

test('Phase 6 AC5.9: joining replaces the world without a leak', async ({ players }) => {
  const { host, guest } = await hostAndGuest(players);
  const { player } = await state(host.page);
  for (const page of [host.page, guest.page]) {
    await setPose(page, { x: player.x, y: player.y, z: player.z, yaw: 0, pitch: 0 });
  }
  const [h, g] = [await state(host.page), await state(guest.page)];
  expect(g.chunks.loaded).toBe(h.chunks.loaded);
  expect(g.chunks.meshed).toBe(h.chunks.meshed);
  expect(g.render.geometries).toBeLessThanOrEqual(Math.ceil(h.render.geometries * 1.1));
});

test('Phase 6 AC5.10: a touch guest breaks a block with its button', async ({ players }) => {
  const host = await openTestPlayer(players);
  const guest = await openTestPlayer(players, {
    ...TOUCH_DEVICE,
    touch: true,
    query: { touch: '1' },
  });
  const code = await hostRoom(host.page);
  await joinRoom(guest.page, code);
  const { px, pz } = await platform(host.page, [guest.page]);
  const button = await centerOf(guest.page, '.touch-break');
  await guest.page.touchscreen.tap(button.x, button.y);
  await expect
    .poll(
      () =>
        host.page.evaluate(([x, y, z]) => window.__mc.getBlock(x, y, z), [px, PLATFORM_Y, pz - 1]),
      {
        timeout: 2000,
      },
    )
    .toBe(AIR);
  await expect
    .poll(() =>
      guest.page.evaluate(([x, y, z]) => window.__mc.getBlock(x, y, z), [px, PLATFORM_Y, pz - 1]),
    )
    .toBe(AIR);
});

test("Phase 6 AC5.11: the host's pause menu does not pause a shared world", async ({ players }) => {
  const host = await players.open();
  await openMenu(host.page, netQuery({ seed: '1337', time: '0.3' }));
  await createWorld(host.page);
  const code = await hostRoom(host.page);
  const guest = await openTestPlayer(players);
  await joinRoom(guest.page, code);
  await host.page.evaluate(() => document.exitPointerLock());
  await host.page.waitForFunction(() => window.__mc.getState().paused);
  const t0 = (await state(host.page)).time;
  const { player } = await state(guest.page);
  const cell = {
    x: Math.floor(player.x),
    y: Math.floor(player.y) + 2,
    z: Math.floor(player.z) + 1,
  };
  const started = Date.now();
  await guest.page.evaluate((c) => window.__mc.submit({ kind: 'place', ...c, slot: 3 }), cell);
  await expect
    .poll(() => guest.page.evaluate((c) => window.__mc.getBlock(c.x, c.y, c.z), cell), {
      timeout: 2000,
    })
    .not.toBe(AIR);
  expect(Date.now() - started).toBeLessThan(2000);
  await expect
    .poll(async () => (await state(host.page)).time, { timeout: 5000 })
    .toBeGreaterThan(t0);
  expect((await state(host.page)).paused).toBe(true);
  // Single-player: after closing the room the menu pauses the world again.
  await host.page.evaluate(() => window.__mc.net.leave());
  const t1 = (await state(host.page)).time;
  await host.page.waitForTimeout(1500);
  expect((await state(host.page)).time).toBe(t1);
});

test('Phase 6 AC5.12: a guest whose terrain differs refuses the world', async ({ players }) => {
  const host = await openTestPlayer(players);
  const code = await hostRoom(host.page);
  const guest = await players.open();
  await openMenu(guest.page, netQuery());
  const text = "This browser generates the world differently from the host's. Try another browser.";
  expect(await joinError(guest.page, code, { checksum: 1 })).toBe(text);
  const g = await state(guest.page);
  expect(g.ui.screen).toBe('worlds');
  expect(g.net.role).toBe('off');
  expect(g.world).toBeNull();
  await expect(guest.page.getByText(text)).toBeVisible();
  await untilNet(host.page, (n) => n.players.length === 1);
});
