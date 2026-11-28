// Phase 8 part B3b AC3.2, AC5.3: a loot chest in a generator 4 room: a guest takes one stack
// of the untouched spawn chest, host and guests read the same rest, a late guest too; once the
// host empties it, the guest's radar no longer shows it.
import type { Page } from '@playwright/test';
import { expect, hostRoom, joinRoom, openTestPlayer, test, untilNet } from './multiplayer';

test.setTimeout(180_000);

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

/** Stands in the chamber next to the chest and waits until it is drawn. */
async function standAt(page: Page, c: Cell): Promise<void> {
  await page.evaluate(
    async ([x, y, z]) => {
      window.__mc.setPlayer({ x, y, z, yaw: 0, pitch: 0 });
      window.__mc.step(2);
      await window.__mc.whenIdle();
    },
    [c.x + 0.5, c.y, c.z + 0.5],
  );
}

/** The radar circle's chest entries that point at a cell, after enough steps for a scan. */
async function chestsShown(page: Page, stand: Cell, chest: Cell): Promise<number> {
  return page.evaluate(
    async ([s, c]) => {
      window.__mc.step(20);
      await window.__mc.whenIdle();
      const radar = window.__mc.getState().radar;
      return (radar?.entries ?? []).filter(
        (e) => e.kind === 'chest' && s.x + e.dx === c.x && s.y + e.dy === c.y && s.z + e.dz === c.z,
      ).length;
    },
    [stand, chest] as const,
  );
}

test('Phase 8B3b AC3.2 AC5.3: a guest takes one loot stack; all read the same rest; the guest radar hides the emptied chest', async ({
  players,
}) => {
  const query = { mode: 'gathering', gen: '4' };
  const host = await openTestPlayer(players, { query });
  const guest = await openTestPlayer(players, { query: { mode: 'gathering', name: 'Anna' } });
  const code = await hostRoom(host.page);
  await joinRoom(guest.page, code);
  expect((await guest.page.evaluate(() => window.__mc.getState())).world?.generatorVersion).toBe(4);
  const sites = await host.page.evaluate(() => window.__mc.lootSites());
  const spawn = sites?.spawn;
  expect(spawn).toBeTruthy();
  if (!spawn) return;
  const { chest, stand } = spawn;
  await standAt(host.page, stand);
  await standAt(guest.page, stand);
  await untilNet(host.page, (net) =>
    net.players.some((p) => !p.self && Math.abs(p.x - (stand.x + 0.5)) < 0.01),
  );
  // Untouched: both derive the same loot; nothing is stored.
  const loot = await getChest(host.page, chest);
  expect(loot?.some((s) => s !== null)).toBe(true);
  expect(await getChest(guest.page, chest)).toEqual(loot);
  expect(await chestsShown(guest.page, stand, chest)).toBe(1);

  const slot = loot?.findIndex((s) => s !== null) ?? -1;
  const item = loot?.[slot]?.item ?? 0;
  const take = { kind: 'quickMove', ...chest, slot, fromChest: true, item };
  expect(
    await guest.page.evaluate((c) => window.__mc.submit({ kind: 'openChest', ...c }), chest),
  ).not.toBe(false);
  await guest.page.evaluate((a) => window.__mc.submit(a), take);
  await expect.poll(async () => (await getChest(host.page, chest))?.[slot] ?? null).toBeNull();
  await expect.poll(async () => (await getChest(guest.page, chest))?.[slot] ?? null).toBeNull();
  const rest = await getChest(host.page, chest);
  expect(await getChest(guest.page, chest)).toEqual(rest);
  expect(rest?.filter((s) => s !== null).length).toBe(
    (loot?.filter((s) => s !== null).length ?? 0) - 1,
  );
  await expect.poll(() => hashOf(guest.page)).toBe(await hashOf(host.page));
  // One stack taken: the chest still holds loot and still shows.
  expect(await chestsShown(guest.page, stand, chest)).toBe(1);

  // A third player joins later and reads the same rest.
  const late = await openTestPlayer(players, { query: { mode: 'gathering', name: 'Ben' } });
  await joinRoom(late.page, code);
  expect(await getChest(late.page, chest)).toEqual(rest);
  await expect.poll(() => hashOf(late.page)).toBe(await hashOf(host.page));

  // The host takes the rest: the guest's radar hides the chest within one scan.
  expect(
    await host.page.evaluate((c) => window.__mc.submit({ kind: 'takeAll', ...c })?.ok, chest),
  ).toBe(true);
  await expect
    .poll(async () => (await getChest(guest.page, chest))?.every((s) => s === null))
    .toBe(true);
  expect(await chestsShown(guest.page, stand, chest)).toBe(0);
  expect(await chestsShown(host.page, stand, chest)).toBe(0);
  await guest.page.evaluate(() => window.__mc.submit({ kind: 'closeChest' }));
});
