// The radar in an Adventure room (Phase 8 part B1, AC5.1): the guest has it from the room's
// book, works it out from its own world and sees the host's edits.
import type { Page } from '@playwright/test';
import { expect, hostRoom, joinRoom, openTestPlayer, test } from './multiplayer';

test.setTimeout(180_000);

const AIR = 0;
const COAL_ORE = 12;

async function radar(page: Page) {
  const state = await page.evaluate(() => window.__mc.getState());
  if (!state.radar) throw new Error('no radar');
  return state.radar;
}

async function stepIdle(page: Page, n: number): Promise<void> {
  await page.evaluate(async (count) => {
    window.__mc.step(count);
    await window.__mc.whenIdle();
  }, n);
}

test('Phase 8B1 AC5.1: the guest has the radar; at the same cell it shows the host’s nearest coal; the host’s mining changes it', async ({
  players,
}) => {
  const host = await openTestPlayer(players, {
    query: { mode: 'gathering', terrain: 'balanced', trees: 'few' },
  });
  const guest = await openTestPlayer(players, { query: { name: 'Anna' } });
  const code = await hostRoom(host.page);
  await joinRoom(guest.page, code);
  // Both at the host's cell.
  const pose = (await host.page.evaluate(() => window.__mc.getState())).player;
  await guest.page.evaluate(async (p) => {
    window.__mc.setPlayer({ x: p.x, y: p.y, z: p.z, yaw: p.yaw, pitch: 0 });
    await window.__mc.whenIdle();
  }, pose);
  await stepIdle(host.page, 20);
  await stepIdle(guest.page, 20);
  const hostRadar = await radar(host.page);
  const guestRadar = await radar(guest.page);
  expect(guestRadar).toMatchObject({ unlocked: true, shown: true });
  const coal = (r: typeof hostRadar) => r.entries.find((e) => e.kind === 'coal');
  const nearest = coal(hostRadar);
  expect(nearest).toBeDefined();
  expect(coal(guestRadar)).toMatchObject({
    dx: nearest?.dx,
    dy: nearest?.dy,
    dz: nearest?.dz,
  });

  // The host mines the vein (every coal cell connected to the nearest one).
  const start = [
    Math.floor(pose.x) + (nearest?.dx ?? 0),
    Math.floor(pose.y) + (nearest?.dy ?? 0),
    Math.floor(pose.z) + (nearest?.dz ?? 0),
  ];
  await host.page.evaluate(
    ([sx, sy, sz, ore, air]) => {
      const queue = [[sx, sy, sz]];
      const seen = new Set<string>();
      while (queue.length > 0) {
        const [x, y, z] = queue.pop() as number[];
        const key = `${x},${y},${z}`;
        if (seen.has(key)) continue;
        seen.add(key);
        if (window.__mc.getBlock(x, y, z) !== ore) continue;
        window.__mc.setBlock(x, y, z, air);
        queue.push(
          [x + 1, y, z],
          [x - 1, y, z],
          [x, y + 1, z],
          [x, y - 1, z],
          [x, y, z + 1],
          [x, y, z - 1],
        );
      }
    },
    [...start, COAL_ORE, AIR],
  );
  await expect
    .poll(() => guest.page.evaluate(([x, y, z]) => window.__mc.getBlock(x, y, z), start))
    .toBe(AIR);
  await stepIdle(guest.page, 20);
  const after = coal(await radar(guest.page));
  expect(after).toBeDefined();
  expect([after?.dx, after?.dy, after?.dz]).not.toEqual([nearest?.dx, nearest?.dy, nearest?.dz]);
});
