// The radar circle (Phase 8 part B1, AC3 on the PC): when it shows, where, heading-up, redraws.
import { test, expect } from './fixtures';
import {
  backToWorlds,
  createWorld,
  getState,
  openGame,
  openMenu,
  pauseWithMouse,
  setPlayer,
  step,
  untilPlaying,
  whenIdle,
} from './game';
import { COAL_ORE, holdPickaxe, mineCell, radarOf, yawTowards } from './radar';

const circle = '.radar-circle';

test('Phase 8B1 AC3.1 AC3.2 AC3.6: with progress=all the circle shows top-right while playing, not in the inventory; F3 row', async ({
  page,
}) => {
  await openGame(page, { mode: 'gathering', terrain: 'balanced', trees: 'few' });
  await step(page, 20);
  const radar = await radarOf(page);
  expect(radar).toMatchObject({ unlocked: true, setting: true, shown: true, focus: null });
  expect(radar.scans).toBeGreaterThan(0);
  expect(radar.draws).toBeGreaterThan(0);
  expect(radar.entries.filter((e) => e.kind === 'coal').length).toBe(4);
  expect(
    radar.entries.filter((e) => e.kind === 'coal').length + radar.beyond.length,
  ).toBeGreaterThan(0);
  for (const e of radar.entries) expect(e.screen).not.toBeNull();
  // PC: 12 px from the top and right edges, 112 px.
  await expect(page.locator(circle)).toBeVisible();
  const box = await page.locator(circle).boundingBox();
  const width = page.viewportSize()?.width ?? 0;
  expect(box).toEqual({ x: width - 12 - 112, y: 12, width: 112, height: 112 });
  // Not over the tracker.
  const tracker = await page.locator('.task-tracker').boundingBox();
  if (tracker) expect(tracker.x + tracker.width).toBeLessThan(box?.x ?? 0);
  // Phase 8B1 AC3.7: the reference, without the world behind it.
  await page.locator('canvas.game-canvas').evaluate((node) => {
    (node as HTMLElement).style.visibility = 'hidden';
  });
  await whenIdle(page);
  await expect(page.locator(circle)).toHaveScreenshot('radar-circle.png', {
    maxDiffPixelRatio: 0.05,
  });
  await page.locator('canvas.game-canvas').evaluate((node) => {
    (node as HTMLElement).style.visibility = '';
  });
  // The F3 row.
  await page.keyboard.press('F3');
  await step(page, 1);
  await expect(page.locator('[data-debug="radar"]')).toHaveText(
    /^4 coal · \d iron · scan \d+\.\d ms · draw \d+\.\d ms$/,
  );
  await page.keyboard.press('F3');
  // The inventory hides it (the HUD with it).
  await page.keyboard.press('KeyE');
  await step(page, 2);
  expect((await radarOf(page)).shown).toBe(false);
  await expect(page.locator(circle)).toBeHidden();
  await page.keyboard.press('KeyE');
  await step(page, 2);
  expect((await radarOf(page)).shown).toBe(true);
  await expect(page.locator(circle)).toBeVisible();
});

test('Phase 8B1 AC3.1 AC3.6: Creative has no radar and no F3 row', async ({ page }) => {
  await openGame(page);
  await step(page, 20);
  expect((await getState(page)).radar).toBeNull();
  await expect(page.locator(circle)).toBeHidden();
  await page.keyboard.press('F3');
  await step(page, 1);
  await expect(page.locator('[data-debug="radar"]')).toBeHidden();
});

test('Phase 8B1 AC3.1: with progress=fresh it is locked and hidden until task 8 is done', async ({
  page,
}) => {
  await openGame(page, { mode: 'gathering', progress: 'fresh' });
  await step(page, 20);
  expect(await radarOf(page)).toMatchObject({ unlocked: false, shown: false, scans: 0, draws: 0 });
  await expect(page.locator(circle)).toBeHidden();
  await page.evaluate(() => window.__mc.setProgress({ done: [1, 2, 3, 4, 5, 6, 7, 8] }));
  await step(page, 20);
  expect(await radarOf(page)).toMatchObject({ unlocked: true, shown: true });
  await expect(page.locator(circle)).toBeVisible();
});

test('Phase 8B1 AC3.3: heading-up: a vein ahead is drawn above the centre, after a right turn on the left', async ({
  page,
}) => {
  await openGame(page, { mode: 'gathering', terrain: 'balanced', trees: 'few' });
  await step(page, 20);
  // The farthest coal vein of the circle (well away from the centre).
  const radar = await radarOf(page);
  const target = radar.entries.filter((e) => e.kind === 'coal').sort((a, b) => b.dist - a.dist)[0];
  const same = (e: { dx: number; dy: number; dz: number }) =>
    e.dx === target.dx && e.dy === target.dy && e.dz === target.dz;
  const { player } = await getState(page);
  await setPlayer(page, {
    x: player.x,
    y: player.y,
    z: player.z,
    yaw: yawTowards(target.dx, target.dz),
  });
  await step(page, 8);
  const ahead = (await radarOf(page)).entries.find(same);
  expect(ahead?.screen?.y).toBeLessThan(-5);
  expect(Math.abs(ahead?.screen?.x ?? 99)).toBeLessThan(1);
  // Turning right lowers the yaw.
  await setPlayer(page, {
    x: player.x,
    y: player.y,
    z: player.z,
    yaw: yawTowards(target.dx, target.dz) - Math.PI / 2,
  });
  await step(page, 8);
  const left = (await radarOf(page)).entries.find(same);
  expect(left?.screen?.x).toBeLessThan(-5);
  expect(Math.abs(left?.screen?.y ?? 99)).toBeLessThan(1);
});

test('Phase 8B1 AC3.4: standing still draws nothing; turning 1° per step draws at most 30 times in 120 steps; a mined cell scans', async ({
  page,
}) => {
  await openGame(page, { mode: 'gathering', terrain: 'balanced', trees: 'few' });
  await step(page, 30);
  await whenIdle(page);
  await step(page, 30);
  const before = await radarOf(page);
  await step(page, 120);
  const still = await radarOf(page);
  expect(still.scans).toBe(before.scans);
  expect(still.draws).toBe(before.draws);
  await page.evaluate(() => {
    const start = window.__mc.getState().player;
    for (let i = 1; i <= 120; i++) {
      window.__mc.setPlayer({
        x: start.x,
        y: start.y,
        z: start.z,
        yaw: start.yaw + (i * Math.PI) / 180,
      });
      window.__mc.step(1);
    }
  });
  const turned = await radarOf(page);
  expect(turned.draws - still.draws).toBeGreaterThan(0);
  expect(turned.draws - still.draws).toBeLessThanOrEqual(30);
  expect(turned.scans).toBe(still.scans);
  // Mining a cell of a shown vein (through actions) scans within RADAR_SCAN_STEPS.
  const nearest = turned.entries.find((e) => e.kind === 'coal');
  if (!nearest) throw new Error('no coal vein shown');
  const { player } = await getState(page);
  const cell: [number, number, number] = [
    Math.floor(player.x) + nearest.dx,
    Math.floor(player.y) + nearest.dy,
    Math.floor(player.z) + nearest.dz,
  ];
  expect(await page.evaluate(([x, y, z]) => window.__mc.getBlock(x, y, z), cell)).toBe(COAL_ORE);
  await holdPickaxe(page);
  const scansBefore = (await radarOf(page)).scans;
  await mineCell(page, cell);
  await step(page, 15);
  expect((await radarOf(page)).scans).toBeGreaterThan(scansBefore);
  expect(await page.evaluate(() => window.__mc.verifyLight())).toBe(0);
});

test('Phase 8B1 AC3.1 AC3.5: the pause menu hides it; "Radar circle" switches it, survives a reload, is on in a fresh profile', async ({
  page,
}) => {
  await openMenu(page);
  expect((await getState(page)).settings.radar).toBe(true);
  await createWorld(page, { mode: 'gathering' });
  await page.evaluate(() => window.__mc.setProgress({ done: [1, 2, 3, 4, 5, 6, 7, 8] }));
  await page.waitForFunction(() => window.__mc.getState().radar?.shown === true);
  await expect(page.locator(circle)).toBeVisible();
  await pauseWithMouse(page);
  await expect(page.locator(circle)).toBeHidden();
  const toggle = page.locator('#setting-radar');
  await expect(page.locator('label[for="setting-radar"]')).toContainText('Radar circle');
  await expect(toggle).toBeChecked();
  await toggle.click();
  await expect(toggle).not.toBeChecked();
  await page.locator('.pause-screen .play-button:visible').click();
  await untilPlaying(page);
  await page.waitForFunction(() => window.__mc.getState().radar?.setting === false);
  expect((await radarOf(page)).shown).toBe(false);
  await expect(page.locator(circle)).toBeHidden();
  await pauseWithMouse(page);
  await backToWorlds(page);
  await page.reload();
  await page.waitForFunction(() => window.__mc !== undefined);
  expect((await getState(page)).settings.radar).toBe(false);
});
