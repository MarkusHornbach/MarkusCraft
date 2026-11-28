// Polishing session 1: the rows of the recipe list never move. Helpers that walk the list
// through states that once changed a row's height, in test mode and in the real loop.
import type { Page } from '@playwright/test';
import { expect } from './fixtures';
import { getState } from './game';

const STONE = 3;
const LOG = 5;
const PLANKS = 7;
const FURNACE = 16;
const STICK = 257;
const STACK = 99;
const SLOTS = 36;

/** Where a row lies, relative to the top of the list (the list scrolled to the top). */
export interface RowRect {
  name: string;
  top: number;
  height: number;
}

/** All rows of the list, the list scrolled to the top first; also what overflows. */
async function measure(page: Page): Promise<{ rows: RowRect[]; overflow: string[] }> {
  return page.evaluate(() => {
    const list = document.querySelector<HTMLElement>('.recipe-list');
    if (!list) throw new Error('no recipe list');
    list.scrollTop = 0;
    const top = list.getBoundingClientRect().top;
    const rows = [...list.querySelectorAll<HTMLElement>('.recipe-row')].map((node) => {
      const r = node.getBoundingClientRect();
      return { name: node.dataset.recipe ?? '', top: r.top - top, height: r.height };
    });
    const overflow = [
      ...list.querySelectorAll<HTMLElement>(
        '.recipe-row, .recipe-name, .recipe-ingredients, .recipe-action',
      ),
    ]
      .filter(
        (node) =>
          node.scrollWidth > node.clientWidth + 1 || node.scrollHeight > node.clientHeight + 1,
      )
      .map(
        (node) =>
          `${node.className} in ${node.closest<HTMLElement>('.recipe-row')?.dataset.recipe}`,
      );
    return { rows, overflow };
  });
}

/** Names of the recipes that can be made now. */
async function craftableNow(page: Page): Promise<string[]> {
  return (await getState(page)).recipes.filter((r) => r.craftable).map((r) => r.name);
}

/** Activates a row's "Craft" button without scrolling the list to it. */
async function pressCraft(page: Page, recipe: string): Promise<void> {
  await page.locator(`.recipe-row[data-recipe="${recipe}"] .recipe-craft`).dispatchEvent('click');
}

/**
 * Walks the open "Crafting" tab through the states of Polish 1 AC1.3 and checks after each
 * one that every row has the same rectangle as at the start and nothing overflows.
 * Returns the row height. Works in test mode and in the real loop (nothing waits on steps).
 */
export async function expectRowsNeverMove(page: Page): Promise<number> {
  const first = await measure(page);
  expect(first.rows).toHaveLength(21);
  const height = first.rows[0].height;
  for (const row of first.rows) expect(row.height, row.name).toBeCloseTo(height, 0);

  const check = async (state: string): Promise<void> => {
    const now = await measure(page);
    expect(now.overflow, state).toEqual([]);
    now.rows.forEach((row, index) => {
      const before = first.rows[index];
      expect(row.name, state).toBe(before.name);
      expect(Math.abs(row.top - before.top), `${state}: top of ${row.name}`).toBeLessThanOrEqual(
        0.5,
      );
      expect(
        Math.abs(row.height - before.height),
        `${state}: height of ${row.name}`,
      ).toBeLessThanOrEqual(0.5);
    });
  };
  const give = (item: number, count: number): Promise<void> =>
    page.evaluate(([i, c]) => window.__mc.give(i, c), [item, count]);
  const clear = (): Promise<void> => page.evaluate(() => window.__mc.clearInventory());

  // Nothing can be made; the station recipes show their notes.
  await clear();
  await expect.poll(() => craftableNow(page)).toEqual([]);
  await expect(page.locator('.recipe-note:not([hidden])').first()).toBeVisible();
  await check('nothing craftable, station notes');

  // One log: the planks can be made.
  await give(LOG, 1);
  await expect.poll(() => craftableNow(page)).toEqual(['planks']);
  await check('planks craftable');

  // Crafting the last planks hides their button; sticks and workbench can be made now.
  await pressCraft(page, 'planks');
  await expect.poll(() => craftableNow(page)).toEqual(['sticks', 'workbench']);
  await expect(page.locator('.recipe-row[data-recipe="planks"] .recipe-craft')).toBeHidden();
  await check('after the last planks; sticks and workbench craftable');

  // "Inventory full" on the planks: two logs (one stays in its slot), the other 35 slots
  // full of stone.
  await clear();
  await give(LOG, 2);
  await give(STONE, STACK * (SLOTS - 1));
  await expect(page.locator('.recipe-row[data-recipe="planks"] .recipe-note')).toHaveText(
    'Inventory full',
  );
  await check('inventory full');

  // Ingredient counts of four digits in rows with two ingredients.
  await clear();
  await give(PLANKS, 2304);
  await give(STICK, 3);
  await expect(
    page.locator(
      '.recipe-row[data-recipe="wooden_pickaxe"] .recipe-ingredient[data-item="planks"]',
    ),
  ).toHaveText('2304 / 3');
  await check('four-digit counts');

  // A furnace nearby, and its bar running in the coal row. The furnace is set past the
  // action layer; giving the logs afterwards brings the list up to date with it.
  await page.evaluate((id) => {
    const { player } = window.__mc.getState();
    window.__mc.setBlock(
      Math.floor(player.x),
      Math.floor(player.y) + 1,
      Math.floor(player.z) + 2,
      id,
    );
  }, FURNACE);
  await clear();
  await give(LOG, 2);
  await expect.poll(async () => (await craftableNow(page)).includes('coal')).toBe(true);
  await pressCraft(page, 'coal');
  await expect(page.locator('.recipe-row[data-recipe="coal"] .recipe-progress')).toBeVisible();
  await expect(page.locator('.recipe-row[data-recipe="coal"] .recipe-note')).toBeHidden();
  await check('furnace bar running');

  // The furnace taken away while its bar runs: the station note and the bar would not fit
  // together, so the bar shows alone (in the real loop the bar may have ended by now).
  await page.evaluate(() => {
    const { player } = window.__mc.getState();
    window.__mc.setBlock(
      Math.floor(player.x),
      Math.floor(player.y) + 1,
      Math.floor(player.z) + 2,
      0,
    );
  });
  await give(STICK, 1);
  await expect.poll(async () => (await getState(page)).recipes[10].stationMissing).toBe(true);
  await check('furnace bar running, furnace out of reach');
  return height;
}

/**
 * The list shows five whole rows and part of the sixth (Polish 1 AC1.5): its height is not
 * a multiple of the row pitch, and at least 8 px of the sixth row show.
 */
export async function expectPartOfSixthRow(page: Page): Promise<void> {
  const { rows, listHeight } = await page.evaluate(() => {
    const list = document.querySelector<HTMLElement>('.recipe-list');
    if (!list) throw new Error('no recipe list');
    list.scrollTop = 0;
    const box = list.getBoundingClientRect();
    return {
      listHeight: list.clientHeight,
      rows: [...list.querySelectorAll('.recipe-row')].map((node) => {
        const r = node.getBoundingClientRect();
        return { top: r.top - box.top, bottom: r.bottom - box.top };
      }),
    };
  });
  for (const row of rows.slice(0, 5)) expect(row.bottom).toBeLessThanOrEqual(listHeight + 0.5);
  const sixth = rows[5];
  expect(sixth.top).toBeLessThanOrEqual(listHeight - 8);
  expect(sixth.bottom).toBeGreaterThan(listHeight + 8);
}
