// Soak test: a long flight must not leak chunks, GPU resources or memory (AC12.1).
import { test, expect } from './fixtures';
import { getState, openGame } from './game';

interface ChromeMemory {
  usedJSHeapSize: number;
}

test('flying 2 000 blocks keeps chunk counts and memory stable (AC12.1)', async ({ page }) => {
  test.setTimeout(240_000);
  await openGame(page);
  const start = await getState(page);

  const result = await page.evaluate(async () => {
    const mc = window.__mc;
    const memory = (performance as unknown as { memory?: ChromeMemory }).memory;
    const heapBefore = memory?.usedJSHeapSize ?? null;
    const origin = mc.getState().player;
    mc.setPlayer({ y: 120, mode: 'fly' });
    let maxMeshed = 0;
    let maxGeometries = 0;
    const steps = Math.ceil(2000 / 64);
    for (let i = 1; i <= steps; i++) {
      mc.setPlayer({ x: origin.x + i * 64 });
      await mc.whenIdle();
      const state = mc.getState();
      if (state.chunks.loaded !== 81 || state.chunks.pending !== 0) {
        throw new Error(`unexpected chunk state after teleport ${i}`);
      }
      maxMeshed = Math.max(maxMeshed, state.chunks.meshed);
      maxGeometries = Math.max(maxGeometries, state.render.geometries);
    }
    const heapAfter = memory?.usedJSHeapSize ?? null;
    return { heapBefore, heapAfter, maxMeshed, maxGeometries, distance: steps * 64 };
  });

  expect(result.distance).toBeGreaterThanOrEqual(2000);
  const end = await getState(page);
  expect(end.player.x - start.player.x).toBeGreaterThanOrEqual(2000);
  expect(end.chunks.loaded).toBe(81);
  expect(end.chunks.pending).toBe(0);
  // Data exists for the 11×11 area only; meshes for the radius plus the hysteresis ring.
  expect(end.chunks.generated).toBe(121);
  expect(result.maxMeshed).toBeLessThanOrEqual(121);
  // At most three geometries per meshed chunk, plus sky, sun, moon, stars and outline.
  expect(result.maxGeometries).toBeLessThanOrEqual(3 * 121 + 10);
  if (result.heapBefore !== null && result.heapAfter !== null) {
    expect(result.heapAfter - result.heapBefore).toBeLessThan(50 * 1024 * 1024);
  }
});

test('500 random actions with autosave and a world switch survive a reload (Phase 3 AC5.2)', async ({
  page,
}) => {
  test.setTimeout(240_000);
  await openGame(page, { save: true, world: 'Soak' });
  await page.evaluate(() => window.__mc.save());

  // The player hovers over the start point; all actions aim at cells around them.
  const result = await page.evaluate(async () => {
    const mc = window.__mc;
    const memory = (performance as unknown as { memory?: ChromeMemory }).memory;
    const heapBefore = memory?.usedJSHeapSize ?? null;
    const start = mc.getState().player;
    const origin = { x: Math.floor(start.x), y: Math.floor(start.y) + 6, z: Math.floor(start.z) };
    mc.setPlayer({ x: origin.x + 0.5, y: origin.y, z: origin.z + 0.5, mode: 'fly' });
    await mc.whenIdle();

    // mulberry32, as in the game: the same actions on every run.
    let a = 20260713;
    const random = (): number => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const int = (n: number): number => Math.floor(random() * n);
    const cell = (): { x: number; y: number; z: number } => ({
      // Mostly within reach, sometimes beyond it.
      x: origin.x + int(13) - 6,
      y: origin.y + int(11) - 7,
      z: origin.z + int(13) - 6,
    });
    const junk: unknown[] = [
      null,
      42,
      'break',
      {},
      { kind: 'explode' },
      { kind: 'break', x: 0.5, y: 1, z: 2 },
      { kind: 'place', x: 1, y: 2, z: 3, slot: 12 },
      { kind: 'selectSlot', slot: -1 },
      { kind: 'break', x: 1, y: 2, z: 3, extra: true },
    ];
    const counts: Record<string, number> = {};
    const count = (key: string): void => {
      counts[key] = (counts[key] ?? 0) + 1;
    };
    const run = (n: number): void => {
      for (let i = 0; i < n; i++) {
        const pick = int(10);
        let action: unknown;
        if (pick < 4) action = { kind: 'place', ...cell(), slot: int(9) };
        else if (pick < 8) action = { kind: 'break', ...cell() };
        else if (pick < 9) action = { kind: 'selectSlot', slot: int(9) };
        else action = junk[int(junk.length)];
        const answer = mc.submit(action);
        count(answer === null ? 'none' : answer.ok ? 'ok' : answer.reason);
        // Time passes: the autosave interval elapses several times during the run.
        if (i % 10 === 0) mc.step(1);
      }
    };

    run(250);
    // Over to another world and back, in place; the first one is saved on the way.
    await mc.openWorld('Soak 2', 99);
    await mc.whenIdle();
    const otherSeed = mc.getState().seed;
    await mc.openWorld('Soak', 0);
    await mc.whenIdle();
    run(250);
    // Give the autosave the time to write by itself at least once.
    await new Promise((resolve) => setTimeout(resolve, 5500));
    mc.step(1);
    await mc.whenIdle();
    await mc.save();

    const blocks: number[] = [];
    for (let y = origin.y - 8; y <= origin.y + 4; y++) {
      for (let z = origin.z - 7; z <= origin.z + 7; z++) {
        for (let x = origin.x - 7; x <= origin.x + 7; x++) blocks.push(mc.getBlock(x, y, z));
      }
    }
    const heapAfter = memory?.usedJSHeapSize ?? null;
    return { origin, counts, blocks, otherSeed, heapBefore, heapAfter, state: mc.getState() };
  });

  expect(result.otherSeed).toBe(99);
  expect(result.state.world?.name).toBe('Soak');
  expect(result.state.save).toMatchObject({ dirty: false, lastError: null });
  // The mix reached accepted actions and each kind of refusal.
  const total = Object.values(result.counts).reduce((sum, n) => sum + n, 0);
  expect(total).toBe(500);
  expect(result.counts.none ?? 0).toBe(0);
  for (const reason of ['ok', 'reach', 'occupied', 'unbreakable', 'invalid']) {
    expect(result.counts[reason] ?? 0, reason).toBeGreaterThan(5);
  }
  expect(result.counts.ok).toBeGreaterThan(100);
  if (result.heapBefore !== null && result.heapAfter !== null) {
    expect(result.heapAfter - result.heapBefore).toBeLessThan(50 * 1024 * 1024);
  }

  await page.reload();
  await page.waitForFunction(() => window.__mc !== undefined && window.__mc.isReady());
  const after = await page.evaluate((origin) => {
    const blocks: number[] = [];
    for (let y = origin.y - 8; y <= origin.y + 4; y++) {
      for (let z = origin.z - 7; z <= origin.z + 7; z++) {
        for (let x = origin.x - 7; x <= origin.x + 7; x++) {
          blocks.push(window.__mc.getBlock(x, y, z));
        }
      }
    }
    return { blocks, state: window.__mc.getState() };
  }, result.origin);
  expect(after.blocks.length).toBe(13 * 15 * 15);
  expect(after.blocks).toEqual(result.blocks);
  // The world really changed: placed blocks stand where the terrain has air.
  expect(new Set(result.blocks).size).toBeGreaterThan(6);
  expect(after.state.selectedSlot).toBe(result.state.selectedSlot);
  expect(after.state.player.mode).toBe('fly');
});
