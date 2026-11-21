// Phase 6 part E, step 14: the network lines of the debug overlay, a host without frames,
// a soak of four players and a large world to join.
import type { Page } from '@playwright/test';
import {
  type Player,
  type Players,
  expect,
  hostRoom,
  joinRoom,
  netOf,
  openTestPlayer,
  test,
  untilNet,
} from './multiplayer';

test.setTimeout(240_000);

const STONE = 3;
const AIR = 0;

function debugValue(page: Page, row: string) {
  return page.locator(`[data-debug="${row}"]`);
}

/** The JavaScript heap of a page after a garbage collection, in MB. */
async function heapMb(page: Page): Promise<number> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('HeapProfiler.collectGarbage');
  const { usedSize } = await cdp.send('Runtime.getHeapUsage');
  await cdp.detach();
  return usedSize / (1024 * 1024);
}

/** Opens `count` guests and joins them to a room of `host`; returns them. */
async function guests(
  players: Players,
  host: Player,
  count: number,
  query: Record<string, string> = {},
): Promise<{ code: string; guests: Player[] }> {
  const code = await hostRoom(host.page);
  const out: Player[] = [];
  for (let i = 0; i < count; i++) {
    const guest = await openTestPlayer(players, { query: { name: `G${i + 1}`, ...query } });
    await joinRoom(guest.page, code);
    out.push(guest);
  }
  return { code, guests: out };
}

test('Phase 6 AC14.1: the F3 overlay shows role, code, players, round trip, link and traffic on host and guest', async ({
  players,
}) => {
  const host = await openTestPlayer(players, { query: { name: 'Ada' } });
  // Single-player: no network lines.
  await host.page.keyboard.press('F3');
  await expect(host.page.locator('.debug-overlay')).toBeVisible();
  await expect(debugValue(host.page, 'room')).toBeHidden();
  const {
    code,
    guests: [guest],
  } = await guests(players, host, 1);
  await guest.page.keyboard.press('F3');
  for (const page of [host.page, guest.page]) {
    await expect(debugValue(page, 'room')).toBeVisible();
    await expect(debugValue(page, 'signal')).toHaveText('open');
    await expect(debugValue(page, 'link')).toHaveText('direct (host → host)', {
      timeout: 15_000,
    });
    await expect(debugValue(page, 'traffic')).toHaveText(
      /^in [1-9]\d* msg\/s \d+\.\d kB\/s, out [1-9]\d* msg\/s \d+\.\d kB\/s$/,
      { timeout: 15_000 },
    );
  }
  await expect(debugValue(host.page, 'room')).toHaveText(`host, online, code ${code}, 2 players`);
  await expect(debugValue(guest.page, 'room')).toHaveText(`guest, online, code ${code}, 2 players`);
  // The guest's round trip to the host; the host shows what each guest reported.
  await expect(debugValue(guest.page, 'roundTrip')).toHaveText(/^\d+ ms$/, { timeout: 15_000 });
  await expect(debugValue(host.page, 'roundTrip')).toHaveText(/^G1 \d+ ms$/, { timeout: 15_000 });
  // F3 off and on again keeps the lines.
  await guest.page.keyboard.press('F3');
  await expect(guest.page.locator('.debug-overlay')).toBeHidden();
});

test('Phase 6 AC14.2: a host without frames serves its guests: edits, poses and time', async ({
  players,
}) => {
  // The clock runs on the host (no freeze).
  const host = await openTestPlayer(players, { query: { name: 'Ada', freeze: '0' } });
  const {
    guests: [a, b],
  } = await guests(players, host, 2, { freeze: '0' });
  const hostState = await host.page.evaluate(() => window.__mc.getState().player);
  const cell = {
    x: Math.floor(hostState.x) + 2,
    // High in the air: free whatever the terrain does there.
    y: 120,
    z: Math.floor(hostState.z),
  };
  await host.page.evaluate(() => window.__mc.suspendFrames(true));
  const timeBefore = await a.page.evaluate(() => window.__mc.getState().time);

  // A's edit is confirmed within 2 s.
  const confirmed = await a.page.evaluate(async (c) => {
    window.__mc.setPlayer({ x: c.x - 1.5, y: c.y - 2, z: c.z + 0.5, mode: 'fly' });
    await window.__mc.whenIdle();
    const before = window.__mc.getState().net.lastResult?.seq ?? 0;
    const t0 = performance.now();
    window.__mc.submit({ kind: 'place', ...c, slot: 0 });
    // A guest's answer comes from the host.
    while ((window.__mc.getState().net.lastResult?.seq ?? 0) <= before) {
      if (performance.now() - t0 > 5000) return { ok: false, ms: Infinity };
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    return { ok: window.__mc.getState().net.lastResult?.ok === true, ms: performance.now() - t0 };
  }, cell);
  expect(confirmed.ok).toBe(true);
  expect(confirmed.ms).toBeLessThan(2000);
  const placed = await a.page.evaluate((c) => window.__mc.getBlock(c.x, c.y, c.z), cell);
  expect(placed).not.toBe(AIR);
  await expect
    .poll(() => b.page.evaluate((c) => window.__mc.getBlock(c.x, c.y, c.z), cell))
    .toBe(placed);

  // A sees B move.
  const bId = (await netOf(b.page)).selfId;
  const target = { x: hostState.x + 3.25, z: hostState.z - 2.5 };
  await b.page.evaluate((t) => window.__mc.setPlayer({ x: t.x, z: t.z }), target);
  await untilNet(a.page, (net) =>
    net.players.some(
      (p) => p.id === bId && Math.abs(p.x - target.x) < 0.01 && Math.abs(p.z - target.z) < 0.01,
    ),
  );

  // The time of day goes on on the guests (the host's pongs).
  await expect
    .poll(() => a.page.evaluate(() => window.__mc.getState().time), { timeout: 10_000 })
    .not.toBe(timeBefore);
  const later = await b.page.evaluate(() => window.__mc.getState().time);
  expect(later).toBeGreaterThan(timeBefore);
  // Everyone still agrees on the world, and the host is still in the room with both.
  await host.page.evaluate(() => window.__mc.suspendFrames(false));
  const hash = (await netOf(host.page)).worldHash;
  await untilNet(a.page, (net) => net.worldHash === hash);
  await untilNet(b.page, (net) => net.worldHash === hash);
  expect((await netOf(host.page)).players.length).toBe(3);
});

test('Phase 6 AC14.3: soak: four players, 50 actions each, one leaves and rejoins; one world, little heap', async ({
  players,
}) => {
  const host = await openTestPlayer(players, { query: { name: 'Ada' } });
  const { code, guests: all } = await guests(players, host, 3);
  const everyone = [host, ...all];
  const heapBefore = await heapMb(host.page);
  const base = await host.page.evaluate(() => window.__mc.getState().player);
  const bx = Math.floor(base.x);
  const bz = Math.floor(base.z);
  const y = 100;

  /** Player `i` flies at its own column and places and breaks blocks above itself. */
  const play = (page: Page, i: number, from: number, to: number) =>
    page.evaluate(
      async ([i, from, to, bx, bz, y]) => {
        const results: (boolean | string)[] = [];
        for (let n = from; n < to; n++) {
          // Moves a little between actions: the others see it walk.
          const x = bx + i * 6 - 9 + (n % 4) * 0.25;
          window.__mc.setPlayer({ x, y: y - 3, z: bz + 0.5, mode: 'fly', yaw: n * 0.1 });
          const cell = { x: bx + i * 6 - 9 + (Math.floor(n / 2) % 3) - 1, y, z: bz };
          const before = window.__mc.getState().net.lastResult?.seq ?? 0;
          const answer = window.__mc.submit(
            n % 2 === 0 ? { kind: 'place', ...cell, slot: 0 } : { kind: 'break', ...cell },
          );
          if (answer) {
            // The host's own action is answered at once.
            results.push(answer.ok || `${n}: host`);
          } else {
            // A guest's answer comes from the host.
            const t0 = performance.now();
            while ((window.__mc.getState().net.lastResult?.seq ?? 0) <= before) {
              if (performance.now() - t0 > 10_000) break;
              await new Promise((resolve) => setTimeout(resolve, 10));
            }
            const last = window.__mc.getState().net.lastResult;
            results.push(last?.ok === true || `${n}: ${last?.reason ?? 'no answer'}`);
          }
          await new Promise((resolve) => setTimeout(resolve, 20));
        }
        return results;
      },
      [i, from, to, bx, bz, y] as const,
    );

  /**
   * Everyone jumps to its column, and the test waits until the host knows all four poses:
   * the host checks the reach of an action against the last pose it got, and a slow
   * runner can deliver an action before the pose of a long jump.
   */
  const toColumns = async (): Promise<void> => {
    await Promise.all(
      everyone.map((p, i) =>
        p.page.evaluate(([x, yy, z]) => window.__mc.setPlayer({ x, y: yy, z, mode: 'fly' }), [
          bx + i * 6 - 9,
          y - 3,
          bz + 0.5,
        ] as const),
      ),
    );
    await untilNet(
      host.page,
      (net) => net.players.length === 4 && net.players.every((p) => Math.abs(p.y - (y - 3)) < 0.01),
      30_000,
    );
  };

  // First half: everyone at once.
  await toColumns();
  const first = await Promise.all(everyone.map((p, i) => play(p.page, i, 0, 25)));
  expect(first.flat().filter((ok) => ok !== true)).toEqual([]);
  // The last guest leaves and comes back.
  const leaver = all[2];
  await leaver.page.evaluate(() => window.__mc.net.leave());
  await untilNet(host.page, (net) => net.players.length === 3);
  await joinRoom(leaver.page, code);
  await untilNet(host.page, (net) => net.players.length === 4);
  // Second half.
  await toColumns();
  const second = await Promise.all(everyone.map((p, i) => play(p.page, i, 25, 50)));
  expect(second.flat().filter((ok) => ok !== true)).toEqual([]);

  // One world everywhere: every block broken again, all hashes equal.
  const hash = (await netOf(host.page)).worldHash;
  for (const p of all) await untilNet(p.page, (net) => net.worldHash === hash, 30_000);
  for (const p of everyone) {
    const blocks = await p.page.evaluate(
      ([bx, bz, y]) => {
        const out: number[] = [];
        for (let x = bx - 12; x <= bx + 12; x++) out.push(window.__mc.getBlock(x, y, bz));
        return out;
      },
      [bx, bz, y] as const,
    );
    expect(blocks.every((b) => b === AIR)).toBe(true);
  }
  const heapAfter = await heapMb(host.page);
  console.log(`AC14.3: host heap ${heapBefore.toFixed(1)} MB → ${heapAfter.toFixed(1)} MB`);
  expect(heapAfter - heapBefore).toBeLessThan(50);
});

test('Phase 6 AC14.4: a guest joins a host with 50 000 edits and has its world within 20 s', async ({
  players,
}) => {
  const host = await openTestPlayer(players, { query: { name: 'Ada' } });
  // 50 000 edits in chunks far away from everyone (no light, no meshes to update).
  await host.page.evaluate((stone) => {
    for (let i = 0; i < 50_000; i++) {
      const x = 3000 + (i % 64);
      const z = 3000 + (Math.floor(i / 64) % 64);
      const y = 140 + Math.floor(i / 4096);
      window.__mc.setBlock(x, y, z, stone);
    }
  }, STONE);
  const code = await hostRoom(host.page);
  const hash = (await netOf(host.page)).worldHash;
  const guest = await openTestPlayer(players, { query: { name: 'Bo' } });
  const start = Date.now();
  await joinRoom(guest.page, code);
  await untilNet(guest.page, (net) => net.worldHash === hash, 20_000);
  const ms = Date.now() - start;
  console.log(`AC14.4: joined with 50 000 edits in ${ms} ms`);
  expect(ms).toBeLessThan(20_000);
  expect((await netOf(guest.page)).status).toBe('online');
});
