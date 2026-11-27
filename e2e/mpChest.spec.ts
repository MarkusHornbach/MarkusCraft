// Phase 8 part B3a1: one chest in a room through the test API: host and guest move items,
// each sees the other's moves, a third player who joins late reads the same contents.
import type { Page } from '@playwright/test';
import { expect, hostRoom, joinRoom, openTestPlayer, test, untilNet } from './multiplayer';

test.setTimeout(180_000);

const STONE = 3;
const PLANKS = 7;
const CHEST = 20;

interface Cell {
  x: number;
  y: number;
  z: number;
}

function getChest(page: Page, c: Cell) {
  return page.evaluate(([x, y, z]) => window.__mc.getChest(x, y, z), [c.x, c.y, c.z]);
}

function hashOf(page: Page): Promise<number> {
  return page.evaluate(() => window.__mc.getState().net.worldHash);
}

/** Puts a player beside the chest, flying (Creative), and waits until it is drawn. */
async function standBeside(page: Page, c: Cell, dx: number): Promise<void> {
  await page.evaluate(
    async ([x, y, z]) => {
      window.__mc.setPlayer({ x, y, z, yaw: 0, pitch: 0, mode: 'fly' });
      await window.__mc.whenIdle();
    },
    [c.x + 0.5 + dx, c.y, c.z + 0.5],
  );
}

test('Phase 8B3a AC3.7: two players move items in one chest; a late guest reads the same contents', async ({
  players,
}) => {
  const host = await openTestPlayer(players);
  const guest = await openTestPlayer(players);
  const code = await hostRoom(host.page);
  await joinRoom(guest.page, code);
  const start = (await host.page.evaluate(() => window.__mc.getState())).player;
  const chest = { x: Math.floor(start.x) + 2, y: Math.floor(start.y) + 3, z: Math.floor(start.z) };
  await host.page.evaluate(
    ([x, y, z, id]) => window.__mc.setBlock(x, y, z, id),
    [chest.x, chest.y, chest.z, CHEST],
  );
  await standBeside(host.page, chest, -2);
  await standBeside(guest.page, chest, 2);
  await expect
    .poll(() =>
      guest.page.evaluate(
        ([x, y, z]) => window.__mc.getBlock(x, y, z),
        [chest.x, chest.y, chest.z],
      ),
    )
    .toBe(CHEST);
  // Both wait until the host knows where the guest stands.
  await untilNet(host.page, (net) =>
    net.players.some((p) => !p.self && Math.abs(p.x - (chest.x + 2.5)) < 0.01),
  );

  // The host puts its stone into slot 0, the guest its planks into slot 1.
  const hostMove = {
    kind: 'chestMove',
    ...chest,
    from: 2,
    fromChest: false,
    to: 0,
    toChest: true,
    item: STONE,
  };
  expect(await host.page.evaluate((a) => window.__mc.submit(a)?.ok, hostMove)).toBe(true);
  await expect
    .poll(async () => (await getChest(guest.page, chest))?.[0])
    .toEqual({ item: STONE, count: 1 });
  const guestMove = {
    kind: 'chestMove',
    ...chest,
    from: 6,
    fromChest: false,
    to: 1,
    toChest: true,
    item: PLANKS,
  };
  await guest.page.evaluate((a) => window.__mc.submit(a), guestMove);
  await expect
    .poll(async () => (await getChest(host.page, chest))?.[1])
    .toEqual({ item: PLANKS, count: 1 });
  // The guest takes the host's stone out again (onto its own stone); the host sees it go.
  const takeBack = { kind: 'quickMove', ...chest, slot: 0, fromChest: true, item: STONE };
  await guest.page.evaluate((a) => window.__mc.submit(a), takeBack);
  await expect.poll(async () => (await getChest(host.page, chest))?.[0]).toBeNull();
  expect((await guest.page.evaluate(() => window.__mc.getState())).inventory.slots[2]).toEqual({
    item: STONE,
    count: 2,
  });
  await expect.poll(() => hashOf(guest.page)).toBe(await hashOf(host.page));

  // A third player joins late and finds the same contents.
  const late = await openTestPlayer(players);
  await joinRoom(late.page, code);
  expect(await getChest(late.page, chest)).toEqual(await getChest(host.page, chest));
  expect(await hashOf(late.page)).toBe(await hashOf(host.page));
  expect((await late.page.evaluate(() => window.__mc.getState())).world?.chests).toBe(1);
  expect(await host.page.evaluate(() => window.__mc.verifyLight())).toBe(0);
});
