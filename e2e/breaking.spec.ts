// Phase 3 step 7: timed breaking, drops, the progress display and pickup notices.
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import {
  DEG,
  PLATFORM_Y,
  getBlock,
  getState,
  give,
  inventory,
  openGame,
  setBlock,
  setPlayer,
  standOnPlatform,
  step,
  whenIdle,
} from './game';
import { capture, centerRegion, shareOf } from './helpers';
import { TOUCH_DEVICE, centerOf, openTouchGame } from './touch';

const AIR = 0;
const DIRT = 2;
const STONE = 3;
const SAND = 4;
const COAL_ORE = 12;
const COAL = 256;
const WOODEN_PICKAXE = 259;
/** Dirt takes 0.6 s by hand: 36 simulation steps. */
const DIRT_STEPS = 36;

/** A Gathering world; the player stands on a platform of `block`, looking at the cell ahead. */
async function onPlatform(page: Page, block = DIRT): Promise<{ px: number; pz: number }> {
  await openGame(page, { mode: 'gathering' });
  const at = await standOnPlatform(page, block);
  await setPlayer(page, { pitch: -50 * DEG });
  expect((await getState(page)).target).toMatchObject({ x: at.px, y: PLATFORM_Y, z: at.pz - 1 });
  return at;
}

async function hold(page: Page): Promise<void> {
  await page.mouse.move(480, 270);
  await page.mouse.down();
}

test('Phase 3 AC7.4: holding break on dirt removes it after 36 steps, yields one dirt, and goes on to the next block', async ({
  page,
}) => {
  const { px, pz } = await onPlatform(page);
  await hold(page);
  // The press itself breaks nothing.
  expect(await getBlock(page, px, PLATFORM_Y, pz - 1)).toBe(DIRT);
  expect((await getState(page)).breaking).toMatchObject({ x: px, y: PLATFORM_Y, z: pz - 1 });
  await step(page, 30);
  expect(await getBlock(page, px, PLATFORM_Y, pz - 1)).toBe(DIRT);
  expect((await inventory(page)).every((slot) => slot === null)).toBe(true);
  await step(page, DIRT_STEPS - 1 - 30);
  expect(await getBlock(page, px, PLATFORM_Y, pz - 1)).toBe(DIRT);
  await step(page, 2);
  expect(await getBlock(page, px, PLATFORM_Y, pz - 1)).toBe(AIR);
  expect((await inventory(page))[0]).toEqual({ item: DIRT, count: 1 });
  await expect(page.locator('.hotbar-slot[data-slot="1"]')).toHaveAttribute('data-item', 'dirt');

  // Still holding: the block behind it is next and takes its own 36 steps.
  expect(await getBlock(page, px, PLATFORM_Y, pz - 2)).toBe(DIRT);
  await step(page, 30);
  expect(await getBlock(page, px, PLATFORM_Y, pz - 2)).toBe(DIRT);
  await step(page, 8);
  expect(await getBlock(page, px, PLATFORM_Y, pz - 2)).toBe(AIR);
  expect((await inventory(page))[0]).toEqual({ item: DIRT, count: 2 });
  await page.mouse.up();
  // Released: nothing more breaks.
  const total = async (): Promise<number> =>
    (await inventory(page)).reduce((sum, slot) => sum + (slot?.count ?? 0), 0);
  await step(page, 80);
  expect(await total()).toBe(2);
});

test('Phase 3 AC7.4: coal ore takes 1.75 s with a wooden pickaxe and yields coal', async ({
  page,
}) => {
  const { px, pz } = await onPlatform(page, STONE);
  await setBlock(page, px, PLATFORM_Y, pz - 1, COAL_ORE);
  // Since Part C coal ore yields its coal only to a pickaxe; wood halves the 3.5 s.
  await give(page, WOODEN_PICKAXE, 1);
  await hold(page);
  await step(page, 100);
  expect(await getBlock(page, px, PLATFORM_Y, pz - 1)).toBe(COAL_ORE);
  await step(page, 6);
  expect(await getBlock(page, px, PLATFORM_Y, pz - 1)).toBe(AIR);
  await page.mouse.up();
  expect((await inventory(page))[1]).toEqual({ item: COAL, count: 1 });
  await expect(page.locator('.pickup-notice')).toHaveText('+1 Coal');
});

test('Phase 3 AC7.5: releasing and pressing again, or turning to another block, starts from zero', async ({
  page,
}) => {
  const { px, pz } = await onPlatform(page);
  await hold(page);
  await step(page, DIRT_STEPS / 2);
  expect((await getState(page)).breaking?.progress).toBeCloseTo(0.5, 2);
  await page.mouse.up();
  expect((await getState(page)).breaking).toBeNull();
  await step(page, 5);
  await hold(page);
  expect((await getState(page)).breaking?.progress).toBeCloseTo(0, 2);
  // Half the time again would have been enough had the first half counted.
  await step(page, 30);
  expect(await getBlock(page, px, PLATFORM_Y, pz - 1)).toBe(DIRT);
  await step(page, 6);
  expect(await getBlock(page, px, PLATFORM_Y, pz - 1)).toBe(AIR);
  await page.mouse.up();

  // Turning to another block while holding.
  await setPlayer(page, { yaw: -90 * DEG });
  const first = (await getState(page)).target;
  expect(first).toMatchObject({ x: px + 1, y: PLATFORM_Y, z: pz });
  await hold(page);
  await step(page, 24);
  await setPlayer(page, { yaw: 180 * DEG });
  const second = (await getState(page)).target;
  expect(second).toMatchObject({ x: px, y: PLATFORM_Y, z: pz + 1 });
  // Looking at the other block shows no progress of the first one.
  expect((await getState(page)).breaking).toBeNull();
  await step(page, 1);
  expect((await getState(page)).breaking).toMatchObject({ x: px, z: pz + 1 });
  expect((await getState(page)).breaking?.progress).toBeLessThan(0.05);
  await step(page, 24);
  // 24 + 25 steps in all, but neither block had its 36.
  expect(await getBlock(page, px + 1, PLATFORM_Y, pz)).toBe(DIRT);
  expect(await getBlock(page, px, PLATFORM_Y, pz + 1)).toBe(DIRT);
  // Turning back starts the first block from zero as well.
  await setPlayer(page, { yaw: -90 * DEG });
  await step(page, 30);
  expect(await getBlock(page, px + 1, PLATFORM_Y, pz)).toBe(DIRT);
  await step(page, 8);
  expect(await getBlock(page, px + 1, PLATFORM_Y, pz)).toBe(AIR);
  await page.mouse.up();

  // Selecting another slot starts over, too.
  await hold(page);
  await step(page, 24);
  await page.keyboard.press('Digit4');
  await step(page, 1);
  expect((await getState(page)).breaking?.progress).toBeLessThan(0.05);
  await page.mouse.up();
});

test('Phase 3 AC7.6: progress rises from 0 to 1, cracks grow in stages and vanish, the bar shows only while breaking', async ({
  page,
}) => {
  // Sand is bright: the dark cracks can be counted.
  const { px, pz } = await onPlatform(page, SAND);
  const bar = page.locator('.break-bar');
  await expect(bar).toBeHidden();
  const cracks = async (): Promise<number> => {
    await whenIdle(page);
    const image = await capture(page);
    return shareOf(image, (r, g, b) => r + g + b < 150, centerRegion(image, 0.4));
  };
  const clean = await cracks();
  expect(clean).toBeLessThan(0.01);

  await hold(page);
  await expect(bar).toBeVisible();
  const progress: number[] = [(await getState(page)).breaking?.progress ?? -1];
  const shares: number[] = [];
  // Stages 0 to 4 begin at steps 0, 8, 15, 22 and 29 of 36.
  for (const upTo of [4, 11, 18, 25, 33]) {
    while (progress.length - 1 < upTo) {
      await step(page, 1);
      progress.push((await getState(page)).breaking?.progress ?? -1);
    }
    shares.push(await cracks());
  }
  expect(progress[0]).toBeCloseTo(0, 3);
  for (let i = 1; i < progress.length; i++) expect(progress[i]).toBeGreaterThan(progress[i - 1]);
  expect(progress[progress.length - 1]).toBeGreaterThan(0.9);
  expect(progress[progress.length - 1]).toBeLessThan(1);
  // Every stage shows more cracks than the one before, and the first shows some.
  expect(shares[0]).toBeGreaterThan(clean + 0.002);
  for (let i = 1; i < shares.length; i++) expect(shares[i]).toBeGreaterThan(shares[i - 1] * 1.15);
  // The fill of the bar follows the progress.
  const width = await page
    .locator('.break-fill')
    .evaluate((node) => (node as HTMLElement).style.width);
  expect(width).toBe('92%');

  await step(page, 3);
  expect(await getBlock(page, px, PLATFORM_Y, pz - 1)).toBe(AIR);
  await page.mouse.up();
  await step(page, 1);
  expect((await getState(page)).breaking).toBeNull();
  await expect(bar).toBeHidden();
  // No cracks are left on the blocks around the hole.
  expect(await cracks()).toBeLessThan(shares[0]);
});

test('Phase 3 AC7.7: a notice "+1 Dirt" appears and counts up for a second block within 1.5 s', async ({
  page,
}) => {
  await onPlatform(page);
  const notice = page.locator('.pickup-notice');
  await expect(notice).toBeHidden();
  await hold(page);
  await step(page, DIRT_STEPS);
  await expect(notice).toBeVisible();
  await expect(notice).toHaveText('+1 Dirt');
  // The second block falls 37 steps later, well within the 90 steps of the notice.
  await step(page, DIRT_STEPS + 1);
  await expect(notice).toHaveText('+2 Dirt');
  await page.mouse.up();
  await step(page, 85);
  await expect(notice).toBeVisible();
  await step(page, 10);
  await expect(notice).toBeHidden();
  // Later pickups start counting at one again (another block: the two ahead are gone).
  await setPlayer(page, { yaw: -90 * DEG });
  await hold(page);
  await step(page, DIRT_STEPS + 1);
  await page.mouse.up();
  await expect(notice).toHaveText('+1 Dirt');
});

test('Phase 3 AC7.8: with a full inventory, holding break changes no block and shows "Inventory full"', async ({
  page,
}) => {
  const { px, pz } = await onPlatform(page);
  await give(page, STONE, 36 * 99);
  const slots = await inventory(page);
  expect(slots.every((slot) => slot?.item === STONE && slot.count === 99)).toBe(true);
  const message = page.locator('.hud-message');
  await expect(message).toBeHidden();
  await hold(page);
  await expect(message).toBeVisible();
  await expect(message).toHaveText('Inventory full');
  expect((await getState(page)).breaking).toBeNull();
  await expect(page.locator('.break-bar')).toBeHidden();
  await step(page, 120);
  expect(await getBlock(page, px, PLATFORM_Y, pz - 1)).toBe(DIRT);
  await expect(message).toBeVisible();
  expect(await inventory(page)).toEqual(slots);
  await page.mouse.up();
  // The hint leaves 1.5 s after the last try.
  await step(page, 95);
  await expect(message).toBeHidden();

  // With room in a stack of dirt the block can be broken again.
  await page.evaluate(() => window.__mc.submit({ kind: 'discard', slot: 20 }));
  await give(page, DIRT, 98);
  await hold(page);
  await step(page, DIRT_STEPS);
  await page.mouse.up();
  expect(await getBlock(page, px, PLATFORM_Y, pz - 1)).toBe(AIR);
  expect((await inventory(page))[20]).toEqual({ item: DIRT, count: 99 });
});

test('Phase 3 AC7.11: the break overlay adds one draw call', async ({ page }) => {
  await onPlatform(page);
  await step(page, 1);
  await whenIdle(page);
  const before = (await getState(page)).render.drawCalls;
  await hold(page);
  await step(page, 10);
  await whenIdle(page);
  expect((await getState(page)).breaking).not.toBeNull();
  const during = (await getState(page)).render.drawCalls;
  expect(during - before).toBe(1);
  await page.mouse.up();
  await step(page, 1);
  await whenIdle(page);
  expect((await getState(page)).render.drawCalls).toBe(before);
});

test('Phase 3 AC7.10: Creative still breaks at once and repeats while held', async ({ page }) => {
  await openGame(page);
  const { px, pz } = await standOnPlatform(page, DIRT);
  await setPlayer(page, { pitch: -50 * DEG });
  await hold(page);
  expect(await getBlock(page, px, PLATFORM_Y, pz - 1)).toBe(AIR);
  expect((await getState(page)).breaking).toBeNull();
  await expect(page.locator('.break-bar')).toBeHidden();
  await step(page, 16);
  expect(await getBlock(page, px, PLATFORM_Y, pz - 2)).toBe(AIR);
  await page.mouse.up();
  // Nothing is picked up in Creative.
  await expect(page.locator('.pickup-notice')).toBeHidden();
  expect((await inventory(page)).slice(0, 9).every((slot) => slot?.count === 1)).toBe(true);
  // `startBreak` has no meaning there.
  const answer = await page.evaluate(
    ([x, y, z]) => window.__mc.submit({ kind: 'startBreak', x, y, z }),
    [px, PLATFORM_Y, pz - 3],
  );
  expect(answer).toEqual({ ok: false, reason: 'mode' });
});

test.describe('touch', () => {
  test.use(TOUCH_DEVICE);

  test('Phase 3 AC7.9: holding the break button breaks a block after its time; a short tap does not', async ({
    page,
  }) => {
    const fingers = await openTouchGame(page, { mode: 'gathering' });
    const { px, pz } = await standOnPlatform(page, DIRT);
    await setPlayer(page, { pitch: -50 * DEG });
    const button = await centerOf(page, '.touch-break');

    // A short tap: pressed for three steps.
    await fingers.touchDown(1, button.x, button.y);
    await step(page, 3);
    await fingers.touchUp(1);
    await step(page, 60);
    expect(await getBlock(page, px, PLATFORM_Y, pz - 1)).toBe(DIRT);
    expect((await inventory(page)).every((slot) => slot === null)).toBe(true);

    await fingers.touchDown(1, button.x, button.y);
    await expect(page.locator('.break-bar')).toBeVisible();
    await step(page, DIRT_STEPS - 2);
    expect(await getBlock(page, px, PLATFORM_Y, pz - 1)).toBe(DIRT);
    await step(page, 3);
    expect(await getBlock(page, px, PLATFORM_Y, pz - 1)).toBe(AIR);
    await fingers.touchUp(1);
    expect((await inventory(page))[0]).toEqual({ item: DIRT, count: 1 });
    await expect(page.locator('.pickup-notice')).toHaveText('+1 Dirt');
    await step(page, 1);
    await expect(page.locator('.break-bar')).toBeHidden();
  });
});
