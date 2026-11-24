// Shared progress in an Adventure room (Phase 8 part A2): a guest finishes a task with real
// input; both players see the notice with the guest's name, the Tasks tab and their XP.
import type { Page } from '@playwright/test';
import {
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

const STONE = 3;
const LOG = 5;
const PLATFORM_Y = 110;
const LOG_TASK = 1;
/** "Mine 32 logs": its goal and XP (`src/progress/tables.ts`). */
const LOG_GOAL = 32;
const LOG_XP = 10;

function state(page: Page) {
  return page.evaluate(() => window.__mc.getState());
}

async function setPose(
  page: Page,
  pose: { x: number; y: number; z: number; yaw: number; pitch: number },
): Promise<void> {
  await page.evaluate(async (p) => {
    window.__mc.setPlayer(p);
    await window.__mc.whenIdle();
  }, pose);
}

async function openTasks(page: Page): Promise<void> {
  if (!(await state(page)).ui.screen.startsWith('inventory')) await page.keyboard.press('KeyE');
  await page.locator('.inventory-tab[data-tab="tasks"]').click();
  await expect.poll(async () => (await state(page)).ui.tab).toBe('tasks');
}

test('Phase 8 AC8.4: a guest mines the last log of "Mine 32 logs"; both see the notice, the Tasks tab and their XP rise', async ({
  players,
}) => {
  const host = await openTestPlayer(players, {
    query: { mode: 'gathering', progress: 'fresh' },
  });
  const guest = await openTestPlayer(players, { query: { name: 'Anna' } });
  // One log short of the goal; nobody has XP yet.
  await host.page.evaluate(
    ([task, count]) => window.__mc.setProgress({ counts: [{ task, count }] }),
    [LOG_TASK, LOG_GOAL - 1],
  );
  const code = await hostRoom(host.page);
  await joinRoom(guest.page, code);
  const name = (await netOf(guest.page)).players.find((p) => p.self)?.name;
  expect(name).toBe('Anna');
  // The guest's own page knows the room's book from the welcome: no `progress=all` for it.
  const before = await state(guest.page);
  expect(before.mode).toBe('gathering');
  expect(before.progress).toMatchObject({ level: 1, xp: 0, chapter: 1 });
  expect(before.progress?.tasks[0]).toMatchObject({ id: LOG_TASK, count: LOG_GOAL - 1 });
  expect((await state(host.page)).progress?.xp).toBe(0);

  // Both look at the Tasks tab while it happens.
  await openTasks(host.page);
  await openTasks(guest.page);
  for (const page of [host.page, guest.page]) {
    await expect(page.locator('.tasks-tab .tasks-xp-text')).toHaveText('0 / 50 XP');
    await expect(page.locator('.tasks-tab .task-row').first()).toContainText(
      `Mine 32 logs${LOG_GOAL - 1} / ${LOG_GOAL}`,
    );
  }

  // A stone platform high up with a log in front of the guest; the host stands aside.
  const { player } = await state(host.page);
  const px = Math.floor(player.x);
  const pz = Math.floor(player.z);
  await host.page.evaluate(
    ([x0, y, z0, stone, log]) => {
      for (let z = z0 - 4; z <= z0 + 2; z++) {
        for (let x = x0 - 3; x <= x0 + 3; x++) window.__mc.setBlock(x, y, z, stone);
      }
      window.__mc.setBlock(x0, y + 2, z0 - 1, log);
    },
    [px, PLATFORM_Y, pz, STONE, LOG],
  );
  await expect
    .poll(() =>
      guest.page.evaluate(
        ([x, y, z]) => window.__mc.getBlock(x, y, z),
        [px, PLATFORM_Y + 2, pz - 1],
      ),
    )
    .toBe(LOG);
  await setPose(host.page, { x: px + 2.5, y: PLATFORM_Y + 1, z: pz + 0.5, yaw: 0, pitch: 0 });
  await setPose(guest.page, { x: px + 0.5, y: PLATFORM_Y + 1, z: pz + 0.5, yaw: 0, pitch: 0 });

  // Real input on the guest: close the inventory, hold the button for the 2 s of a log by
  // hand (paced: the host measures on its own clock), open the Tasks tab again.
  await guest.page.keyboard.press('KeyE');
  await expect.poll(async () => (await state(guest.page)).ui.screen).toBe('play');
  await guest.page.mouse.move(480, 270);
  await guest.page.mouse.down();
  await stepPaced(guest.page, 150);
  await guest.page.mouse.up();
  await expect.poll(async () => (await state(host.page)).progress?.done).toContain(LOG_TASK);

  const line = `Task done: Mine 32 logs (Anna) · +${LOG_XP} XP`;
  for (const page of [host.page, guest.page]) {
    await expect.poll(async () => (await state(page)).progress?.notice).toBe(line);
    await expect(page.locator('.progress-notice')).toHaveText(line);
    await expect.poll(async () => (await state(page)).progress?.xp).toBe(LOG_XP);
    expect((await state(page)).progress?.tasks[0]).toMatchObject({ id: LOG_TASK, done: true });
  }
  // The host's tab stayed open and updated; the guest's is opened again.
  await openTasks(guest.page);
  for (const page of [host.page, guest.page]) {
    await expect(page.locator('.tasks-tab .tasks-xp-text')).toHaveText(`${LOG_XP} / 50 XP`);
    await expect(page.locator('.tasks-tab .task-row').first().locator('.task-status')).toHaveText(
      '✓',
    );
  }
  // The guest's XP lives in the host's record of it; the room's book is the same on both.
  expect((await state(guest.page)).progress?.done).toEqual([LOG_TASK]);
  await untilNet(host.page, (n) => n.players.length === 2);
  expect(await host.page.evaluate(() => window.__mc.verifyLight())).toBe(0);
  expect(await guest.page.evaluate(() => window.__mc.verifyLight())).toBe(0);
});
