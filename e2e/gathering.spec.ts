// Phase 3 steps 9 and 13: Gathering play-throughs with real input, and soaks over all actions.
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { DEG, getBlock, getState, inventory, openGame, setPlayer, step, whenIdle } from './game';
import { type Cell, findSites, holdBreak } from './sites';

const AIR = 0;
const GRASS = 1;
const DIRT = 2;
const SAND = 4;
const LOG = 5;
const STONE = 3;
const PLANKS = 7;
const WORKBENCH = 15;
const STICK = 257;
const WOODEN_PICKAXE = 259;
const STONE_PICKAXE = 262;

/** Places the selected item with a real right click; returns the cell it should fill. */
async function placeOnTarget(page: Page): Promise<Cell> {
  const target = (await getState(page)).target;
  if (!target) throw new Error('nothing targeted');
  // On top of the ground, not against the side of something.
  expect(target.face).toEqual([0, 1, 0]);
  await page.mouse.click(480, 270, { button: 'right' });
  await whenIdle(page);
  return { x: target.x, y: target.y + 1, z: target.z };
}

test('Phase 3 AC9.1: from an empty inventory, gather a log, dirt and sand, build a small wall, and find it all after a reload', async ({
  page,
}) => {
  test.setTimeout(180_000);
  const options = { mode: 'gathering', save: true, world: 'Journey' } as const;
  await openGame(page, options);
  expect((await inventory(page)).every((slot) => slot === null)).toBe(true);
  const sites = await findSites(page);

  // Dirt lies under the grass at the start point: dig straight down, twice.
  const start = (await getState(page)).player;
  const home: Cell = { x: Math.floor(start.x), y: Math.floor(start.y) - 1, z: Math.floor(start.z) };
  await setPlayer(page, { pitch: -89 * DEG });
  expect((await getState(page)).target).toMatchObject({ ...home, id: GRASS });
  await holdBreak(page, 44);
  expect(await getBlock(page, home.x, home.y, home.z)).toBe(AIR);
  // The player drops into the hole and looks at the dirt below.
  await step(page, 30);
  expect((await getState(page)).target).toMatchObject({
    x: home.x,
    y: home.y - 1,
    z: home.z,
    id: DIRT,
  });
  await holdBreak(page, 38);
  expect(await getBlock(page, home.x, home.y - 1, home.z)).toBe(AIR);

  // Sand from the nearest beach.
  const { sand, tree } = sites;
  await setPlayer(page, { x: sand.x + 0.5, y: sand.y + 1, z: sand.z + 0.5, pitch: -89 * DEG });
  await step(page, 10);
  expect((await getState(page)).target).toMatchObject({
    x: sand.x,
    y: sand.y,
    z: sand.z,
    id: SAND,
  });
  await holdBreak(page, 38);
  expect(await getBlock(page, sand.x, sand.y, sand.z)).not.toBe(SAND);

  // A log from the nearest tree, standing next to its trunk.
  await setPlayer(page, {
    x: tree.stand.x + 0.5,
    y: tree.stand.y,
    z: tree.stand.z + 0.5,
    yaw: tree.yaw,
    pitch: 0,
  });
  await step(page, 10);
  const trunk = (await getState(page)).target;
  expect(trunk).toMatchObject({ x: tree.log.x, z: tree.log.z, id: LOG });
  if (!trunk) return;
  // Two seconds by hand; one step short of it the log still stands.
  await page.mouse.move(480, 270);
  await page.mouse.down();
  await step(page, 119);
  expect(await getBlock(page, trunk.x, trunk.y, trunk.z)).toBe(LOG);
  await step(page, 2);
  await page.mouse.up();
  expect(await getBlock(page, trunk.x, trunk.y, trunk.z)).toBe(AIR);

  // Everything went straight into the bar, in the order it was gathered.
  const gathered = await inventory(page);
  expect(gathered.slice(0, 4)).toEqual([
    { item: GRASS, count: 1 },
    { item: DIRT, count: 1 },
    { item: SAND, count: 1 },
    { item: LOG, count: 1 },
  ]);
  expect(gathered.slice(4).every((slot) => slot === null)).toBe(true);

  // A wall of three on the beach, in the row between the player and the hole in the
  // sand: sand and dirt to the sides, the log in the middle.
  await setPlayer(page, {
    x: sand.x + 0.5,
    y: sand.y + 1,
    z: sand.z + 2.5,
    yaw: 0,
    pitch: -50 * DEG,
  });
  await step(page, 10);
  const wall: (Cell & { id: number })[] = [];
  for (const [key, id, yaw] of [
    ['Digit3', SAND, 35],
    ['Digit2', DIRT, -35],
    ['Digit4', LOG, 0],
  ] as const) {
    await page.keyboard.press(key);
    await setPlayer(page, { yaw: yaw * DEG });
    const cell = await placeOnTarget(page);
    expect(await getBlock(page, cell.x, cell.y, cell.z)).toBe(id);
    wall.push({ ...cell, id });
  }
  // Three different cells in one row.
  expect(new Set(wall.map((c) => `${c.x},${c.z}`)).size).toBe(3);
  expect(wall.map((c) => c.z)).toEqual([sand.z + 1, sand.z + 1, sand.z + 1]);
  expect(wall.map((c) => c.y)).toEqual([sand.y + 1, sand.y + 1, sand.y + 1]);
  await step(page, 5);
  const before = await getState(page);
  expect(before.inventory.slots.slice(0, 4)).toEqual([{ item: GRASS, count: 1 }, null, null, null]);

  await page.evaluate(() => window.__mc.save());
  await openGame(page, options);
  const after = await getState(page);
  expect(after.mode).toBe('gathering');
  expect(after.inventory).toEqual(before.inventory);
  expect(after.player.x).toBeCloseTo(before.player.x, 2);
  expect(after.player.z).toBeCloseTo(before.player.z, 2);
  for (const cell of wall) expect(await getBlock(page, cell.x, cell.y, cell.z)).toBe(cell.id);
  // The holes are still holes.
  expect(await getBlock(page, home.x, home.y, home.z)).toBe(AIR);
  expect(await getBlock(page, home.x, home.y - 1, home.z)).toBe(AIR);
  expect(await getBlock(page, trunk.x, trunk.y, trunk.z)).toBe(AIR);
});

test('Phase 3 AC9.2: 500 random actions of all kinds change the item count only by breaks, places and discards', async ({
  page,
}) => {
  test.setTimeout(180_000);
  await openGame(page, { mode: 'gathering' });
  const result = await page.evaluate(async () => {
    const mc = window.__mc;
    // Something to place and to move around from the start.
    mc.give(2, 40);
    mc.give(3, 25);
    mc.give(256, 9);

    // mulberry32, as in the game: the same actions on every run.
    let a = 20261114;
    const random = (): number => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const int = (n: number): number => Math.floor(random() * n);
    const total = (): number =>
      mc.getState().inventory.slots.reduce((sum, slot) => sum + (slot?.count ?? 0), 0);
    const cell = (): { x: number; y: number; z: number } => {
      const p = mc.getState().player;
      // Mostly within reach, sometimes beyond it.
      return {
        x: Math.floor(p.x) + int(11) - 5,
        y: Math.floor(p.y) + int(8) - 3,
        z: Math.floor(p.z) + int(11) - 5,
      };
    };
    const junk: unknown[] = [
      null,
      7,
      {},
      { kind: 'craft' },
      { kind: 'craft', recipe: 0 },
      { kind: 'startBreak', x: 1, y: 2 },
      { kind: 'moveStack', from: 0, to: 36 },
      { kind: 'discard', slot: -1 },
      { kind: 'setBarSlot', slot: 0, item: 0 },
    ];
    const counts: Record<string, number> = {};
    const problems: string[] = [];
    let expected = total();
    let started: { x: number; y: number; z: number } | null = null;
    for (let i = 0; i < 500; i++) {
      const pick = int(20);
      let action: { kind?: string; slot?: number } | unknown;
      if (pick < 5) action = { kind: 'startBreak', ...cell() };
      else if (pick < 10) {
        // Mostly the started block after its time, sometimes too early or another cell.
        const where = started && random() < 0.8 ? started : cell();
        if (random() < 0.7) mc.step(45);
        action = { kind: 'break', ...where };
      } else if (pick < 13) action = { kind: 'place', ...cell(), slot: int(9) };
      else if (pick < 15) action = { kind: 'moveStack', from: int(36), to: int(36) };
      else if (pick < 16) action = { kind: 'discard', slot: int(36) };
      else if (pick < 17) action = { kind: 'setBarSlot', slot: int(9), item: 1 + int(14) };
      else if (pick < 18) action = { kind: 'selectSlot', slot: int(9) };
      else action = junk[int(junk.length)];

      const known =
        typeof action === 'object' && action !== null ? (action as { kind?: string }) : {};
      const kind = known.kind ?? 'junk';
      const slotBefore =
        kind === 'discard'
          ? (mc.getState().inventory.slots[(action as { slot: number }).slot]?.count ?? 0)
          : 0;
      const answer = mc.submit(action);
      const outcome = answer === null ? 'none' : answer.ok ? 'ok' : answer.reason;
      counts[`${kind}:${outcome}`] = (counts[`${kind}:${outcome}`] ?? 0) + 1;
      if (answer?.ok) {
        // Stone broken without a pickaxe yields nothing (Part C).
        if (kind === 'break') expected += answer.notices.reduce((sum, n) => sum + n.count, 0);
        if (kind === 'place') expected -= 1;
        if (kind === 'discard') expected -= slotBefore;
        if (kind === 'startBreak') {
          // Without the kind: the cell is spread into the `break` that follows.
          const { x, y, z } = action as { x: number; y: number; z: number };
          started = { x, y, z };
        }
        if (kind === 'break') started = null;
      }
      const now = total();
      if (now !== expected) {
        problems.push(`after ${i} (${kind}:${outcome}): ${now} items, expected ${expected}`);
        expected = now;
      }
      if (i % 7 === 0) mc.step(2);
    }
    await mc.whenIdle();
    const state = mc.getState();
    const bad = state.inventory.slots.filter(
      (slot) =>
        slot !== null && (slot.count < 1 || slot.count > 99 || !Number.isInteger(slot.count)),
    );
    return { counts, problems, bad: bad.length, mode: state.player.mode, total: total() };
  });

  expect(result.problems).toEqual([]);
  expect(result.bad).toBe(0);
  expect(result.mode).toBe('walk');
  const count = (key: string): number => result.counts[key] ?? 0;
  expect(Object.values(result.counts).reduce((sum, n) => sum + n, 0)).toBe(500);
  // The mix reached every kind of action, accepted and refused.
  for (const key of [
    'startBreak:ok',
    'break:ok',
    'break:early',
    'place:ok',
    'moveStack:ok',
    'discard:ok',
    'selectSlot:ok',
    'setBarSlot:mode',
    'junk:invalid',
  ]) {
    expect(count(key), key).toBeGreaterThan(0);
  }
  expect(count('break:ok')).toBeGreaterThan(20);
  expect(Object.keys(result.counts).filter((key) => key.endsWith(':none'))).toEqual([]);
  // Phase 4 AC5.1: after all those breaks and places the stored light is still right.
  expect(await page.evaluate(() => window.__mc.verifyLight())).toBe(0);
});

// --- Step 13: from bare hands to a stone pickaxe, through the recipe list ----------------

interface ChromeMemory {
  usedJSHeapSize: number;
}

async function have(page: Page, item: number): Promise<number> {
  return (await inventory(page)).reduce((sum, s) => sum + (s?.item === item ? s.count : 0), 0);
}

/** Selects the bar slot that holds the item, with its number key. */
async function selectItem(page: Page, item: number): Promise<void> {
  const slot = (await inventory(page)).findIndex((s) => s?.item === item);
  expect(slot, `item ${item} in the bar`).toBeGreaterThanOrEqual(0);
  expect(slot, `item ${item} in the bar`).toBeLessThan(9);
  await page.keyboard.press(`Digit${slot + 1}`);
  expect((await getState(page)).selectedSlot).toBe(slot + 1);
}

/** Opens the recipe list, clicks "Craft" for each recipe in turn and closes it again. */
async function craft(page: Page, ...recipes: string[]): Promise<void> {
  await page.keyboard.press('KeyE');
  await page.locator('.inventory-tab[data-tab="crafting"]').click();
  for (const recipe of recipes) {
    const button = page.locator(`.recipe-row[data-recipe="${recipe}"] .recipe-craft`);
    await expect(button, recipe).toBeVisible();
    await button.click();
    // A moment between two recipes, as a player needs it to find the next row.
    await step(page, 20);
  }
  await page.keyboard.press('KeyE');
  await expect(page.locator('.inventory-screen')).toBeHidden();
}

test('Phase 3 AC13.1: gather wood, craft planks, sticks, a workbench and a wooden pickaxe, mine stone and craft a stone pickaxe; a reload keeps it all', async ({
  page,
}) => {
  test.setTimeout(240_000);
  const options = { mode: 'gathering', save: true, world: 'Tools' } as const;
  await openGame(page, options);
  expect((await inventory(page)).every((slot) => slot === null)).toBe(true);
  const { tree, rock } = await findSites(page);

  // Three logs from the nearest tree by hand: the one at eye height, the one at the
  // foot and the one above.
  const beside = { x: tree.stand.x + 0.5, y: tree.stand.y, z: tree.stand.z + 0.5, yaw: tree.yaw };
  await setPlayer(page, { ...beside, pitch: 0 });
  await step(page, 10);
  const logs: Cell[] = [];
  for (const pitch of [0, -45, 45]) {
    await setPlayer(page, { pitch: pitch * DEG });
    const target = (await getState(page)).target;
    expect(target, `pitch ${pitch}`).toMatchObject({ x: tree.log.x, z: tree.log.z, id: LOG });
    if (!target) return;
    await holdBreak(page, 121);
    expect(await getBlock(page, target.x, target.y, target.z)).toBe(AIR);
    logs.push({ x: target.x, y: target.y, z: target.z });
  }
  expect(new Set(logs.map((log) => log.y)).size).toBe(3);
  expect(await have(page, LOG)).toBe(3);

  // No workbench yet: the tools wait for one.
  await page.keyboard.press('KeyE');
  await page.locator('.inventory-tab[data-tab="crafting"]').click();
  await expect(page.locator('.recipe-row[data-recipe="wooden_pickaxe"] .recipe-note')).toHaveText(
    'Needs a workbench nearby',
  );
  await page.keyboard.press('KeyE');
  // Twelve planks, of which two become sticks and four the workbench.
  await craft(page, 'planks', 'planks', 'planks', 'sticks', 'workbench');
  expect(await have(page, LOG)).toBe(0);
  expect(await have(page, PLANKS)).toBe(6);
  expect(await have(page, STICK)).toBe(4);
  expect(await have(page, WORKBENCH)).toBe(1);

  // The workbench goes where the foot of the trunk was, with a right click.
  await selectItem(page, WORKBENCH);
  await setPlayer(page, { pitch: -60 * DEG });
  const ground = (await getState(page)).target;
  expect(ground).toMatchObject({ x: tree.log.x, y: tree.log.y - 1, z: tree.log.z });
  const bench = await placeOnTarget(page);
  expect(await getBlock(page, bench.x, bench.y, bench.z)).toBe(WORKBENCH);
  expect(await have(page, WORKBENCH)).toBe(0);

  await craft(page, 'wooden_pickaxe');
  expect(await have(page, WOODEN_PICKAXE)).toBe(1);
  expect(await have(page, PLANKS)).toBe(3);
  expect(await have(page, STICK)).toBe(2);

  // Bare rock on the hill nearby. By hand the stone would be lost; the HUD says so.
  await setPlayer(page, { x: rock.x + 0.5, y: rock.y + 1, z: rock.z + 0.5, pitch: -89 * DEG });
  await step(page, 10);
  await page.keyboard.press('Digit9');
  await step(page, 1);
  expect((await getState(page)).target).toMatchObject({
    x: rock.x,
    y: rock.y,
    z: rock.z,
    id: STONE,
  });
  await expect(page.locator('.hud-message')).toHaveText('Needs a pickaxe');
  await selectItem(page, WOODEN_PICKAXE);
  await step(page, 1);
  await expect(page.locator('.hud-message')).toBeHidden();
  // Three blocks straight down, a second and a half each with the wooden pickaxe.
  for (let depth = 0; depth < 3; depth++) {
    expect((await getState(page)).target).toMatchObject({
      x: rock.x,
      y: rock.y - depth,
      id: STONE,
    });
    await page.mouse.move(480, 270);
    await page.mouse.down();
    await step(page, 89);
    expect(await getBlock(page, rock.x, rock.y - depth, rock.z)).toBe(STONE);
    await step(page, 2);
    await page.mouse.up();
    expect(await getBlock(page, rock.x, rock.y - depth, rock.z)).toBe(AIR);
    // The player drops into the hole.
    await step(page, 30);
  }
  expect(await have(page, STONE)).toBe(3);

  // Up here the workbench is too far away.
  await page.keyboard.press('KeyE');
  await page.locator('.inventory-tab[data-tab="crafting"]').click();
  await expect(page.locator('.recipe-row[data-recipe="stone_pickaxe"] .recipe-note')).toHaveText(
    'Needs a workbench nearby',
  );
  await page.keyboard.press('KeyE');
  // Back at the workbench: three stone and two sticks make the stone pickaxe.
  await setPlayer(page, { ...beside, pitch: 0 });
  await step(page, 10);
  await craft(page, 'stone_pickaxe');
  const slots = await inventory(page);
  expect(slots.slice(0, 9).some((slot) => slot?.item === STONE_PICKAXE)).toBe(true);
  expect(await have(page, STONE)).toBe(0);
  expect(await have(page, STICK)).toBe(0);
  expect(await have(page, WOODEN_PICKAXE)).toBe(1);
  await selectItem(page, STONE_PICKAXE);
  await expect(page.locator('.hotbar-label')).toHaveText('Stone pickaxe');
  await step(page, 5);

  const before = await getState(page);
  await page.evaluate(() => window.__mc.save());
  await openGame(page, options);
  const after = await getState(page);
  expect(after.mode).toBe('gathering');
  expect(after.inventory).toEqual(before.inventory);
  expect(after.selectedSlot).toBe(before.selectedSlot);
  expect(after.player.x).toBeCloseTo(before.player.x, 2);
  expect(after.player.z).toBeCloseTo(before.player.z, 2);
  expect(await getBlock(page, bench.x, bench.y, bench.z)).toBe(WORKBENCH);
  for (const log of logs.filter((log) => log.y !== bench.y)) {
    expect(await getBlock(page, log.x, log.y, log.z)).toBe(AIR);
  }
  for (let depth = 0; depth < 3; depth++) {
    expect(await getBlock(page, rock.x, rock.y - depth, rock.z)).toBe(AIR);
  }
  // The workbench still works after the reload.
  expect(after.recipes.find((r) => r.name === 'stone_pickaxe')?.stationMissing).toBe(false);
});

test('Phase 3 AC13.2: 1 000 random actions of all kinds, crafting included, change the items only as the accepted actions say', async ({
  page,
}) => {
  test.setTimeout(240_000);
  await openGame(page, { mode: 'gathering' });
  const result = await page.evaluate(async () => {
    const mc = window.__mc;
    const memory = (performance as unknown as { memory?: ChromeMemory }).memory;
    const heapBefore = memory?.usedJSHeapSize ?? null;
    // The recipe table of the plan, written out once more: [ingredients, result] by
    // recipe number, each as [item, count].
    const P = 7;
    const S = 3;
    const I = 258;
    const stick2 = [257, 2];
    const recipes: Record<number, [number[][], number[]]> = {
      1: [[[5, 1]], [P, 4]],
      2: [[[P, 2]], [257, 4]],
      3: [[[P, 4]], [15, 1]],
      4: [
        [[P, 3], stick2],
        [259, 1],
      ],
      5: [
        [[P, 3], stick2],
        [260, 1],
      ],
      6: [
        [[P, 1], stick2],
        [261, 1],
      ],
      7: [
        [[S, 3], stick2],
        [262, 1],
      ],
      8: [
        [[S, 3], stick2],
        [263, 1],
      ],
      9: [
        [[S, 1], stick2],
        [264, 1],
      ],
      10: [[[S, 8]], [16, 1]],
      11: [[[5, 2]], [256, 1]],
      12: [
        [
          [13, 1],
          [256, 1],
        ],
        [I, 1],
      ],
      13: [
        [[I, 3], stick2],
        [265, 1],
      ],
      14: [
        [[I, 3], stick2],
        [266, 1],
      ],
      15: [
        [[I, 1], stick2],
        [267, 1],
      ],
      16: [[[S, 4]], [17, 4]],
      17: [
        [
          [4, 2],
          [256, 1],
        ],
        [9, 2],
      ],
      18: [
        [
          [14, 2],
          [256, 1],
        ],
        [8, 2],
      ],
      19: [[[I, 9]], [18, 1]],
      // Phase 4 part B: the torch.
      20: [
        [
          [257, 1],
          [256, 1],
        ],
        [19, 4],
      ],
    };
    // Both stations next to the player, in the air; material for every recipe.
    const origin = mc.getState().player;
    const ox = Math.floor(origin.x);
    const oy = Math.floor(origin.y);
    const oz = Math.floor(origin.z);
    mc.setBlock(ox + 1, oy + 2, oz, 15);
    mc.setBlock(ox - 1, oy + 2, oz, 16);
    for (const [item, count] of [
      [262, 1],
      [5, 60],
      [P, 40],
      [S, 90],
      [256, 30],
      [13, 30],
      [4, 20],
      [14, 20],
      [2, 30],
    ]) {
      mc.give(item, count);
    }

    // mulberry32, as in the game: the same actions on every run.
    let a = 20261115;
    const random = (): number => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const int = (n: number): number => Math.floor(random() * n);
    const items = (): Map<number, number> => {
      const counts = new Map<number, number>();
      for (const slot of mc.getState().inventory.slots) {
        if (slot) counts.set(slot.item, (counts.get(slot.item) ?? 0) + slot.count);
      }
      return counts;
    };
    const total = (counts: Map<number, number>): number =>
      [...counts.values()].reduce((sum, n) => sum + n, 0);
    const cell = (): { x: number; y: number; z: number } => {
      const p = mc.getState().player;
      return {
        x: Math.floor(p.x) + int(11) - 5,
        y: Math.floor(p.y) + int(8) - 3,
        z: Math.floor(p.z) + int(11) - 5,
      };
    };
    const junk: unknown[] = [
      null,
      'craft',
      {},
      { kind: 'craft' },
      { kind: 'craft', recipe: 1.5 },
      { kind: 'craft', recipe: '1' },
      { kind: 'startBreak', x: 1, y: 2 },
      { kind: 'moveStack', from: 0, to: 36 },
      { kind: 'discard', slot: -1 },
    ];
    const counts: Record<string, number> = {};
    const problems: string[] = [];
    let started: { x: number; y: number; z: number } | null = null;
    for (let i = 0; i < 1000; i++) {
      // Half-way the furnace is taken away: its recipes are refused from then on.
      if (i === 600) mc.setBlock(ox - 1, oy + 2, oz, 0);
      const pick = int(26);
      let action: unknown;
      if (pick < 5) action = { kind: 'startBreak', ...cell() };
      else if (pick < 10) {
        const where = started && random() < 0.8 ? started : cell();
        if (random() < 0.7) mc.step(45);
        action = { kind: 'break', ...where };
      } else if (pick < 13) action = { kind: 'place', ...cell(), slot: int(9) };
      else if (pick < 15) action = { kind: 'moveStack', from: int(36), to: int(36) };
      else if (pick < 16) action = { kind: 'discard', slot: int(36) };
      else if (pick < 17) action = { kind: 'setBarSlot', slot: int(9), item: 1 + int(18) };
      else if (pick < 18) action = { kind: 'selectSlot', slot: int(9) };
      // Recipe 0 and 21 do not exist.
      else if (pick < 24) action = { kind: 'craft', recipe: int(22) };
      else action = junk[int(junk.length)];

      const known =
        typeof action === 'object' && action !== null
          ? (action as { kind?: string; slot?: number; recipe?: number })
          : {};
      const kind = known.kind ?? 'junk';
      const before = items();
      const slotBefore =
        kind === 'discard' ? (mc.getState().inventory.slots[known.slot ?? -1] ?? null) : null;
      const answer = mc.submit(action);
      const outcome = answer === null ? 'none' : answer.ok ? 'ok' : answer.reason;
      counts[`${kind}:${outcome}`] = (counts[`${kind}:${outcome}`] ?? 0) + 1;
      // What the accepted action says must have happened to each item.
      const expected = new Map(before);
      const add = (item: number, count: number): void => {
        const next = (expected.get(item) ?? 0) + count;
        if (next === 0) expected.delete(item);
        else expected.set(item, next);
      };
      if (answer?.ok) {
        if (kind === 'break') {
          for (const notice of answer.notices) add(notice.item, notice.count);
          started = null;
        }
        if (kind === 'place') {
          // One item less of the block that stands in the cell now.
          const { x, y, z } = action as { x: number; y: number; z: number };
          add(mc.getBlock(x, y, z), -1);
        }
        if (kind === 'discard' && slotBefore) add(slotBefore.item, -slotBefore.count);
        if (kind === 'craft') {
          const [ingredients, made] = recipes[known.recipe ?? 0];
          for (const [item, count] of ingredients) add(item, -count);
          add(made[0], made[1]);
        }
        if (kind === 'startBreak') {
          const { x, y, z } = action as { x: number; y: number; z: number };
          started = { x, y, z };
        }
      }
      const now = items();
      const same =
        now.size === expected.size && [...now].every(([item, n]) => expected.get(item) === n);
      if (!same) {
        problems.push(
          `after ${i} (${kind}:${outcome}): ${total(now)} items, expected ${total(expected)}`,
        );
      }
      if (i % 7 === 0) mc.step(2);
    }
    await mc.whenIdle();
    const state = mc.getState();
    const bad = state.inventory.slots.filter(
      (slot) =>
        slot !== null && (slot.count < 1 || slot.count > 99 || !Number.isInteger(slot.count)),
    );
    const heapAfter = memory?.usedJSHeapSize ?? null;
    return { counts, problems, bad: bad.length, mode: state.player.mode, heapBefore, heapAfter };
  });

  expect(result.problems).toEqual([]);
  expect(result.bad).toBe(0);
  expect(result.mode).toBe('walk');
  const count = (key: string): number => result.counts[key] ?? 0;
  expect(Object.values(result.counts).reduce((sum, n) => sum + n, 0)).toBe(1000);
  // The mix reached every kind of action, accepted and refused.
  for (const key of [
    'startBreak:ok',
    'break:ok',
    'break:early',
    'place:ok',
    'moveStack:ok',
    'discard:ok',
    'selectSlot:ok',
    'setBarSlot:mode',
    'craft:ok',
    'craft:missing',
    'craft:station',
    'craft:invalid',
    'junk:invalid',
  ]) {
    expect(count(key), key).toBeGreaterThan(0);
  }
  expect(count('break:ok')).toBeGreaterThan(15);
  expect(count('craft:ok')).toBeGreaterThan(25);
  expect(Object.keys(result.counts).filter((key) => key.endsWith(':none'))).toEqual([]);
  if (result.heapBefore !== null && result.heapAfter !== null) {
    expect(result.heapAfter - result.heapBefore).toBeLessThan(50 * 1024 * 1024);
  }
  // Phase 4 AC5.1: the stored light is still right.
  expect(await page.evaluate(() => window.__mc.verifyLight())).toBe(0);
});
