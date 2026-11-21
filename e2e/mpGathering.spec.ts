// Phase 6 part C: guests in the host's save (step 8) and Gathering together (step 9).
import type { Page } from '@playwright/test';
import {
  type Player,
  expect,
  hostRoom,
  joinRoom,
  netOf,
  openTestPlayer,
  test,
  untilNet,
} from './multiplayer';

test.setTimeout(180_000);

const TORCH = 19;

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

/** Waits until the host knows the guest at the given position. */
async function hostSees(host: Page, at: { x: number; y: number; z: number }): Promise<void> {
  await untilNet(host, (net) =>
    net.players.some(
      (p) =>
        !p.self &&
        Math.abs(p.x - at.x) < 0.01 &&
        Math.abs(p.y - at.y) < 0.01 &&
        Math.abs(p.z - at.z) < 0.01,
    ),
  );
}

/** Leaves the room (test mode: a fresh world in memory) and joins `code` again. */
async function rejoin(guest: Player, code: string): Promise<void> {
  await guest.page.evaluate(() => window.__mc.net.leave());
  await untilNet(guest.page, (net) => net.role === 'off');
  await joinRoom(guest.page, code);
}

async function expectAsLeft(guest: Page, at: { x: number; y: number; z: number }): Promise<void> {
  const s = await state(guest);
  expect(s.inventory.slots[4]).toEqual({ item: TORCH, count: 1 });
  expect(s.selectedSlot).toBe(5);
  expect(Math.abs(s.player.x - at.x)).toBeLessThan(0.1);
  expect(Math.abs(s.player.y - at.y)).toBeLessThan(0.1);
  expect(Math.abs(s.player.z - at.z)).toBeLessThan(0.1);
  expect(s.player.mode).toBe('fly');
}

test('Phase 6 AC8.4: a returning guest finds its bar and its place, also after the host reloaded', async ({
  players,
}) => {
  const query = { save: '1', world: 'Shared' };
  const host = await openTestPlayer(players, { query });
  const guest = await openTestPlayer(players);
  const code = await hostRoom(host.page);
  await joinRoom(guest.page, code);
  // The guest changes its bar and flies away from where it started.
  await guest.page.evaluate(async () => {
    await window.__mc.submit({ kind: 'setBarSlot', slot: 4, item: 19 });
    await window.__mc.submit({ kind: 'selectSlot', slot: 4 });
  });
  await expect.poll(async () => (await state(guest.page)).inventory.slots[4]?.item).toBe(TORCH);
  const start = (await state(guest.page)).player;
  const away = { x: start.x + 7.25, y: start.y + 4, z: start.z - 5.5 };
  await setPose(guest.page, { ...away, yaw: 1, pitch: -0.2, mode: 'fly' });
  await hostSees(host.page, away);

  await rejoin(guest, code);
  await expectAsLeft(guest.page, away);

  // The host saves and reloads the world, then opens it again: the guest is remembered.
  await host.page.evaluate(() => window.__mc.save());
  await guest.page.evaluate(() => window.__mc.net.leave());
  await untilNet(guest.page, (net) => net.role === 'off');
  await host.page.reload();
  await host.page.waitForFunction(() => window.__mc !== undefined && window.__mc.isReady(), null, {
    timeout: 60_000,
  });
  expect((await netOf(host.page)).role).toBe('off');
  const again = await hostRoom(host.page);
  await joinRoom(guest.page, again);
  await expectAsLeft(guest.page, away);
});
