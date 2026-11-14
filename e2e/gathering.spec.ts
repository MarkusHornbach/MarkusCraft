// Phase 3 step 9: a Gathering play-through with real input, and a soak over all actions.
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { DEG, getBlock, getState, inventory, openGame, setPlayer, step, whenIdle } from './game';

const AIR = 0;
const GRASS = 1;
const DIRT = 2;
const SAND = 4;
const LOG = 5;

interface Cell {
  x: number;
  y: number;
  z: number;
}

/** Holds the left mouse button on the crosshair for `steps` simulation steps. */
async function holdBreak(page: Page, steps: number): Promise<void> {
  await page.mouse.move(480, 270);
  await page.mouse.down();
  await step(page, steps);
  await page.mouse.up();
  await step(page, 1);
}

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

/** The nearest beach column and the nearest tree with a place to stand next to it. */
function findSites(page: Page): Promise<{
  sand: Cell;
  tree: { log: Cell; stand: Cell; yaw: number };
}> {
  return page.evaluate(() => {
    const mc = window.__mc;
    const start = mc.getState().player;
    const sx = Math.floor(start.x);
    const sz = Math.floor(start.z);
    let sand: { x: number; y: number; z: number; d: number } | null = null;
    let tree: {
      log: { x: number; y: number; z: number };
      stand: { x: number; y: number; z: number };
      yaw: number;
      d: number;
    } | null = null;
    // The player at +x of the trunk looks towards -x, and so on.
    const sides: [number, number, number][] = [
      [1, 0, Math.PI / 2],
      [-1, 0, -Math.PI / 2],
      [0, 1, 0],
      [0, -1, Math.PI],
    ];
    for (let dz = -56; dz <= 56; dz++) {
      for (let dx = -56; dx <= 56; dx++) {
        const x = sx + dx;
        const z = sz + dz;
        const top = mc.surfaceY(x, z);
        if (top < 0) continue;
        const d = Math.hypot(dx, dz);
        const id = mc.getBlock(x, top, z);
        // Dry sand at the edge of a flat, open place of three by three columns: the sand
        // is dug at its -z edge, the wall goes into the middle row, the player stands in
        // the row at +z.
        if (id === 4 && (!sand || d < sand.d)) {
          let flat = true;
          for (let az = 0; az <= 2 && flat; az++) {
            for (let ax = -1; ax <= 1 && flat; ax++) {
              const ground = mc.getBlock(x + ax, top, z + az);
              flat =
                mc.surfaceY(x + ax, z + az) === top &&
                // Not the lake (block 10): `surfaceY` counts water.
                ground !== 0 &&
                ground !== 10 &&
                mc.getBlock(x + ax, top + 1, z + az) === 0 &&
                mc.getBlock(x + ax, top + 2, z + az) === 0;
            }
          }
          if (flat) sand = { x, y: top, z, d };
        }
        if (id === 5 && (!tree || d < tree.d)) {
          let base = top;
          while (mc.getBlock(x, base - 1, z) === 5) base--;
          for (const [ax, az, yaw] of sides) {
            const nx = x + ax;
            const nz = z + az;
            if (mc.surfaceY(nx, nz) !== base - 1) continue;
            if (mc.getBlock(nx, base, nz) !== 0 || mc.getBlock(nx, base + 1, nz) !== 0) continue;
            tree = { log: { x, y: base, z }, stand: { x: nx, y: base, z: nz }, yaw, d };
            break;
          }
        }
      }
    }
    if (!sand || !tree) throw new Error('no beach or no tree near the start point');
    return { sand, tree };
  });
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
        if (kind === 'break') expected += 1;
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
});
