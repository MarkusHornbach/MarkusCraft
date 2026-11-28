// Phase 8 part B3a2: the chest screen in a room: "Also open" on both screens, a move by one
// player shows on the other's screen at once, and a chest broken by the other player
// closes the screen (AC5.6, AC5.5).
import type { Page } from '@playwright/test';
import { expect, hostRoom, joinRoom, openTestPlayer, test, untilNet } from './multiplayer';

test.setTimeout(180_000);

const STONE = 3;
const CHEST = 20;

interface Cell {
  x: number;
  y: number;
  z: number;
}

async function standBeside(page: Page, c: Cell, dx: number): Promise<void> {
  await page.evaluate(
    async ([x, y, z]) => {
      window.__mc.setPlayer({ x, y, z, yaw: 0, pitch: 0, mode: 'fly' });
      await window.__mc.whenIdle();
    },
    [c.x + 0.5 + dx, c.y, c.z + 0.5],
  );
}

function open(page: Page, c: Cell): Promise<boolean | undefined> {
  return page.evaluate((cell) => window.__mc.submit({ kind: 'openChest', ...cell })?.ok, c);
}

function viewers(page: Page): Promise<string[] | null> {
  return page.evaluate(() => window.__mc.getState().ui.chest?.viewers ?? null);
}

test('Phase 8B3a AC5.6 AC5.5: "Also open" on both screens, live moves, a broken chest closes the screen', async ({
  players,
}) => {
  const host = await openTestPlayer(players, { query: { name: 'Anna' } });
  const guest = await openTestPlayer(players, { query: { name: 'Ben' } });
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
  await untilNet(host.page, (net) =>
    net.players.some((p) => !p.self && Math.abs(p.x - (chest.x + 2.5)) < 0.01),
  );

  // The host opens first: nobody else yet.
  expect(await open(host.page, chest)).toBe(true);
  await expect(host.page.locator('.chest-screen')).toBeVisible();
  expect(await viewers(host.page)).toEqual([]);
  await expect(host.page.locator('.chest-viewers')).toBeHidden();
  // The guest opens the same chest: both screens name the other.
  await guest.page.evaluate((cell) => window.__mc.submit({ kind: 'openChest', ...cell }), chest);
  await expect.poll(() => viewers(guest.page)).toEqual(['Anna']);
  await expect.poll(() => viewers(host.page)).toEqual(['Ben']);
  await expect(host.page.locator('.chest-viewers')).toHaveText('Also open: Ben');
  await expect(guest.page.locator('.chest-viewers')).toHaveText('Also open: Anna');

  // The guest moves its stone in by clicks: the host's screen shows it at once.
  await guest.page.locator('.chest-slot[data-side="player"][data-item="stone"]').first().click();
  await guest.page.locator('.chest-slot[data-side="chest"][data-index="6"]').click();
  await expect(host.page.locator('.chest-slot[data-side="chest"][data-index="6"]')).toHaveAttribute(
    'data-item',
    'stone',
  );
  await expect(host.page.locator('.chest-slot[data-side="chest"][data-index="6"]')).toHaveAttribute(
    'aria-label',
    'Chest slot 7: Stone',
  );

  // The guest closes: the host's line goes.
  await guest.page.keyboard.press('Escape');
  await expect.poll(() => guest.page.evaluate(() => window.__mc.getState().ui.screen)).toBe('play');
  await expect.poll(() => viewers(host.page)).toEqual([]);
  await expect(host.page.locator('.chest-viewers')).toBeHidden();

  // The guest takes its stone back and breaks the empty chest: the host's screen closes.
  await guest.page.evaluate((cell) => window.__mc.submit({ kind: 'takeAll', ...cell }), chest);
  await expect
    .poll(() =>
      host.page.evaluate(
        ([x, y, z]) => window.__mc.getChest(x, y, z)?.[6] ?? null,
        [chest.x, chest.y, chest.z],
      ),
    )
    .toBeNull();
  await guest.page.evaluate((cell) => window.__mc.submit({ kind: 'break', ...cell }), chest);
  await expect
    .poll(async () => {
      await host.page.evaluate(() => window.__mc.step(1));
      return host.page.evaluate(() => window.__mc.getState().ui.screen);
    })
    .toBe('play');
  await expect(host.page.locator('.chest-screen')).toBeHidden();
  expect(
    (await guest.page.evaluate(() => window.__mc.getState())).inventory.slots.some(
      (s) => s?.item === STONE,
    ),
  ).toBe(true);
  expect(await host.page.evaluate(() => window.__mc.verifyLight())).toBe(0);
});
