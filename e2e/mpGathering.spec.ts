// Phase 6 part C: guests in the host's save (step 8) and Gathering together (step 9).
import type { Page } from '@playwright/test';
import {
  type Player,
  expect,
  hostRoom,
  joinRoom,
  netOf,
  openTestPlayer,
  stepPaced,
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

const AIR = 0;
const STONE = 3;
const LOG = 5;
const PLANKS = 7;
const SAND = 4;
const WORKBENCH = 15;
const FURNACE = 16;
const GLASS = 9;
const COAL = 256;
const STONE_PICKAXE = 262;
const WOODEN_PICKAXE = 259;
const PLATFORM_Y = 110;

/** A host and a guest in test mode in a Gathering world (the host's). */
async function gatheringRoom(
  players: Parameters<typeof openTestPlayer>[0],
  guestOptions: Parameters<typeof openTestPlayer>[1] = {},
): Promise<{ host: Player; guest: Player; guestId: number }> {
  const host = await openTestPlayer(players, { query: { mode: 'gathering' } });
  const guest = await openTestPlayer(players, guestOptions);
  const code = await hostRoom(host.page);
  await joinRoom(guest.page, code);
  const net = await netOf(guest.page);
  expect((await state(guest.page)).mode).toBe('gathering');
  if (net.selfId === null) throw new Error('no id');
  return { host, guest, guestId: net.selfId };
}

/**
 * A stone platform high above the terrain, set by the host; the guest stands on it facing
 * -Z, the host two blocks to its side. Returns the guest's column.
 */
async function platform(host: Page, guest: Page): Promise<{ px: number; pz: number }> {
  const { player } = await state(host);
  const px = Math.floor(player.x);
  const pz = Math.floor(player.z);
  await host.evaluate(
    ([x0, y, z0]) => {
      for (let z = z0 - 6; z <= z0 + 2; z++) {
        for (let x = x0 - 3; x <= x0 + 3; x++) window.__mc.setBlock(x, y, z, 3);
      }
    },
    [px, PLATFORM_Y, pz],
  );
  await expect
    .poll(() =>
      guest.evaluate(([x, y, z]) => window.__mc.getBlock(x, y, z), [px, PLATFORM_Y, pz - 6]),
    )
    .toBe(STONE);
  await setPose(host, { x: px + 2.5, y: PLATFORM_Y + 1, z: pz + 0.5, yaw: 0, pitch: 0 });
  await setPose(guest, { x: px + 0.5, y: PLATFORM_Y + 1, z: pz + 0.5, yaw: 0, pitch: 0 });
  return { px, pz };
}

/** The host sets a block past the action layer; waits until the guest has it. */
async function hostSet(
  host: Page,
  guest: Page,
  c: { x: number; y: number; z: number },
  id: number,
) {
  await host.evaluate(([x, y, z, b]) => window.__mc.setBlock(x, y, z, b), [c.x, c.y, c.z, id]);
  await expect
    .poll(() => guest.evaluate(([x, y, z]) => window.__mc.getBlock(x, y, z), [c.x, c.y, c.z]))
    .toBe(id);
  await guest.evaluate(() => window.__mc.whenIdle());
}

/** The host gives the guest items (test tool); waits until the guest's record has them. */
async function giveGuest(host: Page, guest: Page, id: number, item: number, count: number) {
  const before = await have(guest, item);
  await host.evaluate(([p, i, c]) => window.__mc.give(i, c, p), [id, item, count]);
  await expect.poll(() => have(guest, item)).toBe(before + count);
}

async function have(page: Page, item: number): Promise<number> {
  const { inventory } = await state(page);
  return inventory.slots.reduce((sum, s) => sum + (s?.item === item ? s.count : 0), 0);
}

/** Submits an action on the guest and waits until its effect shows in `check`. */
async function guestDoes(guest: Page, action: unknown, check: () => Promise<boolean>) {
  await guest.evaluate((a) => window.__mc.submit(a as never), action);
  await expect.poll(check).toBe(true);
}

/** Selects the bar slot holding `item` on the guest (through the host). */
async function guestSelect(guest: Page, item: number): Promise<number> {
  const slot = (await state(guest)).inventory.slots.findIndex((s) => s?.item === item);
  expect(slot).toBeGreaterThanOrEqual(0);
  expect(slot).toBeLessThan(9);
  await guestDoes(guest, { kind: 'selectSlot', slot }, async () => {
    return (await state(guest)).selectedSlot === slot + 1;
  });
  return slot;
}

test("Phase 6 AC9.6: a guest breaks a log with real input; the item is the guest's, the progress shows", async ({
  players,
}) => {
  const { host, guest } = await gatheringRoom(players);
  const { px, pz } = await platform(host.page, guest.page);
  const log = { x: px, y: PLATFORM_Y + 2, z: pz - 1 };
  await hostSet(host.page, guest.page, log, LOG);
  await guest.page.mouse.move(480, 270);
  await guest.page.mouse.down();
  // A log by hand takes 2 s: halfway there the progress shows as in single-player.
  await stepPaced(guest.page, 60);
  const halfway = (await state(guest.page)).breaking;
  expect(halfway).toMatchObject({ x: log.x, y: log.y, z: log.z });
  expect(halfway?.progress).toBeGreaterThan(0.3);
  expect(halfway?.progress).toBeLessThan(0.75);
  expect(
    await guest.page.evaluate(([x, y, z]) => window.__mc.getBlock(x, y, z), [log.x, log.y, log.z]),
  ).toBe(LOG);
  // The rest of the time, plus the round trip.
  await stepPaced(guest.page, 90);
  await guest.page.mouse.up();
  await expect.poll(() => have(guest.page, LOG)).toBe(1);
  expect(await have(host.page, LOG)).toBe(0);
  await expect
    .poll(() =>
      host.page.evaluate(([x, y, z]) => window.__mc.getBlock(x, y, z), [log.x, log.y, log.z]),
    )
    .toBe(AIR);
  expect(
    await guest.page.evaluate(([x, y, z]) => window.__mc.getBlock(x, y, z), [log.x, log.y, log.z]),
  ).toBe(AIR);
  expect(await host.page.evaluate(() => window.__mc.verifyLight())).toBe(0);
  expect(await guest.page.evaluate(() => window.__mc.verifyLight())).toBe(0);
});

test('Phase 6 AC9.7: a guest crafts, places a workbench and a furnace, and smelts with the 2 s bar', async ({
  players,
}) => {
  const { host, guest, guestId } = await gatheringRoom(players);
  const { px, pz } = await platform(host.page, guest.page);
  const g = guest.page;
  await giveGuest(host.page, g, guestId, LOG, 3);
  // Planks (recipe 1) and a workbench (recipe 3) without a station.
  await guestDoes(g, { kind: 'craft', recipe: 1 }, async () => (await have(g, PLANKS)) === 4);
  await guestDoes(g, { kind: 'craft', recipe: 1 }, async () => (await have(g, PLANKS)) === 8);
  await guestDoes(g, { kind: 'craft', recipe: 1 }, async () => (await have(g, PLANKS)) === 12);
  await guestDoes(g, { kind: 'craft', recipe: 3 }, async () => (await have(g, WORKBENCH)) === 1);
  const benchCell = { x: px - 1, y: PLATFORM_Y + 1, z: pz - 2 };
  const benchSlot = await guestSelect(g, WORKBENCH);
  await guestDoes(g, { kind: 'place', ...benchCell, slot: benchSlot }, async () => {
    return (
      (await host.page.evaluate(
        ([x, y, z]) => window.__mc.getBlock(x, y, z),
        [benchCell.x, benchCell.y, benchCell.z],
      )) === WORKBENCH
    );
  });
  // Sticks (recipe 2) and, at the workbench, a wooden pickaxe (recipe 4).
  await guestDoes(g, { kind: 'craft', recipe: 2 }, async () => (await have(g, 257)) === 4);
  await guestDoes(
    g,
    { kind: 'craft', recipe: 4 },
    async () => (await have(g, WOODEN_PICKAXE)) === 1,
  );
  // A furnace (recipe 10) from eight stone at the workbench, placed next to it.
  await giveGuest(host.page, g, guestId, STONE, 8);
  await guestDoes(g, { kind: 'craft', recipe: 10 }, async () => (await have(g, FURNACE)) === 1);
  const furnaceCell = { x: px + 1, y: PLATFORM_Y + 1, z: pz - 2 };
  const furnaceSlot = await guestSelect(g, FURNACE);
  await guestDoes(g, { kind: 'place', ...furnaceCell, slot: furnaceSlot }, async () => {
    return (
      (await host.page.evaluate(
        ([x, y, z]) => window.__mc.getBlock(x, y, z),
        [furnaceCell.x, furnaceCell.y, furnaceCell.z],
      )) === FURNACE
    );
  });
  // Glass (recipe 17) in the furnace: the 2 s bar of the guest's own screen, then the item.
  await giveGuest(host.page, g, guestId, SAND, 2);
  await giveGuest(host.page, g, guestId, COAL, 1);
  await g.keyboard.press('KeyE');
  await g.locator('.inventory-tab[data-tab="crafting"]').click();
  const glassRow = g.locator('.recipe-row[data-recipe="glass"]');
  await glassRow.scrollIntoViewIfNeeded();
  await glassRow.locator('.recipe-craft').click();
  await g.evaluate(() => window.__mc.step(1));
  await expect(glassRow.locator('.recipe-progress')).toBeVisible();
  await g.evaluate(() => window.__mc.step(59));
  expect((await state(g)).smelting?.progress).toBeCloseTo(0.5, 5);
  expect(await have(g, GLASS)).toBe(0);
  await g.evaluate(() => window.__mc.step(60));
  await expect.poll(() => have(g, GLASS)).toBe(2);
  expect(await have(g, SAND)).toBe(0);
  // Both stations are in the host's world, and the host's items are untouched.
  const hostBlocks = await host.page.evaluate(
    ([a, b]) => [window.__mc.getBlock(a.x, a.y, a.z), window.__mc.getBlock(b.x, b.y, b.z)],
    [benchCell, furnaceCell] as const,
  );
  expect(hostBlocks).toEqual([WORKBENCH, FURNACE]);
  expect((await state(host.page)).inventory.slots.every((s) => s === null)).toBe(true);
  const [h, n] = [await netOf(host.page), await netOf(g)];
  expect(n.worldHash).toBe(h.worldHash);
});

test('Phase 6 AC9.8: a guest places a torch on stone and breaks the stone; the torch goes with it', async ({
  players,
}) => {
  const { host, guest, guestId } = await gatheringRoom(players);
  const { px, pz } = await platform(host.page, guest.page);
  const g = guest.page;
  const stone = { x: px, y: PLATFORM_Y + 1, z: pz - 1 };
  const torch = { ...stone, y: stone.y + 1 };
  await hostSet(host.page, g, stone, STONE);
  await giveGuest(host.page, g, guestId, TORCH, 1);
  await giveGuest(host.page, g, guestId, STONE_PICKAXE, 1);
  const torchSlot = await guestSelect(g, TORCH);
  await guestDoes(g, { kind: 'place', ...torch, slot: torchSlot }, async () => {
    return (
      (await host.page.evaluate(
        ([x, y, z]) => window.__mc.getBlock(x, y, z),
        [torch.x, torch.y, torch.z],
      )) === TORCH
    );
  });
  await expect
    .poll(() =>
      g.evaluate(([x, y, z]) => window.__mc.getBlock(x, y, z), [torch.x, torch.y, torch.z]),
    )
    .toBe(TORCH);
  expect(await have(g, TORCH)).toBe(0);
  // Look down at the stone, the pickaxe in the hand, and hold the button.
  await guestSelect(g, STONE_PICKAXE);
  await setPose(g, { pitch: -45 * (Math.PI / 180) });
  expect((await state(g)).target).toMatchObject(stone);
  await g.mouse.move(480, 270);
  await g.mouse.down();
  // Stone with a stone pickaxe: 0.75 s, plus the round trip.
  await stepPaced(g, 75);
  await g.mouse.up();
  for (const page of [host.page, g]) {
    await expect
      .poll(() =>
        page.evaluate(
          ([a, b]) => [window.__mc.getBlock(a.x, a.y, a.z), window.__mc.getBlock(b.x, b.y, b.z)],
          [stone, torch] as const,
        ),
      )
      .toEqual([AIR, AIR]);
  }
  await expect.poll(() => have(g, TORCH)).toBe(1);
  expect(await have(g, STONE)).toBe(1);
  expect(await have(host.page, TORCH)).toBe(0);
  expect(await g.evaluate(() => window.__mc.verifyLight())).toBe(0);
});

test('Phase 6 AC9.9: a guest cannot fly in a Gathering world, by key or touch button', async ({
  players,
}) => {
  const host = await openTestPlayer(players, { query: { mode: 'gathering' } });
  const keys = await openTestPlayer(players);
  const touch = await openTestPlayer(players, { touch: true, query: { touch: '1' } });
  // In its own Creative world the touch player has the fly button.
  await expect(touch.page.locator('.touch-hud .touch-fly')).toHaveCount(1);
  const code = await hostRoom(host.page);
  await joinRoom(keys.page, code);
  await joinRoom(touch.page, code);
  await keys.page.keyboard.press('KeyF');
  await keys.page.evaluate(() => window.__mc.step(5));
  expect((await state(keys.page)).player.mode).toBe('walk');
  // The touch guest has no fly button in the host's Gathering world.
  expect((await state(touch.page)).mode).toBe('gathering');
  await expect(touch.page.locator('.touch-hud')).toBeVisible();
  await expect(touch.page.locator('.touch-hud .touch-fly')).toHaveCount(0);
  expect((await state(touch.page)).player.mode).toBe('walk');
});
