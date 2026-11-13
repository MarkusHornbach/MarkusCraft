// Saving and loading worlds in the browser (Phase 3 step 3).
import type { Page } from '@playwright/test';
import { test, expect } from './fixtures';
import { DEG, getBlock, getState, openGame, setBlock, setPlayer, step, surfaceY } from './game';

const AIR = 0;
const BRICKS = 8;
const GLASS = 9;

function save(page: Page): Promise<void> {
  return page.evaluate(() => window.__mc.save());
}

async function openWorld(page: Page, name: string, seed: number): Promise<void> {
  await page.evaluate(
    async ([n, s]) => {
      await window.__mc.openWorld(n as string, s as number);
      await window.__mc.whenIdle();
    },
    [name, seed],
  );
}

interface ChromeMemory {
  usedJSHeapSize: number;
}

test('a saved world comes back after a reload: blocks, pose, time, slot (Phase 3 AC3.6)', async ({
  page,
}) => {
  await openGame(page, { save: true });
  const start = await getState(page);
  expect(start.world).toMatchObject({ name: 'Test', generatorVersion: 1 });
  expect(start.mode).toBe('creative');
  const x = Math.floor(start.player.x) + 2;
  const z = Math.floor(start.player.z) - 3;
  const ground = await surfaceY(page, x, z);

  // Break one block and place one through the action layer, set others directly.
  await setPlayer(page, { x: x + 0.5, y: ground + 1, z: z + 1.5, yaw: 0, pitch: -60 * DEG });
  const target = (await getState(page)).target;
  expect(target).not.toBeNull();
  if (!target) return;
  await page.mouse.click(480, 270);
  expect(await getBlock(page, target.x, target.y, target.z)).toBe(AIR);
  await page.keyboard.press('Digit8');
  await page.mouse.click(480, 270, { button: 'right' });
  const placed = await page.evaluate(() => window.__mc.getState().target);
  expect(placed?.id).toBe(BRICKS);
  await setBlock(page, x + 3, ground + 5, z, GLASS);
  // An edit 320 blocks from the start point, in a chunk that is not loaded.
  const far = { x: x + 320, y: 90, z: z + 7 };
  await page.evaluate(
    ([fx, fy, fz, id]) => window.__mc.setBlock(fx, fy, fz, id),
    [far.x, far.y, far.z, BRICKS],
  );

  await setPlayer(page, {
    x: x + 5.25,
    y: ground + 12.5,
    z: z - 1.75,
    yaw: 2.5,
    pitch: -0.4,
    mode: 'fly',
  });
  await page.evaluate(() => window.__mc.setTime(0.6));
  await page.keyboard.press('Digit4');
  const before = await getState(page);
  expect(before.save.dirty).toBe(true);
  await save(page);
  expect((await getState(page)).save).toMatchObject({ dirty: false, lastError: null });

  await page.reload();
  await page.waitForFunction(() => window.__mc !== undefined && window.__mc.isReady());
  const after = await getState(page);
  expect(after.world).toEqual(before.world);
  expect(after.seed).toBe(before.seed);
  expect(Math.abs(after.player.x - before.player.x)).toBeLessThan(0.01);
  expect(Math.abs(after.player.y - before.player.y)).toBeLessThan(0.01);
  expect(Math.abs(after.player.z - before.player.z)).toBeLessThan(0.01);
  expect(Math.abs(after.player.yaw - before.player.yaw)).toBeLessThan(0.01);
  expect(Math.abs(after.player.pitch - before.player.pitch)).toBeLessThan(0.01);
  expect(after.player.mode).toBe('fly');
  expect(after.time).toBeCloseTo(0.6, 5);
  expect(after.selectedSlot).toBe(4);
  expect(after.inventory.selected).toBe(3);
  if (!placed) return;
  expect(await getBlock(page, placed.x, placed.y, placed.z)).toBe(BRICKS);
  // The broken block is still gone, unless the bricks went into its very cell.
  const sameCell = placed.x === target.x && placed.y === target.y && placed.z === target.z;
  expect(await getBlock(page, target.x, target.y, target.z)).toBe(sameCell ? BRICKS : AIR);
  expect(await getBlock(page, x + 3, ground + 5, z)).toBe(GLASS);
  await setPlayer(page, { x: far.x + 0.5, z: far.z + 0.5 });
  expect(await getBlock(page, far.x, far.y, far.z)).toBe(BRICKS);
});

test('an edit is saved by itself within 8 seconds (Phase 3 AC3.7)', async ({ page }) => {
  await openGame(page, { save: true });
  const { player } = await getState(page);
  const x = Math.floor(player.x) + 1;
  const z = Math.floor(player.z) + 1;
  const y = (await surfaceY(page, x, z)) + 4;
  // Wait until the writes of the start (the new world's record) are through.
  await save(page);
  await setBlock(page, x, y, z, BRICKS);
  expect((await getState(page)).save.dirty).toBe(true);
  await page.waitForFunction(() => !window.__mc.getState().save.dirty, null, { timeout: 8000 });
  expect((await getState(page)).save.lastError).toBeNull();

  await page.reload();
  await page.waitForFunction(() => window.__mc !== undefined && window.__mc.isReady());
  expect(await getBlock(page, x, y, z)).toBe(BRICKS);
});

test('two worlds in one browser keep their edits apart (Phase 3 AC3.8)', async ({ page }) => {
  await openGame(page, { save: true, world: 'First' });
  const first = await getState(page);
  const x = Math.floor(first.player.x) + 1;
  const z = Math.floor(first.player.z) + 1;
  await setBlock(page, x, 100, z, BRICKS);
  await save(page);

  await openGame(page, { save: true, world: 'Second', seed: 7 });
  const second = await getState(page);
  expect(second.world?.name).toBe('Second');
  expect(second.world?.id).not.toBe(first.world?.id);
  expect(second.seed).toBe(7);
  expect(await getBlock(page, x, 100, z)).toBe(AIR);
  await setBlock(page, x, 101, z, GLASS);
  await save(page);

  // The seed in the URL does not matter for a world that exists.
  await openGame(page, { save: true, world: 'First', seed: 99 });
  const again = await getState(page);
  expect(again.world).toEqual(first.world);
  expect(again.seed).toBe(first.seed);
  expect(await getBlock(page, x, 100, z)).toBe(BRICKS);
  expect(await getBlock(page, x, 101, z)).toBe(AIR);
});

test('switching worlds in place frees the old world (Phase 3 AC3.9)', async ({ page }) => {
  test.setTimeout(240_000);
  await openGame(page, { save: true, world: 'A' });
  const fresh = await getState(page);
  const marker = { x: Math.floor(fresh.player.x), y: 100, z: Math.floor(fresh.player.z) };
  await setBlock(page, marker.x, marker.y, marker.z, BRICKS);
  const heapBefore = await page.evaluate(
    () => (performance as unknown as { memory?: ChromeMemory }).memory?.usedJSHeapSize ?? null,
  );

  await openWorld(page, 'B', 4242);
  const other = await getState(page);
  expect(other.world?.name).toBe('B');
  expect(other.seed).toBe(4242);
  expect(other.chunks.loaded).toBe(81);
  expect(other.chunks.pending).toBe(0);
  expect(other.chunks.generated).toBe(121);
  expect(await getBlock(page, marker.x, marker.y, marker.z)).toBe(AIR);

  for (let i = 0; i < 9; i++) await openWorld(page, i % 2 === 0 ? 'A' : 'B', 4242);
  // Ten switches later world A is open again, as it was.
  const back = await getState(page);
  expect(back.world).toEqual(fresh.world);
  expect(back.chunks.loaded).toBe(81);
  expect(back.chunks.meshed).toBe(81);
  expect(back.render.geometries).toBeLessThanOrEqual(fresh.render.geometries * 1.1);
  expect(await getBlock(page, marker.x, marker.y, marker.z)).toBe(BRICKS);
  const heapAfter = await page.evaluate(
    () => (performance as unknown as { memory?: ChromeMemory }).memory?.usedJSHeapSize ?? null,
  );
  if (heapBefore !== null && heapAfter !== null) {
    expect(heapAfter - heapBefore).toBeLessThan(30 * 1024 * 1024);
  }
});

test('test mode without save=1 leaves no database behind (Phase 3 AC3.10)', async ({ page }) => {
  await openGame(page);
  const { player } = await getState(page);
  await setBlock(page, Math.floor(player.x), 100, Math.floor(player.z), BRICKS);
  await page.mouse.click(480, 270);
  await step(page, 30);
  await save(page);
  const state = await getState(page);
  expect(state.save).toMatchObject({ dirty: false, lastError: null });
  expect(state.world?.name).toBe('Test');
  expect(await page.evaluate(async () => (await indexedDB.databases()).map((d) => d.name))).toEqual(
    [],
  );
});

test('a world with 50 000 edits saves in under 2 s and loads in under 3 s (Phase 3 AC3.11)', async ({
  page,
}) => {
  await openGame(page, { save: true });
  await save(page);
  // 250 edits in each of 200 chunks far from the player, so no mesh is rebuilt.
  const count = await page.evaluate(() => {
    const mc = window.__mc;
    let n = 0;
    for (let c = 0; c < 200; c++) {
      const x0 = 4000 + (c % 20) * 16;
      const z0 = 4000 + Math.floor(c / 20) * 16;
      for (let i = 0; i < 250; i++) {
        mc.setBlock(x0 + (i % 16), 60 + Math.floor(i / 16), z0 + ((i * 7) % 16), 1 + (i % 9));
        n++;
      }
    }
    return n;
  });
  expect(count).toBe(50_000);
  await save(page);
  const saved = await getState(page);
  expect(saved.save.lastError).toBeNull();
  expect(saved.save.lastSaveMs).toBeGreaterThan(0);
  expect(saved.save.lastSaveMs).toBeLessThan(2000);

  await page.reload();
  await page.waitForFunction(() => window.__mc !== undefined && window.__mc.isReady());
  const loaded = await getState(page);
  expect(loaded.save.lastLoadMs).toBeGreaterThan(0);
  expect(loaded.save.lastLoadMs).toBeLessThan(3000);
  await setPlayer(page, { x: 4000.5, y: 120, z: 4000.5, mode: 'fly' });
  // The first and the last edit of the first chunk.
  expect(await getBlock(page, 4000, 60, 4000)).toBe(1);
  expect(await getBlock(page, 4000 + (249 % 16), 60 + 15, 4000 + ((249 * 7) % 16))).toBe(
    1 + (249 % 9),
  );
});
