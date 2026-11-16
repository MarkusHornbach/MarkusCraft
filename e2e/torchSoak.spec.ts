// Phase 4 part B: torches in a long random mix of actions, and torches across a reload.
import { expect, test } from './fixtures';
import { getState, openGame, step, submit } from './game';

const TORCH = 19;

test('Phase 4 AC9.2: 1 000 seeded actions with torches keep every item count right and the light correct', async ({
  page,
}) => {
  test.setTimeout(240_000);
  await openGame(page, { mode: 'gathering' });
  const result = await page.evaluate(async (torch) => {
    const mc = window.__mc;
    for (const [item, count] of [
      [torch, 40],
      [2, 60],
      [3, 30],
      [257, 10],
      [256, 10],
    ]) {
      mc.give(item, count);
    }
    // mulberry32, as in the game: the same actions on every run.
    let a = 20261116;
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
    const cell = (): { x: number; y: number; z: number } => {
      const p = mc.getState().player;
      return {
        x: Math.floor(p.x) + int(9) - 4,
        y: Math.floor(p.y) + int(5) - 2,
        z: Math.floor(p.z) + int(9) - 4,
      };
    };
    const torches: { x: number; y: number; z: number }[] = [];
    const counts: Record<string, number> = {};
    const problems: string[] = [];
    let carried = 0;
    let placedTorches = 0;
    let started: { x: number; y: number; z: number } | null = null;
    for (let i = 0; i < 1000; i++) {
      const pick = int(21);
      let action: { kind: string; [key: string]: unknown };
      // Bar slots 1 to 5 hold torches, dirt, stone, sticks and coal.
      if (pick < 6) action = { kind: 'place', ...cell(), slot: int(5) };
      else if (pick < 9) {
        // A torch on the ground near the player (the surface may be leaves or water).
        const c = cell();
        action = { kind: 'place', x: c.x, y: mc.surfaceY(c.x, c.z) + 1, z: c.z, slot: 0 };
      } else if (pick < 10) action = { kind: 'startBreak', ...cell() };
      else if (pick < 13) {
        const where = started && random() < 0.8 ? started : cell();
        if (random() < 0.7) mc.step(45);
        action = { kind: 'break', ...where };
      } else if (pick < 16 && torches.length > 0) {
        // The block under a torch: start, wait, break.
        const t = torches[int(torches.length)];
        const under = { x: t.x, y: t.y - 1, z: t.z };
        const start = mc.submit({ kind: 'startBreak', ...under });
        counts[`startBreak:${start?.ok ? 'ok' : start?.reason}`] =
          (counts[`startBreak:${start?.ok ? 'ok' : start?.reason}`] ?? 0) + 1;
        mc.step(45);
        action = { kind: 'break', ...under };
      } else if (pick < 18) action = { kind: 'craft', recipe: 20 };
      else if (pick < 19) action = { kind: 'selectSlot', slot: int(5) };
      else action = { kind: 'moveStack', from: int(9), to: int(9) };

      const before = items();
      const answer = mc.submit(action);
      const outcome = answer === null ? 'none' : answer.ok ? 'ok' : answer.reason;
      counts[`${action.kind}:${outcome}`] = (counts[`${action.kind}:${outcome}`] ?? 0) + 1;
      const expected = new Map(before);
      const add = (item: number, count: number): void => {
        const next = (expected.get(item) ?? 0) + count;
        if (next === 0) expected.delete(item);
        else expected.set(item, next);
      };
      if (answer?.ok) {
        const at = action as unknown as { x: number; y: number; z: number };
        if (action.kind === 'break') {
          for (const notice of answer.notices) add(notice.item, notice.count);
          if (answer.blocks.length === 2) carried++;
          started = null;
        }
        if (action.kind === 'place') {
          const placed = mc.getBlock(at.x, at.y, at.z);
          add(placed, -1);
          if (placed === torch) {
            torches.push({ x: at.x, y: at.y, z: at.z });
            placedTorches++;
          }
        }
        if (action.kind === 'craft') {
          add(257, -1);
          add(256, -1);
          add(torch, 4);
        }
        if (action.kind === 'startBreak') started = { x: at.x, y: at.y, z: at.z };
      }
      const now = items();
      const same =
        now.size === expected.size && [...now].every(([item, n]) => expected.get(item) === n);
      if (!same) problems.push(`after ${i} (${action.kind}:${outcome})`);
      // Torches that are gone are no longer tracked; every torch stands on a solid cube.
      for (let k = torches.length - 1; k >= 0; k--) {
        const t = torches[k];
        if (mc.getBlock(t.x, t.y, t.z) !== torch) torches.splice(k, 1);
        else if ([0, 10, torch].includes(mc.getBlock(t.x, t.y - 1, t.z))) {
          problems.push(`after ${i}: a torch without support at ${t.x},${t.y},${t.z}`);
        }
      }
      if (i % 7 === 0) mc.step(2);
    }
    await mc.whenIdle();
    return { counts, problems, carried, placedTorches, wrong: mc.verifyLight() };
  }, TORCH);

  expect(result.problems).toEqual([]);
  expect(result.wrong).toBe(0);
  const count = (key: string): number => result.counts[key] ?? 0;
  for (const key of [
    'place:ok',
    'place:support',
    'place:occupied',
    'break:ok',
    'break:early',
    'startBreak:ok',
    'craft:ok',
  ]) {
    expect(count(key), key).toBeGreaterThan(0);
  }
  expect(result.carried).toBeGreaterThan(3);
  expect(result.placedTorches).toBeGreaterThan(20);
});

test('Phase 4 AC9.3: a world with torches survives a reload, with the same light', async ({
  page,
}) => {
  await openGame(page, { save: true });
  const { player } = await getState(page);
  const px = Math.floor(player.x);
  const pz = Math.floor(player.z);
  expect(await submit(page, { kind: 'setBarSlot', slot: 0, item: TORCH })).toBe(true);
  const placed = await page.evaluate(
    ([x0, y0, z0]) => {
      const mc = window.__mc;
      const cells: { x: number; y: number; z: number }[] = [];
      for (const [dx, dz] of [
        [2, 0],
        [-2, 1],
        [0, -3],
      ]) {
        const x = x0 + dx;
        const z = z0 + dz;
        // A stone to stand on and air above it, at the height of the player's feet.
        const y = y0;
        mc.setBlock(x, y - 1, z, 3);
        mc.setBlock(x, y, z, 0);
        mc.setBlock(x, y + 1, z, 0);
        const answer = mc.submit({ kind: 'place', x, y, z, slot: 0 });
        if (answer?.ok) cells.push({ x, y, z });
      }
      return cells;
    },
    [px, Math.floor(player.y), pz],
  );
  expect(placed.length).toBe(3);
  await page.evaluate(() => window.__mc.whenIdle());
  // Three recorded cells: a torch, the cell above another, and one beside the third.
  const probes = [
    placed[0],
    { ...placed[1], y: placed[1].y + 1 },
    { ...placed[2], x: placed[2].x + 1 },
  ];
  const readLight = () =>
    page.evaluate((cells) => cells.map(({ x, y, z }) => window.__mc.getLight(x, y, z)), probes);
  const before = await readLight();
  expect(before[0]).toMatchObject({ block: 14 });
  await page.evaluate(() => window.__mc.save());
  await step(page, 1);

  await page.reload();
  await page.waitForFunction(() => window.__mc !== undefined && window.__mc.isReady());
  await page.evaluate(() => window.__mc.whenIdle());
  for (const { x, y, z } of placed) {
    expect(await page.evaluate(([a, b, c]) => window.__mc.getBlock(a, b, c), [x, y, z])).toBe(
      TORCH,
    );
  }
  expect(await readLight()).toEqual(before);
  expect(await page.evaluate(() => window.__mc.verifyLight())).toBe(0);
});
