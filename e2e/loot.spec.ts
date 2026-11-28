// Phase 8 part B3b: loot chests in a generator 4 world: the spawn shaft's chest opened with
// real input, emptied and still empty after a reload; the chamber reference.
import { expect, test } from './fixtures';
import { chestSlot, faceCell, getChest, screen, spawnLoot } from './chests';
import { clickCenter, getBlock, getState, inventory, openGame, step, whenIdle } from './game';
import { shaftChamberCell } from '../src/world/generation/shafts';
import { getTerrain } from '../src/world/generation/terrain';
import type { TerrainV4 } from '../src/world/generation/terrainV4';

const CHEST = 20;
const GEN4 = { version: 4, options: { terrain: 'balanced', trees: 'few' } } as const;

test('Phase 8B3b AC7.2 AC2.1: real input opens the spawn chest, quick moves one stack, takes all; empty after a reload', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await openGame(page, { mode: 'gathering', gen: 4, save: true, world: 'Loot' });
  expect((await getState(page)).world?.generatorVersion).toBe(4);
  const { chest, stand } = await spawnLoot(page);
  await faceCell(page, stand, chest);
  expect(await getBlock(page, chest.x, chest.y, chest.z)).toBe(CHEST);
  expect((await getState(page)).target).toMatchObject({ ...chest, id: CHEST });
  // Untouched: the derived starter loot, which is stored nowhere.
  const loot = await getChest(page, chest.x, chest.y, chest.z);
  const terrain = getTerrain(1337, GEN4) as TerrainV4;
  expect(loot).toEqual(terrain.lootAt(chest.x, chest.y, chest.z)?.slots);
  const filled = (loot ?? []).flatMap((s, i) => (s ? [i] : []));
  expect(filled.length).toBeGreaterThanOrEqual(3);
  expect((await getState(page)).world?.chests).toBe(0);

  await clickCenter(page, 'right');
  await step(page, 1);
  expect(await screen(page)).toBe('chest');
  // A double click quick moves the first stack into the inventory.
  const first = filled[0];
  const firstItem = loot?.[first]?.item ?? 0;
  await chestSlot(page, 'chest', first).dblclick();
  await whenIdle(page);
  const after = await getChest(page, chest.x, chest.y, chest.z);
  expect(after?.[first]).toBeNull();
  expect((await inventory(page)).some((s) => s?.item === firstItem)).toBe(true);
  expect((await getState(page)).world?.chests).toBe(1);
  await page.locator('.chest-take-all').click();
  await whenIdle(page);
  expect(await getChest(page, chest.x, chest.y, chest.z)).toEqual(new Array(27).fill(null));
  await page.keyboard.press('Escape');
  expect(await screen(page)).toBe('play');

  await page.evaluate(() => window.__mc.save());
  await page.reload();
  await page.waitForFunction(() => window.__mc !== undefined && window.__mc.isReady());
  await whenIdle(page);
  expect(await getBlock(page, chest.x, chest.y, chest.z)).toBe(CHEST);
  expect(await getChest(page, chest.x, chest.y, chest.z)).toEqual(new Array(27).fill(null));
  expect(await page.evaluate(() => window.__mc.verifyLight())).toBe(0);
});

test('Phase 8B3b AC7.2: matches the loot-chest reference (the chamber seen from the corner beside the landing)', async ({
  page,
}) => {
  await openGame(page, { mode: 'gathering', gen: 4 });
  const { chest } = await spawnLoot(page);
  const shaft = (getTerrain(1337, GEN4) as TerrainV4).shafts.spawnShaft();
  if (!shaft) throw new Error('no spawn shaft');
  // The landing (2, -2) looks at the chest across the log column; the corner (2, 2) beside
  // it sees the chest along the chamber's wall.
  const landing = shaftChamberCell(shaft);
  await faceCell(page, { x: landing.x, y: landing.y, z: shaft.z + 2 }, chest);
  const seen = (await getState(page)).target;
  expect(seen === null || seen.id === CHEST).toBe(true);
  await page.locator('.hud').evaluate((node) => {
    (node as HTMLElement).style.visibility = 'hidden';
  });
  await whenIdle(page);
  await expect(page).toHaveScreenshot('loot-chest.png');
});
