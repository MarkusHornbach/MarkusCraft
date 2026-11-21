// Phase 6 part D, step 12: the player figure of the others — looks, motion, swing, belt.
import type { Page } from '@playwright/test';
import { PLATFORM_Y } from './game';
import { type Region, capture, diffShare, meanColor } from './helpers';
import { findSites } from './sites';
import {
  type Player,
  expect,
  hostRoom,
  joinRoom,
  netOf,
  openTestPlayer,
  stepPaced,
  test,
  testQuery,
  untilNet,
} from './multiplayer';

test.setTimeout(240_000);
test.describe.configure({ mode: 'serial' });

const STONE = 3;
/** Pixels per block at one block's distance (75° vertical field of view, 540 px high). */
const FOCAL = 270 / Math.tan((37.5 * Math.PI) / 180);
const EYE = 1.62;
const DEG = Math.PI / 180;

type Anim = { leftArm: number; rightArm: number; leftLeg: number; rightLeg: number };
interface Sample {
  t: number;
  anim: (Anim & { bodyYaw: number; headYaw: number; headPitch: number }) | null;
  busy: boolean;
}

function state(page: Page) {
  return page.evaluate(() => window.__mc.getState());
}

async function setPose(
  page: Page,
  pose: { x?: number; y?: number; z?: number; yaw?: number; pitch?: number },
): Promise<void> {
  await page.evaluate(async (p) => {
    window.__mc.setPlayer(p);
    await window.__mc.whenIdle();
  }, pose);
}

/** The figure of player `id` as the page drew it, every frame for `ms` milliseconds. */
function sampleFigure(page: Page, id: number, ms: number): Promise<Sample[]> {
  return page.evaluate(
    async ([who, span]) => {
      const out: Sample[] = [];
      const start = performance.now();
      while (performance.now() - start < span) {
        await new Promise((resolve) => requestAnimationFrame(resolve));
        const p = window.__mc.getState().net.players.find((q) => q.id === who);
        out.push({ t: performance.now() - start, anim: p?.anim ?? null, busy: p?.busy ?? false });
      }
      return out;
    },
    [id, ms] as const,
  );
}

async function selfId(page: Page): Promise<number> {
  const id = (await netOf(page)).selfId;
  if (id === null) throw new Error('not in a room');
  return id;
}

/** The screen region of a box `distance` blocks ahead, `dx` to the right, by heights. */
function region(distance: number, dx0: number, dx1: number, low: number, high: number): Region {
  const top = Math.round(270 - (FOCAL * (high - EYE)) / distance);
  const bottom = Math.round(270 - (FOCAL * (low - EYE)) / distance);
  const left = Math.round(480 + (FOCAL * dx0) / distance);
  const right = Math.round(480 + (FOCAL * dx1) / distance);
  return { x: left, y: top, width: right - left, height: bottom - top };
}

/** A stone platform around the host's cell; the host stands on it facing −z. */
async function platform(host: Page): Promise<{ hx: number; hz: number }> {
  const { player } = await state(host);
  const hx = Math.floor(player.x);
  const hz = Math.floor(player.z);
  await host.evaluate(
    ([x0, y, z0, stone]) => {
      for (let z = z0 - 10; z <= z0 + 2; z++) {
        for (let x = x0 - 5; x <= x0 + 5; x++) {
          window.__mc.setBlock(x, y, z, stone);
          for (let h = 1; h <= 4; h++) window.__mc.setBlock(x, y + h, z, 0);
        }
      }
    },
    [hx, PLATFORM_Y, hz, STONE],
  );
  await setPose(host, { x: hx + 0.5, y: PLATFORM_Y + 1, z: hz + 0.5, yaw: 0, pitch: 0 });
  return { hx, hz };
}

/** Waits until `page` draws player `id` at this place. */
async function untilDrawnAt(page: Page, id: number, x: number, z: number): Promise<void> {
  await untilNet(page, (n) => {
    const p = n.players.find((q) => q.id === id);
    return p !== undefined && Math.abs(p.renderX - x) < 0.01 && Math.abs(p.renderZ - z) < 0.01;
  });
  await page.evaluate(() => window.__mc.whenIdle());
}

const LIMBS = ['leftArm', 'rightArm', 'leftLeg', 'rightLeg'] as const;

test('Phase 6 AC12.4, AC12.8: three guests, draw calls, the look and the belt', async ({
  players,
}) => {
  const host = await openTestPlayer(players, { query: { name: 'Hal', look: '1' } });
  const guests: Player[] = [];
  for (const [name, look] of [
    ['Pia', '3'],
    ['Quin', '3'],
    ['Rex', '6'],
  ]) {
    guests.push(await openTestPlayer(players, { query: { name, look } }));
  }
  const code = await hostRoom(host.page);
  for (const g of guests) await joinRoom(g.page, code);
  const { hx, hz } = await platform(host.page);
  const ids = await Promise.all(guests.map((g) => selfId(g.page)));
  // AC12.8: the host lists the looks; the two guests of look 3 have different slots.
  const listed = (await netOf(host.page)).players;
  expect(ids.map((id) => listed.find((p) => p.id === id)?.look)).toEqual([3, 3, 6]);
  const slots = ids.map((id) => listed.find((p) => p.id === id)?.slot);
  expect(slots[0]).not.toBe(slots[1]);
  // The guests stand in a row 4 blocks in front of the host, facing it.
  const row = [-1.5, 0, 1.5];
  for (const [i, g] of guests.entries()) {
    await setPose(g.page, {
      x: hx + 0.5 + row[i],
      y: PLATFORM_Y + 1,
      z: hz - 3.5,
      yaw: Math.PI,
      pitch: 0,
    });
  }
  for (const [i, id] of ids.entries())
    await untilDrawnAt(host.page, id, hx + 0.5 + row[i], hz - 3.5);
  // All three drawn, standing still (their limbs at rest), before the picture is taken.
  await untilNet(host.page, (n) =>
    ids.every((id) => {
      const a = n.players.find((p) => p.id === id)?.anim;
      return a !== null && a !== undefined && a.leftLeg === 0 && a.rightArm === 0;
    }),
  );
  await host.page.evaluate(() => window.__mc.whenIdle());
  const image = await capture(host.page);
  const withFigures = (await state(host.page)).render.drawCalls;
  // Look 3 (Pebble): a grey top; the region is the figure's own left of the vest.
  const top = meanColor(image, region(4, -1.5 + 0.1, -1.5 + 0.2, 0.95, 1.3));
  const pebble = [150, 146, 136].map((c) => c * 0.8);
  expect(Math.abs(top.r - pebble[0])).toBeLessThan(30);
  expect(Math.abs(top.g - pebble[1])).toBeLessThan(30);
  expect(Math.abs(top.b - pebble[2])).toBeLessThan(30);
  // The belts (beside the buckle) show each guest's slot colour.
  const belt = (dx: number): ReturnType<typeof meanColor> =>
    meanColor(image, region(4, dx + 0.09, dx + 0.21, 0.71, 0.78));
  const colours = [belt(-1.5), belt(0)];
  const dominant = (c: ReturnType<typeof meanColor>): string =>
    c.b > c.r + 40 && c.b > c.g + 10
      ? 'blue'
      : c.g > c.r + 30 && c.g > c.b + 30
        ? 'green'
        : c.r > c.g + 40 && c.r > c.b + 40
          ? 'red'
          : c.r > c.b + 60 && c.g > c.b + 40
            ? 'yellow'
            : 'none';
  const slotColour = ['red', 'blue', 'green', 'yellow'];
  expect(colours.map(dominant), JSON.stringify({ colours, top })).toEqual([
    slotColour[slots[0] ?? 0],
    slotColour[slots[1] ?? 0],
  ]);
  // AC12.4: three other players add at most six draw calls.
  for (const g of guests) await setPose(g.page, { x: hx + 300.5 });
  for (const id of ids) {
    await untilNet(host.page, (n) => (n.players.find((p) => p.id === id)?.renderX ?? 0) > hx + 200);
  }
  await host.page.evaluate(() => window.__mc.whenIdle());
  const without = (await state(host.page)).render.drawCalls;
  expect(withFigures - without).toBeGreaterThan(0);
  expect(withFigures - without).toBeLessThanOrEqual(6);
});

test('Phase 6 AC12.5: a walking guest swings its legs, and they come to rest', async ({
  players,
}) => {
  const host = await openTestPlayer(players, { query: { name: 'Hal', look: '1' } });
  const guest = await openTestPlayer(players, { query: { name: 'Pia', look: '7' } });
  await joinRoom(guest.page, await hostRoom(host.page));
  const { hx, hz } = await platform(host.page);
  const id = await selfId(guest.page);
  // The guest stands 3 blocks in front of the host and walks across its view.
  await setPose(guest.page, {
    x: hx - 2.5,
    y: PLATFORM_Y + 1,
    z: hz - 2.5,
    yaw: -Math.PI / 2,
    pitch: 0,
  });
  await untilDrawnAt(host.page, id, hx - 2.5, hz - 2.5);
  for (const sample of await sampleFigure(host.page, id, 300)) {
    for (const limb of LIMBS) expect(sample.anim?.[limb]).toBe(0);
  }
  await guest.page.keyboard.down('KeyW');
  const walk = stepPaced(guest.page, 60);
  // During the walk: the legs swing in opposite directions, and the picture moves.
  await expect
    .poll(
      async () => {
        const p = (await netOf(host.page)).players.find((q) => q.id === id);
        const a = p?.anim;
        return a ? a.leftLeg * a.rightLeg < 0 && Math.abs(a.leftLeg) > 0.2 : false;
      },
      { timeout: 10_000, intervals: [20] },
    )
    .toBe(true);
  const first = await capture(host.page);
  await host.page.waitForTimeout(100);
  const second = await capture(host.page);
  // The guest's legs, wherever it is on its way across the view.
  expect(diffShare(first, second, region(3, -2.8, 2.8, 0.05, 0.65))).toBeGreaterThan(0.01);
  await walk;
  await guest.page.keyboard.up('KeyW');
  await guest.page.evaluate(() => window.__mc.step(1));
  const stopped = Date.now();
  // Within 0.5 s after the stop (plus the interpolation delay of 0.1 s) the limbs rest.
  await expect
    .poll(
      async () => {
        const p = (await netOf(host.page)).players.find((q) => q.id === id);
        return LIMBS.every((limb) => Math.abs(p?.anim?.[limb] ?? 1) < 0.01);
      },
      { timeout: 5_000, intervals: [20] },
    )
    .toBe(true);
  // A software-rendered page draws a few frames per second: the last of them may be late.
  expect(Date.now() - stopped).toBeLessThan(600 + 500);
});

test('Phase 6 AC12.6: head and body follow the host turning and looking down', async ({
  players,
}) => {
  const host = await openTestPlayer(players, { query: { name: 'Hal', look: '1' } });
  const guest = await openTestPlayer(players, { query: { name: 'Pia', look: '2' } });
  await joinRoom(guest.page, await hostRoom(host.page));
  await platform(host.page);
  await untilNet(guest.page, (n) => {
    const a = n.players.find((p) => p.host)?.anim;
    return a !== null && a !== undefined && Math.abs(a.bodyYaw) < 1e-6;
  });
  await setPose(host.page, { yaw: 90 * DEG, pitch: -0.6 });
  await untilNet(guest.page, (n) => {
    const h = n.players.find((p) => p.host);
    const a = h?.anim;
    if (!a) return false;
    return (
      Math.abs(a.headYaw) <= 45 * DEG + 1e-6 &&
      Math.abs(a.bodyYaw) >= 45 * DEG - 1e-6 &&
      Math.abs(a.headPitch + 0.6) < 0.01
    );
  });
});

test('Phase 6 AC12.7: busy breaking swings the arm; one placed block one swing', async ({
  players,
}) => {
  const host = await openTestPlayer(players, {
    query: { name: 'Hal', look: '1', mode: 'gathering' },
  });
  const guest = await openTestPlayer(players, { query: { name: 'Pia', look: '4' } });
  await joinRoom(guest.page, await hostRoom(host.page));
  const id = await selfId(guest.page);
  // The guest holds break on a log.
  const { tree } = await findSites(guest.page);
  await setPose(guest.page, {
    x: tree.stand.x + 0.5,
    y: tree.stand.y,
    z: tree.stand.z + 0.5,
    yaw: tree.yaw,
    pitch: 0,
  });
  await guest.page.mouse.move(480, 270);
  await guest.page.mouse.down();
  const holding = stepPaced(guest.page, 150);
  await untilNet(host.page, (n) => n.players.find((p) => p.id === id)?.busy === true);
  const samples = await sampleFigure(host.page, id, 1300);
  await holding;
  await guest.page.mouse.up();
  await guest.page.evaluate(() => window.__mc.step(1));
  // The right arm changes sign at least twice within one second.
  let best = 0;
  for (const [i, from] of samples.entries()) {
    let changes = 0;
    let last = Math.sign(from.anim?.rightArm ?? 0);
    for (const s of samples.slice(i + 1)) {
      if (s.t - from.t > 1000) break;
      const sign = Math.sign(s.anim?.rightArm ?? 0);
      if (sign !== 0 && last !== 0 && sign !== last) changes++;
      if (sign !== 0) last = sign;
    }
    best = Math.max(best, changes);
  }
  expect(samples.every((s) => s.busy)).toBe(true);
  expect(best).toBeGreaterThanOrEqual(2);
  await untilNet(host.page, (n) => n.players.find((p) => p.id === id)?.busy === false);
});

test('Phase 6 AC12.7: in Creative one placed block gives one swing on the other player', async ({
  players,
}) => {
  const host = await openTestPlayer(players, { query: { name: 'Hal', look: '1' } });
  const guest = await openTestPlayer(players, { query: { name: 'Pia', look: '4' } });
  await joinRoom(guest.page, await hostRoom(host.page));
  const { hx, hz } = await platform(host.page);
  await untilNet(guest.page, (n) => n.players.find((p) => p.host)?.anim?.rightArm === 0);
  const sampling = sampleFigure(guest.page, 1, 1500);
  await host.page.evaluate(
    ([x, y, z]) => window.__mc.submit({ kind: 'place', x, y, z, slot: 2 }),
    [hx + 2, PLATFORM_Y + 1, hz - 2],
  );
  const samples = await sampling;
  let swings = 0;
  let moving = false;
  let first = -1;
  let last = -1;
  for (const s of samples) {
    const now = (s.anim?.rightArm ?? 0) !== 0;
    if (now && !moving) swings++;
    if (now && first < 0) first = s.t;
    if (now) last = s.t;
    moving = now;
  }
  expect(swings).toBe(1);
  // One swing lasts 300 ms; a slow frame may stretch what the samples see.
  expect(last - first).toBeLessThan(300 + 250);
  expect(samples.at(-1)?.anim?.rightArm).toBe(0);
});

test('Phase 6 AC12.10: an identity of Part B joins with the look of its key, unchanged', async ({
  players,
}) => {
  const host = await openTestPlayer(players, { query: { name: 'Hal', look: '1' } });
  const code = await hostRoom(host.page);
  const key = 'c3' + '5a'.repeat(15);
  const stored = JSON.stringify({ key, name: 'Old' });
  const guest = await players.open();
  await guest.page.addInitScript(
    ([k, text]) => {
      // Only before the first load: later loads must see what the page stored.
      if (window.sessionStorage.getItem('seeded') === null) {
        window.sessionStorage.setItem('seeded', '1');
        window.localStorage.setItem(k, text);
      }
    },
    ['markuscraft.player.v1', stored] as const,
  );
  await guest.page.goto(`/${testQuery()}`);
  await guest.page.waitForFunction(() => window.__mc?.isReady(), null, { timeout: 60_000 });
  const expected = 1 + (parseInt(key.slice(0, 2), 16) % 8);
  expect((await state(guest.page)).player).toMatchObject({
    name: 'Old',
    choice: 0,
    look: expected,
  });
  await joinRoom(guest.page, code);
  const id = await selfId(guest.page);
  await untilNet(host.page, (n) => n.players.find((p) => p.id === id)?.look === expected);
  expect(
    await guest.page.evaluate(() => window.localStorage.getItem('markuscraft.player.v1')),
  ).toBe(stored);
});

test('Phase 6 AC12.11: the figure sheet', async ({ players }) => {
  const host = await openTestPlayer(players, { query: { look: '1' } });
  await host.page.evaluate(() => window.__mc.figureSheet());
  await expect(host.page.locator('.figure-sheet')).toHaveScreenshot('figure-sheet.png');
});
