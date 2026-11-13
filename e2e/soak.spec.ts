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
