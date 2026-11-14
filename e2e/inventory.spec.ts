// Phase 3 step 6: game modes, the item bar and the inventory in the save file.
import { TOUCH_DEVICE, openTouchGame } from './touch';
import { expect, test } from './fixtures';
import {
  DEG,
  backToWorlds,
  createWorld,
  getBlock,
  getState,
  give,
  inventory,
  openGame,
  openMenu,
  pauseWithMouse,
  setPlayer,
  standOnPlatform,
  step,
  submit,
  untilPlaying,
  whenIdle,
} from './game';

const DIRT = 2;
const STONE = 3;
const SAND = 4;
const CLAY = 14;
const COAL = 256;

test('Phase 3 AC6.5: the form offers Gathering (preselected) and Creative; the mode is listed and survives a reload', async ({
  page,
}) => {
  test.setTimeout(180_000);
  await openMenu(page);
  const gathering = page.locator('.world-mode-button[data-mode="gathering"]');
  const creative = page.locator('.world-mode-button[data-mode="creative"]');
  await expect(gathering).toHaveText('Gathering');
  await expect(creative).toHaveText('Creative');
  await expect(gathering).toHaveAttribute('aria-checked', 'true');
  await expect(creative).toHaveAttribute('aria-checked', 'false');
  // Choosing switches the selection; back to the default for the first world.
  await creative.click();
  await expect(creative).toHaveAttribute('aria-checked', 'true');
  await expect(gathering).toHaveAttribute('aria-checked', 'false');
  await gathering.click();
  await page.locator('#world-name').fill('Gatherer');
  await page.locator('.world-create-button').click();
  await untilPlaying(page);
  expect((await getState(page)).mode).toBe('gathering');
  // A Gathering world starts with an empty bar.
  await expect(page.locator('.hotbar-slot canvas')).toHaveCount(0);

  await pauseWithMouse(page);
  // The controls list does not mention flying in a Gathering world.
  await expect(page.locator('.controls-list')).not.toContainText(/fly/i);
  await backToWorlds(page);
  await createWorld(page, { name: 'Builder', mode: 'creative' });
  expect((await getState(page)).mode).toBe('creative');
  await expect(page.locator('.hotbar-slot canvas')).toHaveCount(9);
  await pauseWithMouse(page);
  await expect(page.locator('.controls-list')).toContainText('Toggle fly mode');
  await backToWorlds(page);

  const modes = async (): Promise<Record<string, string>> => {
    const rows = await page
      .locator('.world-row')
      .evaluateAll((nodes) =>
        nodes.map((node) => [
          node.querySelector('.world-row-name')?.textContent ?? '',
          node.querySelector('.world-row-mode')?.textContent ?? '',
        ]),
      );
    return Object.fromEntries(rows) as Record<string, string>;
  };
  expect(await modes()).toEqual({ Gatherer: 'Gathering', Builder: 'Creative' });
  await page.reload();
  await page.locator('.world-list-view').waitFor();
  expect(await modes()).toEqual({ Gatherer: 'Gathering', Builder: 'Creative' });
  // The form opens with Gathering again, whatever was chosen last.
  await page.locator('.world-new-button').click();
  await expect(gathering).toHaveAttribute('aria-checked', 'true');
});

test('Phase 3 AC6.6: in Gathering the fly key and the test API leave the player walking', async ({
  page,
}) => {
  await openGame(page, { mode: 'gathering' });
  expect((await getState(page)).mode).toBe('gathering');
  await page.keyboard.press('KeyF');
  await step(page, 2);
  expect((await getState(page)).player.mode).toBe('walk');
  await setPlayer(page, { mode: 'fly' });
  expect((await getState(page)).player.mode).toBe('walk');
  // The player still falls: no hovering.
  const before = (await getState(page)).player;
  await setPlayer(page, { y: before.y + 6 });
  await step(page, 30);
  expect((await getState(page)).player.y).toBeLessThan(before.y + 5);

  // Creative, as before: both ways work.
  await openGame(page);
  await page.keyboard.press('KeyF');
  await step(page, 1);
  expect((await getState(page)).player.mode).toBe('fly');
  await setPlayer(page, { mode: 'walk' });
  expect((await getState(page)).player.mode).toBe('walk');
  await setPlayer(page, { mode: 'fly' });
  expect((await getState(page)).player.mode).toBe('fly');
});

test.describe('touch', () => {
  test.use(TOUCH_DEVICE);

  test('Phase 3 AC6.6: in Gathering no fly button is in the document', async ({ page }) => {
    await openTouchGame(page, { mode: 'gathering' });
    await expect(page.locator('.touch-up')).toBeVisible();
    await expect(page.locator('.touch-fly')).toHaveCount(0);
    await openTouchGame(page);
    await expect(page.locator('.touch-fly')).toBeVisible();
  });
});

test('Phase 3 AC6.7: the Gathering bar starts empty, shows icon and count, and placing uses items up', async ({
  page,
}) => {
  await openGame(page, { mode: 'gathering' });
  await expect(page.locator('.hotbar-slot')).toHaveCount(9);
  await expect(page.locator('.hotbar-slot canvas')).toHaveCount(0);
  await expect(page.locator('.slot-count')).toHaveCount(0);
  expect((await inventory(page)).every((slot) => slot === null)).toBe(true);

  const { px, pz } = await standOnPlatform(page);
  await setPlayer(page, { pitch: -40 * DEG });
  // Nothing in the hand: a right click places nothing.
  const target = (await getState(page)).target;
  expect(target).not.toBeNull();
  if (!target) return;
  const cell = [target.x + target.face[0], target.y + target.face[1], target.z + target.face[2]];
  await page.mouse.click(480, 270, { button: 'right' });
  await whenIdle(page);
  expect(await getBlock(page, cell[0], cell[1], cell[2])).toBe(0);

  await give(page, SAND, 3);
  await give(page, COAL, 1);
  const first = page.locator('.hotbar-slot[data-slot="1"]');
  const second = page.locator('.hotbar-slot[data-slot="2"]');
  await expect(first).toHaveAttribute('data-item', 'sand');
  await expect(first.locator('canvas')).toHaveCount(1);
  await expect(first.locator('.slot-count')).toHaveText('3');
  // One item shows no number.
  await expect(second).toHaveAttribute('data-item', 'coal');
  await expect(second.locator('canvas')).toHaveCount(1);
  await expect(second.locator('.slot-count')).toHaveCount(0);

  // Each placed block takes one item; the tower grows towards the player's view.
  await page.mouse.click(480, 270, { button: 'right' });
  await whenIdle(page);
  expect(await getBlock(page, cell[0], cell[1], cell[2])).toBe(SAND);
  await expect(first.locator('.slot-count')).toHaveText('2');
  expect((await inventory(page))[0]).toEqual({ item: SAND, count: 2 });
  await page.mouse.click(480, 270, { button: 'right' });
  await whenIdle(page);
  await expect(first.locator('.slot-count')).toHaveCount(0);
  await expect(first.locator('canvas')).toHaveCount(1);
  await page.mouse.click(480, 270, { button: 'right' });
  await whenIdle(page);
  // The last item empties the slot.
  await expect(first.locator('canvas')).toHaveCount(0);
  await expect(first).toHaveAttribute('data-item', '');
  expect((await inventory(page))[0]).toBeNull();
  // A fourth click places nothing.
  const sandBefore = await countBlocks(page, px, pz, SAND);
  expect(sandBefore).toBe(3);
  await page.mouse.click(480, 270, { button: 'right' });
  await whenIdle(page);
  expect(await countBlocks(page, px, pz, SAND)).toBe(3);

  // Coal is no block: it cannot be placed and stays.
  await page.keyboard.press('Digit2');
  await expect(page.locator('.hotbar-label')).toHaveText('Coal');
  await page.mouse.click(480, 270, { button: 'right' });
  await whenIdle(page);
  expect((await inventory(page))[1]).toEqual({ item: COAL, count: 1 });
  // An empty slot announces no name.
  await page.keyboard.press('Digit5');
  await expect(page.locator('.hotbar-label')).toHaveText('');
});

/** Blocks of one kind in the box around the platform the player stands on. */
function countBlocks(
  page: import('@playwright/test').Page,
  px: number,
  pz: number,
  id: number,
): Promise<number> {
  return page.evaluate(
    ([x0, z0, wanted]) => {
      let count = 0;
      for (let y = 108; y <= 118; y++) {
        for (let z = z0 - 8; z <= z0 + 3; z++) {
          for (let x = x0 - 4; x <= x0 + 4; x++) {
            if (window.__mc.getBlock(x, y, z) === wanted) count++;
          }
        }
      }
      return count;
    },
    [px, pz, id],
  );
}

test('Phase 3 AC6.8: the inventory and the Creative bar survive a reload', async ({ page }) => {
  await openGame(page, { save: true, world: 'Bag', mode: 'gathering' });
  await give(page, DIRT, 150);
  await give(page, COAL, 7);
  await give(page, STONE, 1);
  expect(await submit(page, { kind: 'moveStack', from: 2, to: 30 })).toBe(true);
  expect(await submit(page, { kind: 'selectSlot', slot: 3 })).toBe(true);
  const before = await inventory(page);
  expect(before[0]).toEqual({ item: DIRT, count: 99 });
  expect(before[1]).toEqual({ item: DIRT, count: 51 });
  expect(before[2]).toBeNull();
  expect(before[30]).toEqual({ item: COAL, count: 7 });
  expect(before[3]).toEqual({ item: STONE, count: 1 });

  // A Creative world in the same store, with a changed bar.
  await page.evaluate(() => window.__mc.openWorld('Paint', 7, 'creative'));
  await page.waitForFunction(() => window.__mc.isReady());
  expect(await submit(page, { kind: 'setBarSlot', slot: 0, item: CLAY })).toBe(true);
  expect(await submit(page, { kind: 'moveStack', from: 8, to: 1 })).toBe(true);
  expect(await submit(page, { kind: 'discard', slot: 4 })).toBe(true);
  // Slot 0 from the palette, slots 1 and 8 swapped, slot 4 emptied.
  const creativeBar = (await inventory(page)).slice(0, 9);
  expect(creativeBar.map((slot) => slot?.item ?? 0)).toEqual([CLAY, 9, 3, 4, 0, 6, 7, 8, 2]);
  await page.evaluate(() => window.__mc.save());

  await openGame(page, { save: true, world: 'Bag', mode: 'creative' });
  const state = await getState(page);
  // The stored mode wins over the parameter.
  expect(state.mode).toBe('gathering');
  expect(state.inventory.slots).toEqual(before);
  expect(state.inventory.selected).toBe(3);
  await expect(page.locator('.hotbar-slot[data-slot="1"] .slot-count')).toHaveText('99');
  await expect(page.locator('.hotbar-slot.selected')).toHaveAttribute('data-item', 'stone');

  await openGame(page, { save: true, world: 'Paint' });
  const paint = await getState(page);
  expect(paint.mode).toBe('creative');
  expect(paint.inventory.slots.slice(0, 9)).toEqual(creativeBar);
  await expect(page.locator('.hotbar-slot[data-slot="1"]')).toHaveAttribute('data-item', 'clay');
  await expect(page.locator('.slot-count')).toHaveCount(0);
});

// Written by the game as of Phase 3 part A (the same records as in saveFormat.test.ts).
const PART_A_META = {
  id: 'wparta-fixture1',
  name: 'Part A world',
  seed: 1337,
  mode: 'creative',
  generatorVersion: 1,
  formatVersion: 1,
  createdMs: 1780000000000,
  playedMs: 1780000360000,
  time: 0.31,
  pose: { x: 8.5, y: 71, z: -3.25, yaw: 0.5, pitch: -0.25 },
  moveMode: 'fly',
  player: {
    slots: [
      ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map((item) => ({ item, count: 1 })),
      ...Array.from({ length: 27 }, () => null),
    ],
    selectedSlot: 7,
    breaking: null,
  },
};
const PART_A_CHUNK = {
  key: 'wparta-fixture1|0,-1',
  worldId: 'wparta-fixture1',
  cx: 0,
  cz: -1,
  edits: [100, 8, 2000, 0],
};

test('Phase 3 AC6.9: a world saved by Part A opens as a Creative world with the Phase 1 bar', async ({
  page,
}) => {
  // Any stored world creates the database; then the old records are written into it.
  await openGame(page, { save: true, world: 'Other' });
  await page.evaluate(
    ([meta, chunk]) =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('markuscraft');
        open.onerror = () => reject(new Error('open failed'));
        open.onsuccess = () => {
          const tx = open.result.transaction(['worlds', 'chunks'], 'readwrite');
          tx.objectStore('worlds').put(meta);
          tx.objectStore('chunks').put(chunk);
          tx.oncomplete = () => {
            open.result.close();
            resolve();
          };
          tx.onerror = () => reject(new Error('write failed'));
        };
      }),
    [PART_A_META, PART_A_CHUNK] as const,
  );
  await openGame(page, { save: true, world: 'Part A world', mode: 'gathering' });
  const state = await getState(page);
  expect(state.world?.id).toBe('wparta-fixture1');
  expect(state.mode).toBe('creative');
  expect(state.seed).toBe(1337);
  expect(state.player.mode).toBe('fly');
  expect(state.player.x).toBeCloseTo(8.5, 5);
  expect(state.player.y).toBeCloseTo(71, 5);
  expect(state.selectedSlot).toBe(8);
  expect(state.inventory.slots.slice(0, 9).map((slot) => slot?.item)).toEqual([
    1, 2, 3, 4, 5, 6, 7, 8, 9,
  ]);
  expect(state.inventory.slots.slice(9).every((slot) => slot === null)).toBe(true);
  await expect(page.locator('.hotbar-slot canvas')).toHaveCount(9);
  await expect(page.locator('.hotbar-slot.selected')).toHaveAttribute('data-item', 'bricks');
  // Its edits are there: block index 100 of chunk (0, -1) became bricks.
  const edited = await page.evaluate(() => {
    const found: number[] = [];
    for (let y = 0; y < 128 && found.length === 0; y++) {
      for (let z = -16; z < 0; z++) {
        for (let x = 0; x < 16; x++) {
          if (window.__mc.getBlock(x, y, z) === 8) found.push(x, y, z);
        }
      }
    }
    return found;
  });
  expect(edited.length).toBe(3);
});
