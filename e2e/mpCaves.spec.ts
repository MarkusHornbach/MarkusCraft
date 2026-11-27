// Phase 8 part B2a AC4.3: a room of a generator 3 world; the guest has the same caves.
import type { Page } from '@playwright/test';
import { expect, hostRoom, joinRoom, openTestPlayer, test } from './multiplayer';
import { TERRAIN_CHECKSUMS_1337_V3 } from '../src/testing/terrainChecksum';

function state(page: Page) {
  return page.evaluate(() => window.__mc.getState());
}

test('Phase 8B2a AC4.3: a guest joins a generator 3 world and sees the same tunnel', async ({
  players,
}) => {
  const host = await openTestPlayer(players, { query: { gen: '3' } });
  const guest = await openTestPlayer(players, { query: { seed: '42' } });
  const code = await hostRoom(host.page);
  await joinRoom(guest.page, code);
  const options = { terrain: 'balanced', trees: 'few' };
  expect((await state(host.page)).world).toMatchObject({ generatorVersion: 3, options });
  expect((await state(guest.page)).world).toMatchObject({ generatorVersion: 3, options });
  const checksum = (page: Page) => page.evaluate(() => window.__mc.terrainChecksum());
  expect(await checksum(host.page)).toBe(TERRAIN_CHECKSUMS_1337_V3['balanced/few']);
  expect(await checksum(guest.page)).toBe(TERRAIN_CHECKSUMS_1337_V3['balanced/few']);
  // The chunk with the deep end of the nearest entrance, on both sides.
  const sites = await host.page.evaluate(() => window.__mc.caveSites());
  const end = sites?.entrance?.end;
  expect(end).toBeTruthy();
  if (!end) return;
  const column = (page: Page) =>
    page.evaluate(
      async ([x, z]) => {
        window.__mc.setPlayer({ x: x + 0.5, y: 90, z: z + 0.5, mode: 'fly' });
        await window.__mc.whenIdle();
        const cx = Math.floor(x / 16) * 16;
        const cz = Math.floor(z / 16) * 16;
        const out: number[] = [];
        for (let lz = 0; lz < 16; lz += 3) {
          for (let lx = 0; lx < 16; lx += 3) {
            for (let y = 1; y < 80; y++) out.push(window.__mc.getBlock(cx + lx, y, cz + lz));
          }
        }
        return out;
      },
      [end.x, end.z],
    );
  const hostBlocks = await column(host.page);
  expect(hostBlocks).toContain(0);
  expect(await column(guest.page)).toEqual(hostBlocks);
  // The tunnel's air is there for the guest too.
  expect(
    await guest.page.evaluate(([x, y, z]) => window.__mc.getBlock(x, y, z), [end.x, end.y, end.z]),
  ).toBe(0);
});

test('Phase 8B2b AC6.4: at the host’s cell the guest’s radar shows the host’s nearest shaft and cave', async ({
  players,
}) => {
  const host = await openTestPlayer(players, { query: { gen: '3', mode: 'gathering' } });
  const guest = await openTestPlayer(players, { query: { name: 'Anna' } });
  const code = await hostRoom(host.page);
  await joinRoom(guest.page, code);
  const pose = (await state(host.page)).player;
  await guest.page.evaluate(async (p) => {
    window.__mc.setPlayer({ x: p.x, y: p.y, z: p.z, yaw: p.yaw, pitch: 0 });
    await window.__mc.whenIdle();
  }, pose);
  const radar = async (page: Page) => {
    await page.evaluate(async () => {
      window.__mc.step(20);
      await window.__mc.whenIdle();
    });
    const r = (await state(page)).radar;
    if (!r) throw new Error('no radar');
    return r;
  };
  const hostRadar = await radar(host.page);
  const guestRadar = await radar(guest.page);
  for (const kind of ['shaft', 'cave']) {
    const nearest = (r: typeof hostRadar) => {
      const e = r.entries.find((entry) => entry.kind === kind);
      return e ? [e.dx, e.dy, e.dz] : null;
    };
    expect(nearest(hostRadar), kind).not.toBeNull();
    expect(nearest(guestRadar), kind).toEqual(nearest(hostRadar));
  }
});
