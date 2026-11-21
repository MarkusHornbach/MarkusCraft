// Phase 6 part B, step 6: the other players — poses, figures and name tags.
import type { Page } from '@playwright/test';
import { PLATFORM_Y } from './game';
import { type Image, type Region, capture, diffShare, meanColor } from './helpers';
import { linearBrightness } from './lightScenes';
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

test.setTimeout(180_000);

const STONE = 3;
const TORCH = 19;
/** Pixels per block at one block's distance (75° vertical field of view, 540 px high). */
const FOCAL = 270 / Math.tan((37.5 * Math.PI) / 180);
const EYE = 1.62;

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

interface Stage {
  host: Player;
  guest: Player;
  /** The host's cell on the platform. */
  hx: number;
  hz: number;
}

/**
 * A stone platform with a wall behind the host; the host stands on it facing -z, the
 * guest four blocks in front looking at the host.
 */
async function stage(players: Players): Promise<Stage> {
  // Fixed looks: a look from the random player key would change the references.
  const host = await openTestPlayer(players, { query: { name: 'Ada', look: '2' } });
  const guest = await openTestPlayer(players, { query: { name: 'Bo', look: '5' } });
  const code = await hostRoom(host.page);
  await joinRoom(guest.page, code);
  const { player } = await state(host.page);
  const hx = Math.floor(player.x);
  const hz = Math.floor(player.z);
  await host.page.evaluate(
    ([x0, y, z0, stone]) => {
      for (let z = z0 - 8; z <= z0 + 2; z++) {
        for (let x = x0 - 4; x <= x0 + 4; x++) window.__mc.setBlock(x, y, z, stone);
      }
      // A wall behind the host keeps the sky out of the name tag's background.
      for (let h = 1; h <= 6; h++) {
        for (let x = x0 - 4; x <= x0 + 4; x++) window.__mc.setBlock(x, y + h, z0 + 2, stone);
      }
    },
    [hx, PLATFORM_Y, hz, STONE],
  );
  await setPose(host.page, { x: hx + 0.5, y: PLATFORM_Y + 1, z: hz + 0.5, yaw: 0, pitch: 0 });
  await expect
    .poll(() =>
      guest.page.evaluate(
        ([x, y, z]) => window.__mc.getBlock(x, y, z),
        [hx, PLATFORM_Y + 3, hz + 2],
      ),
    )
    .toBe(STONE);
  await setPose(guest.page, {
    x: hx + 0.5,
    y: PLATFORM_Y + 1,
    z: hz - 3.5,
    yaw: Math.PI,
    pitch: 0,
  });
  await untilFigureAt(guest.page, hx + 0.5, hz + 0.5);
  return { host, guest, hx, hz };
}

/** Waits until the guest draws the host's figure at this place. */
async function untilFigureAt(page: Page, x: number, z: number): Promise<void> {
  await untilNet(page, (n) => {
    const host = n.players.find((p) => p.host);
    return (
      host !== undefined && Math.abs(host.renderX - x) < 0.01 && Math.abs(host.renderZ - z) < 0.01
    );
  });
  await page.evaluate(() => window.__mc.whenIdle());
}

/** The screen region of a box `distance` blocks ahead, from `low` to `high` above the feet. */
function boxRegion(distance: number, halfWidth: number, low: number, high: number): Region {
  const top = Math.round(270 - (FOCAL * (high - EYE)) / distance);
  const bottom = Math.round(270 - (FOCAL * (low - EYE)) / distance);
  const half = Math.round((FOCAL * halfWidth) / distance);
  return { x: 480 - half, y: top, width: 2 * half, height: bottom - top };
}

/**
 * The host figure's body, seen from 4 blocks (inset so no edge pixel counts): the top of
 * the figure's body, above the belt.
 */
const BODY = boxRegion(4, 0.15, 0.9, 1.3);
const HEAD = boxRegion(3.8, 0.18, 1.35, 1.75);
/** Where the name tag is, from 4 blocks: centred 2.19 blocks above the feet. */
const TAG = boxRegion(4, 0.25, 2.06, 2.32);

/** Share of pixels in the region whose three channels are all bright (the white letters). */
function whiteShare(image: Image, region: Region): number {
  let white = 0;
  for (let y = region.y; y < region.y + region.height; y++) {
    for (let x = region.x; x < region.x + region.width; x++) {
      const i = (y * image.width + x) * 4;
      if (image.data[i] > 215 && image.data[i + 1] > 215 && image.data[i + 2] > 215) white++;
    }
  }
  return white / (region.width * region.height);
}

/** The top of the host's look (Ember: red and orange stripes) dominates the region. */
function hostColourDominates(image: Image, region: Region): boolean {
  const c = meanColor(image, region);
  return c.r > c.g + 40 && c.r > c.b + 40;
}

test('Phase 6 AC6.1: the guest sees where the host walked', async ({ players }) => {
  const host = await openTestPlayer(players);
  const guest = await openTestPlayer(players);
  const code = await hostRoom(host.page);
  await joinRoom(guest.page, code);
  await host.page.evaluate(() => window.__mc.setPlayer({ yaw: 0.7, pitch: -0.2 }));
  await host.page.keyboard.down('KeyW');
  await host.page.evaluate(() => window.__mc.step(60));
  await host.page.keyboard.up('KeyW');
  const own = (await state(host.page)).player;
  await untilNet(
    guest.page,
    (n) => {
      const h = n.players.find((p) => p.host);
      if (!h) return false;
      return (
        Math.hypot(h.x - own.x, h.y - own.y, h.z - own.z) < 0.05 &&
        Math.abs(h.yaw - own.yaw) < 0.01 &&
        Math.abs(h.pitch - own.pitch) < 0.01
      );
    },
    2000,
  );
});

test('Phase 6 AC6.2, AC6.3, AC12.4: figure, name tag, head and draw calls', async ({ players }) => {
  const { host, guest, hx, hz } = await stage(players);
  const seen = await capture(guest.page);
  expect(hostColourDominates(seen, BODY)).toBe(true);
  expect(whiteShare(seen, TAG)).toBeGreaterThan(0.02);
  const withFigure = (await state(guest.page)).render.drawCalls;
  // AC6.3: the host turns round; the head shows its other side.
  await setPose(host.page, { yaw: Math.PI });
  await untilNet(
    guest.page,
    // The drawn pose, which follows the received one by the interpolation delay.
    (n) => Math.abs(Math.abs(n.players.find((p) => p.host)?.renderYaw ?? 0) - Math.PI) < 0.01,
  );
  await guest.page.evaluate(() => window.__mc.whenIdle());
  const turned = await capture(guest.page);
  expect(diffShare(seen, turned, HEAD)).toBeGreaterThan(0.3);
  // AC6.2: the host goes far away; figure and tag are gone.
  await setPose(host.page, { x: hx + 300.5, z: hz + 0.5 });
  await untilNet(guest.page, (n) => (n.players.find((p) => p.host)?.renderX ?? 0) > hx + 200);
  await guest.page.evaluate(() => window.__mc.whenIdle());
  const empty = await capture(guest.page);
  expect(hostColourDominates(empty, BODY)).toBe(false);
  expect(whiteShare(empty, TAG)).toBeLessThan(0.005);
  // AC12.4 (replaces AC6.6): one other player adds at most two draw calls.
  const without = (await state(guest.page)).render.drawCalls;
  expect(withFigure - without).toBeGreaterThan(0);
  expect(withFigure - without).toBeLessThanOrEqual(2);
});

test('Phase 6 AC6.4: the own figure is never drawn', async ({ players }) => {
  const { host, guest } = await stage(players);
  for (const page of [host.page, guest.page]) {
    await setPose(page, { pitch: -1.55 });
    const image = await capture(page);
    expect(hostColourDominates(image, { x: 440, y: 230, width: 80, height: 80 })).toBe(false);
  }
});

test('Phase 6 AC6.5: no solid block in another player, a torch is fine', async ({ players }) => {
  const { host, guest, hx, hz } = await stage(players);
  const cell = { x: hx, y: PLATFORM_Y + 1, z: hz };
  // The guest stands next to the host's cell, within reach.
  await setPose(guest.page, { x: hx + 0.5, z: hz - 1.5 });
  await guest.page.evaluate((c) => window.__mc.submit({ kind: 'place', ...c, slot: 2 }), cell);
  await untilNet(guest.page, (n) => n.lastResult?.reason === 'occupied');
  expect(await host.page.evaluate((c) => window.__mc.getBlock(c.x, c.y, c.z), cell)).toBe(0);
  // The host cannot place into the guest's cell either.
  const guestCell = { x: hx, y: PLATFORM_Y + 1, z: hz - 2 };
  expect(
    await host.page.evaluate((c) => {
      const r = window.__mc.submit({ kind: 'place', ...c, slot: 2 });
      return r && !r.ok ? r.reason : r?.ok;
    }, guestCell),
  ).toBe('occupied');
  // A torch is no obstacle: it may stand where a player stands.
  await guest.page.evaluate(() => window.__mc.submit({ kind: 'setBarSlot', slot: 4, item: 19 }));
  await guest.page.evaluate((c) => window.__mc.submit({ kind: 'place', ...c, slot: 4 }), cell);
  await expect
    .poll(() => host.page.evaluate((c) => window.__mc.getBlock(c.x, c.y, c.z), cell))
    .toBe(TORCH);
  await expect
    .poll(() => guest.page.evaluate((c) => window.__mc.getBlock(c.x, c.y, c.z), cell))
    .toBe(TORCH);
});

test('Phase 6 AC6.7, AC6.9, AC12.9: the figure at noon and at midnight, with and without a torch', async ({
  players,
}) => {
  const { host, guest, hx, hz } = await stage(players);
  const noon = await capture(guest.page);
  await expect(guest.page).toHaveScreenshot('remote-player.png');
  await host.page.evaluate(() => window.__mc.setTime(0.75));
  await expect
    .poll(async () => Math.abs((await state(guest.page)).time - 0.75))
    .toBeLessThan(0.001);
  await guest.page.evaluate(() => window.__mc.whenIdle());
  const night = await capture(guest.page);
  await expect(guest.page).toHaveScreenshot('remote-player-night.png');
  expect(linearBrightness(night, BODY)).toBeLessThanOrEqual(linearBrightness(noon, BODY) / 3);
  // A torch next to the host lights the figure.
  await host.page.evaluate(
    ([x, y, z]) => window.__mc.setBlock(x, y, z, 19),
    [hx + 1, PLATFORM_Y + 1, hz],
  );
  await expect
    .poll(() =>
      guest.page.evaluate(
        ([x, y, z]) => window.__mc.getBlock(x, y, z),
        [hx + 1, PLATFORM_Y + 1, hz],
      ),
    )
    .toBe(TORCH);
  await guest.page.evaluate(() => window.__mc.whenIdle());
  const lit = await capture(guest.page);
  expect(linearBrightness(lit, BODY)).toBeGreaterThan(linearBrightness(night, BODY) * 1.5);
  expect((await netOf(guest.page)).worldHash).toBe((await netOf(host.page)).worldHash);
});
