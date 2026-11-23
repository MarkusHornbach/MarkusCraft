// Light in the browser (Phase 4 part A): the stored light, the invariant, the picture.
import { LIGHT_CHECKSUM_1337_V1 } from '../src/testing/lightChecksum';
import { Block } from '../src/world/blocks';
import type { Page } from '@playwright/test';
import { test, expect } from './fixtures';
import {
  DEG,
  createWorld,
  getState,
  openGame,
  openMenu,
  pauseWithMouse,
  setPlayer,
  step,
  whenIdle,
} from './game';
import { capture, meanLuminance } from './helpers';
import {
  ROOM_VIEW,
  SCENE_Y,
  TUNNEL_LENGTH,
  buildRoof,
  buildRoom,
  buildTunnel,
  floorPatch,
  linearBrightness,
  lookIntoTunnel,
  setRoomRoof,
  setWindow,
} from './lightScenes';
import { findSites } from './sites';

/**
 * Mean brightness (0..255) of the lower half of three views, measured on the build before
 * light reached the picture (commit of Phase 4 step 2). Open ground must stay as it was.
 */
const BEFORE_LIGHT = { spawnNoon: 81.986, overviewNoon: 109.972, overviewMidnight: 18.84 };

test('the browser lights the world as Node does (Phase 4 AC2.7)', async ({ page }) => {
  await openGame(page);
  const state = await getState(page);
  expect(state.chunks.loaded).toBe(81);
  expect(state.chunks.lit).toBe(121);
  expect(state.chunks.generated).toBe(169);
  expect(state.chunks.relight).toBe(0);
  expect(await page.evaluate(() => window.__mc.lightChecksum())).toBe(LIGHT_CHECKSUM_1337_V1);
  expect(await page.evaluate(() => window.__mc.verifyLight())).toBe(0);
  // Open sky above the start point, nothing inside the ground, null where nothing is lit.
  const { player } = state;
  const light = (x: number, y: number, z: number) =>
    page.evaluate(([lx, ly, lz]) => window.__mc.getLight(lx, ly, lz), [x, y, z]);
  expect(await light(player.x, 120, player.z)).toEqual({ sky: 15, block: 0 });
  expect(await light(player.x, 3, player.z)).toEqual({ sky: 0, block: 0 });
  expect(await light(player.x + 5000, 60, player.z)).toBeNull();
});

test('light stays correct through ten teleports (Phase 4 AC2.7, AC5.4)', async ({ page }) => {
  test.setTimeout(180_000);
  await openGame(page);
  const fresh = await getState(page);
  const { player } = fresh;
  for (let i = 1; i <= 10; i++) {
    await setPlayer(page, {
      x: player.x + 64 * i,
      y: 100,
      z: player.z + (i % 2) * 64,
      mode: 'fly',
    });
  }
  const state = await getState(page);
  expect(state.chunks.loaded).toBe(81);
  expect(state.chunks.pending).toBe(0);
  expect(state.chunks.relight).toBe(0);
  expect(state.chunks.lit).toBeGreaterThanOrEqual(121);
  expect(state.chunks.generated).toBe(169);
  expect(await page.evaluate(() => window.__mc.verifyLight())).toBe(0);
  // Back at the start nothing of the places in between is left: the count of geometries
  // is that of a fresh load (how many a place has depends on its water and trees).
  await setPlayer(page, { x: player.x, y: player.y, z: player.z });
  const back = await getState(page);
  expect(back.render.geometries).toBeLessThanOrEqual(fresh.render.geometries * 1.1);
  expect(back.chunks.meshed).toBe(81);
});

test('100 edits that change light leave the light right and the memory steady (Phase 4 AC5.4)', async ({
  page,
}) => {
  await openGame(page);
  const result = await page.evaluate(async (y) => {
    const mc = window.__mc;
    const heap = (): number | null => {
      const memory = (performance as { memory?: { usedJSHeapSize: number } }).memory;
      return memory ? memory.usedJSHeapSize : null;
    };
    const start = mc.getState().player;
    const x0 = Math.floor(start.x / 16) * 16 + 10;
    const z0 = Math.floor(start.z / 16) * 16 + 10;
    const before = heap();
    // A roof of 10 × 10 over the corner of four chunks, block by block, and away again.
    let frames = 0;
    for (const id of [7, 0]) {
      for (let i = 0; i < 100; i++) {
        mc.setBlock(x0 + (i % 10), y, z0 + Math.floor(i / 10), id);
        if (i % 10 === 9) {
          await mc.whenIdle();
          frames++;
        }
      }
    }
    await mc.whenIdle();
    return { before, after: heap(), frames, wrong: mc.verifyLight(), state: mc.getState() };
  }, SCENE_Y);
  expect(result.wrong).toBe(0);
  expect(result.state.chunks.relight).toBe(0);
  expect(result.state.chunks.loaded).toBe(81);
  if (result.before !== null && result.after !== null) {
    // For the report: the heap after loading at render distance 4 and after the edits.
    console.log(
      `heap after loading: ${(result.before / 1048576).toFixed(1)} MB, after 200 edits with ` +
        `light changes: ${(result.after / 1048576).toFixed(1)} MB`,
    );
    expect(result.after - result.before).toBeLessThan(50 * 1024 * 1024);
  }
});

test('an edit on a chunk corner meshes its own chunk at once, the other three later (Phase 4E AC1.4)', async ({
  page,
}) => {
  await openGame(page);
  const result = await page.evaluate(async (bricks) => {
    const mc = window.__mc;
    const counts: number[] = [];
    // Placed and broken high in the air on the corner of chunks (-1, -1), (0, -1), (-1, 0)
    // and (0, 0): no frame runs between the edit and the reading.
    for (const id of [bricks, 0]) {
      mc.setBlock(-1, 120, -1, id);
      counts.push(mc.getState().chunks.relight);
      await mc.whenIdle();
      counts.push(mc.getState().chunks.relight);
    }
    return { counts, wrong: mc.verifyLight(), block: mc.getBlock(-1, 120, -1) };
  }, Block.BRICKS);
  expect(result.counts).toEqual([3, 0, 3, 0]);
  expect(result.wrong).toBe(0);
  expect(result.block).toBe(0);
});

// Written by the game as of Phase 3 part C: a Gathering world with items that are no
// blocks, and edits in three chunks (a row of bricks in the air in each).
const PART_C_META = {
  id: 'wpartc-fixture1',
  name: 'Part C world',
  seed: 1337,
  mode: 'gathering',
  generatorVersion: 1,
  formatVersion: 1,
  createdMs: 1790000000000,
  playedMs: 1790000360000,
  time: 0.25,
  pose: { x: 8.5, y: 101, z: 8.5, yaw: 0.5, pitch: -0.25 },
  moveMode: 'walk',
  player: {
    slots: [
      { item: 263, count: 1 },
      { item: 256, count: 12 },
      { item: 3, count: 40 },
      ...Array.from({ length: 33 }, () => null),
    ],
    selectedSlot: 0,
    breaking: null,
  },
};
/** Bricks at y = 100 along x = 4..12 of a chunk, at z = 8: index x + z * 16 + y * 256. */
const BRICK_ROW = Array.from({ length: 9 }, (_, i) => [4 + i + 8 * 16 + 100 * 256, 8]).flat();
const PART_C_CHUNKS = [
  [0, 0],
  [1, 0],
  [0, -1],
].map(([cx, cz]) => ({
  key: `wpartc-fixture1|${cx},${cz}`,
  worldId: 'wpartc-fixture1',
  cx,
  cz,
  edits: BRICK_ROW,
}));

test('a world stored by Phase 3 opens as it was, with light, and is written back unchanged (Phase 4 AC5.2)', async ({
  page,
}) => {
  const records = (): Promise<{ worlds: unknown[]; chunks: unknown[] }> =>
    page.evaluate(
      () =>
        new Promise((resolve, reject) => {
          const open = indexedDB.open('markuscraft');
          open.onerror = () => reject(new Error('open failed'));
          open.onsuccess = () => {
            const tx = open.result.transaction(['worlds', 'chunks']);
            const worlds = tx.objectStore('worlds').getAll();
            const chunks = tx.objectStore('chunks').getAll();
            tx.oncomplete = () => {
              open.result.close();
              resolve({ worlds: worlds.result, chunks: chunks.result });
            };
          };
        }),
    );
  // Any stored world creates the database; then the old records are written into it.
  await openGame(page, { save: true, world: 'Other' });
  await page.evaluate(
    ([meta, chunks]) =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('markuscraft');
        open.onerror = () => reject(new Error('open failed'));
        open.onsuccess = () => {
          const tx = open.result.transaction(['worlds', 'chunks'], 'readwrite');
          tx.objectStore('worlds').put(meta);
          for (const chunk of chunks) tx.objectStore('chunks').put(chunk);
          tx.oncomplete = () => {
            open.result.close();
            resolve();
          };
          tx.onerror = () => reject(new Error('write failed'));
        };
      }),
    [PART_C_META, PART_C_CHUNKS] as const,
  );
  await openGame(page, { save: true, world: 'Part C world' });
  const state = await getState(page);
  expect(state.world).toEqual({ id: 'wpartc-fixture1', name: 'Part C world', generatorVersion: 1 });
  expect(state.mode).toBe('gathering');
  expect(state.inventory.slots.slice(0, 3)).toEqual(PART_C_META.player.slots.slice(0, 3));
  // Its edits are there, and they cast their shade: under the bricks the sky light is less.
  for (const [cx, cz] of [
    [0, 0],
    [1, 0],
    [0, -1],
  ]) {
    for (let x = 4; x <= 12; x++) {
      expect(
        await page.evaluate(
          ([bx, bz]) => window.__mc.getBlock(bx, 100, bz),
          [cx * 16 + x, cz * 16 + 8],
        ),
      ).toBe(8);
    }
    expect(await light(page, cx * 16 + 8, 100, cz * 16 + 8)).toEqual({ sky: 0, block: 0 });
    expect(await light(page, cx * 16 + 8, 99, cz * 16 + 8)).toEqual({ sky: 14, block: 0 });
    expect(await light(page, cx * 16 + 8, 101, cz * 16 + 8)).toEqual({ sky: 15, block: 0 });
  }
  expect(await page.evaluate(() => window.__mc.verifyLight())).toBe(0);

  // Something changes (the time of day), the world is saved: nothing about light is
  // in the records.
  await page.evaluate(async () => {
    window.__mc.setTime(0.3);
    await window.__mc.save();
  });
  const stored = await records();
  const meta = stored.worlds.find((w) => (w as { id: string }).id === 'wpartc-fixture1') as Record<
    string,
    unknown
  >;
  // Saved again, the record is migrated to the current format (3; Phase 6 part C added
  // the empty list of guests; a generator 1 world has no options).
  expect(Object.keys(meta).sort()).toEqual([...Object.keys(PART_C_META), 'guests'].sort());
  expect(meta.formatVersion).toBe(3);
  expect(meta.guests).toEqual([]);
  expect(meta.generatorVersion).toBe(1);
  expect(meta.time).toBeCloseTo(0.3, 9);
  expect(meta.player).toEqual(PART_C_META.player);
  const chunks = stored.chunks.filter(
    (c) => (c as { worldId: string }).worldId === 'wpartc-fixture1',
  );
  // The store hands the records out in the order of their keys.
  const byKey = (a: unknown, b: unknown) =>
    (a as { key: string }).key < (b as { key: string }).key ? -1 : 1;
  expect(chunks.sort(byKey)).toEqual([...PART_C_CHUNKS].sort(byKey));
});

const light = (page: Page, x: number, y: number, z: number) =>
  page.evaluate(([lx, ly, lz]) => window.__mc.getLight(lx, ly, lz), [x, y, z]);

test('a tunnel gets dark step by step, also at noon (Phase 4 AC3.5)', async ({ page }) => {
  await openGame(page);
  const tunnel = await buildTunnel(page);
  // The stored light: full in the pit, one level less per block, nothing from block 15 on.
  expect((await light(page, tunnel.mouth.x, tunnel.floorY + 1, tunnel.mouth.z))?.sky).toBe(15);
  for (let i = 1; i <= TUNNEL_LENGTH; i++) {
    for (const dy of [1, 2]) {
      const cell = await light(
        page,
        tunnel.mouth.x + tunnel.dir.x * i,
        tunnel.floorY + dy,
        tunnel.mouth.z + tunnel.dir.z * i,
      );
      expect(cell, `cell ${i}`).toEqual({ sky: Math.max(0, 15 - i), block: 0 });
    }
  }
  expect(await page.evaluate(() => window.__mc.verifyLight())).toBe(0);

  await lookIntoTunnel(page, tunnel);
  const image = await capture(page);
  // Five strips of the floor, from the mouth inwards (distances from the eye in blocks).
  const strips = [3.3, 4.5, 6.5, 9.5, 15.5].map((d) => linearBrightness(image, floorPatch(d)));
  for (let i = 1; i < strips.length; i++) expect(strips[i]).toBeLessThan(strips[i - 1]);
  expect(strips[4]).toBeLessThan(strips[0] * 0.1);
  expect(strips[0]).toBeGreaterThan(0.02);
  await expect(page).toHaveScreenshot('tunnel-day.png');
});

test('a closed room is dark and a window lets light in (Phase 4 AC3.7)', async ({ page }) => {
  await openGame(page);
  const room = await buildRoom(page);
  const closed = meanLuminance(await capture(page), ROOM_VIEW);
  expect(await light(page, room.x, room.y + 1, room.z)).toEqual({ sky: 0, block: 0 });

  // The same view without the roof is the open-ground value.
  await setRoomRoof(page, room, false);
  const open = meanLuminance(await capture(page), ROOM_VIEW);
  expect((await light(page, room.x, room.y + 1, room.z))?.sky).toBe(15);
  expect(closed).toBeLessThan(open * 0.12);
  expect(closed).toBeGreaterThan(open * 0.05);

  await setRoomRoof(page, room, true);
  await setWindow(page, room, true);
  const withWindow = meanLuminance(await capture(page), ROOM_VIEW);
  expect(withWindow).toBeGreaterThan(closed * 3);
  expect(withWindow).toBeLessThan(open);
  // Full light outside, 14 in the glass, 13 in the first cell of the room.
  const { x, y, z } = room.window;
  expect((await light(page, x, y, z - 1))?.sky).toBe(15);
  expect((await light(page, x, y, z))?.sky).toBe(14);
  expect((await light(page, x, y, z + 1))?.sky).toBe(13);
  expect((await light(page, x, y, z + 5))?.sky).toBe(9);
  expect(await page.evaluate(() => window.__mc.verifyLight())).toBe(0);
  await expect(page).toHaveScreenshot('room-window.png');
});

test('the shade under a roof has no step along chunk borders (Phase 4 AC3.8)', async ({ page }) => {
  await openGame(page);
  const corner = await buildRoof(page);
  // The floor is in the shade, darkest under the middle of the roof.
  expect((await light(page, corner.x, SCENE_Y + 1, corner.z))?.sky).toBe(10);
  expect((await light(page, corner.x + 4, SCENE_Y + 1, corner.z))?.sky).toBe(14);
  expect((await light(page, corner.x + 5, SCENE_Y + 1, corner.z))?.sky).toBe(15);
  const image = await capture(page);
  // Brightness per pixel column over the upper rows (the border along x is column 480),
  // and per pixel row over the left columns (the border along z is near row 270). Both
  // keep clear of the crosshair, the outline of the targeted block and the bar.
  const columns: number[] = [];
  for (let x = 0; x < 960; x++) {
    columns.push(meanLuminance(image, { x, y: 10, width: 1, height: 110 }));
  }
  const rows: number[] = [];
  for (let y = 100; y < 440; y++) {
    rows.push(meanLuminance(image, { x: 10, y, width: 320, height: 1 }));
  }
  const steps = (values: number[]) => values.slice(1).map((v, i) => Math.abs(v - values[i]));
  const largest = (values: number[]) => values.reduce((a, b) => Math.max(a, b), 0);
  const columnSteps = steps(columns);
  const atBorderX = largest(columnSteps.slice(470, 490));
  const elsewhereX = largest([...columnSteps.slice(0, 470), ...columnSteps.slice(490)]);
  expect(atBorderX).toBeLessThanOrEqual(elsewhereX);
  const rowSteps = steps(rows);
  // Row 270 of the picture is entry 170 here.
  const atBorderZ = largest(rowSteps.slice(155, 185));
  const elsewhereZ = largest([...rowSteps.slice(0, 155), ...rowSteps.slice(185)]);
  expect(atBorderZ).toBeLessThanOrEqual(elsewhereZ);
  // The shade is real: the middle of the picture is darker than its left and right edge.
  expect(columns[480]).toBeLessThan(columns[5] * 0.9);
  expect(columns[480]).toBeLessThan(columns[954] * 0.9);
});

test('light that an edit changes in the next chunk follows within eight frames (Phase 4 AC3.9)', async ({
  page,
}) => {
  await openGame(page);
  const room = await buildRoom(page);
  const before = meanLuminance(await capture(page), ROOM_VIEW);
  const result = await page.evaluate(
    async ([x, y, z]) => {
      const mc = window.__mc;
      mc.setBlock(x, y, z, 9);
      const queued = mc.getState().chunks.relight;
      let frames = 0;
      while (mc.getState().chunks.relight > 0 && frames < 100) {
        await new Promise((resolve) => requestAnimationFrame(resolve));
        frames++;
      }
      return { queued, frames };
    },
    [room.window.x, room.window.y, room.window.z],
  );
  // The window's own chunk was remeshed at once; the chunk the room lies in had to wait.
  expect(result.queued).toBeGreaterThanOrEqual(1);
  expect(result.frames).toBeLessThanOrEqual(8);
  await page.evaluate(() => window.__mc.whenIdle());
  // The floor at the player's feet lies across the border from the window.
  expect(Math.floor(room.window.z / 16)).not.toBe(Math.floor(room.z / 16));
  expect((await light(page, room.x, room.y + 1, room.z))?.sky).toBe(10);
  expect(meanLuminance(await capture(page), ROOM_VIEW)).toBeGreaterThan(before * 3);
});

test('open ground is as bright as before light at noon; darker at midnight since Part B (Phase 4 AC3.6, AC3.10, AC8.2)', async ({
  page,
}) => {
  const lowerHalf = async () => {
    const image = await capture(page);
    return meanLuminance(image, { x: 0, y: 270, width: 960, height: 270 });
  };
  // The pose of the reference `overview-noon`: 30 blocks above the start point.
  const overview = async () => {
    const { player } = await getState(page);
    await setPlayer(page, { y: player.y + 30, yaw: -90 * DEG, pitch: -30 * DEG, mode: 'fly' });
  };
  await openGame(page);
  expect(Math.abs((await lowerHalf()) / BEFORE_LIGHT.spawnNoon - 1)).toBeLessThan(0.04);
  await overview();
  expect(Math.abs((await lowerHalf()) / BEFORE_LIGHT.overviewNoon - 1)).toBeLessThan(0.04);
  // The night of Part A (25 % daylight) was pinned here; Part B lowers it to 10 %, and
  // the default Brightness floor (11 %) decides. AC8.2 (e2e/night.spec.ts) pins the ratio.
  await openGame(page, { time: 0.75 });
  await overview();
  const midnight = await lowerHalf();
  expect(midnight).toBeLessThan(BEFORE_LIGHT.overviewMidnight * 0.75);
  expect(midnight).toBeGreaterThan(BEFORE_LIGHT.overviewMidnight * 0.3);
});

test('the shade under a tree (reference tree-shade)', async ({ page }) => {
  await openGame(page);
  const { tree } = await findSites(page);
  await setPlayer(page, {
    x: tree.stand.x + 0.5,
    y: tree.stand.y,
    z: tree.stand.z + 0.5,
    yaw: tree.yaw + 1.5,
    pitch: -12 * DEG,
    mode: 'walk',
  });
  await step(page, 2);
  await whenIdle(page);
  // Under the leaves the sky light is below full, but far from dark.
  const feet = await light(page, tree.stand.x, tree.stand.y, tree.stand.z);
  expect(feet?.sky).toBeGreaterThanOrEqual(9);
  expect(feet?.sky).toBeLessThan(15);
  await expect(page).toHaveScreenshot('tree-shade.png');
});

const SETTINGS_KEY = 'markuscraft.settings.v1';

async function setSlider(page: Page, id: string, value: number): Promise<void> {
  await page.locator(`#${id}`).evaluate((node, v) => {
    const input = node as HTMLInputElement;
    input.value = String(v);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }, value);
}

test('the Brightness slider lifts dark places only and is stored (Phase 4 AC4.2, AC4.3)', async ({
  page,
}) => {
  test.setTimeout(180_000);
  await openMenu(page);
  await createWorld(page, { seed: '1337' });
  await pauseWithMouse(page);
  await whenIdle(page);
  expect((await getState(page)).settings.brightness).toBe(0.5);
  await expect(page.locator('#setting-brightness')).toHaveValue('0.5');
  await expect(page.locator('label[for="setting-brightness"]')).toContainText('Brightness');
  await expect(page.locator('label[for="setting-brightness"] .setting-value')).toHaveText('50 %');

  // By mouse: a click at a quarter of the slider's length sets about 25 %.
  const box = await page.locator('#setting-brightness').boundingBox();
  if (!box) throw new Error('no slider');
  await page.mouse.click(box.x + box.width * 0.25, box.y + box.height / 2);
  const clicked = (await getState(page)).settings.brightness;
  expect(clicked).toBeGreaterThan(0.15);
  expect(clicked).toBeLessThan(0.35);

  // A tunnel at noon, seen through the paused game (the menu is taken out of the way).
  await page.evaluate(() => window.__mc.setTime(0.25));
  const tunnel = await buildTunnel(page);
  await lookIntoTunnel(page, tunnel);
  await page.locator('.pause-screen').evaluate((node) => {
    (node as HTMLElement).style.visibility = 'hidden';
  });
  const deep = {
    x: tunnel.mouth.x + tunnel.dir.x * 5,
    y: tunnel.floorY + 1,
    z: tunnel.mouth.z + tunnel.dir.z * 5,
  };
  const view = async (brightness: number) => {
    await setSlider(page, 'setting-brightness', brightness);
    await lookIntoTunnel(page, tunnel);
    const darkEnd = meanLuminance(await capture(page), floorPatch(15.5));
    // Open ground from above, next to the pit.
    await page.evaluate(async (t) => {
      window.__mc.setPlayer({
        x: t.mouth.x - 4 * t.dir.x + 0.5,
        y: t.floorY + 14,
        z: t.mouth.z - 4 * t.dir.z + 0.5,
        pitch: (-89 * Math.PI) / 180,
        mode: 'fly',
      });
      await window.__mc.whenIdle();
    }, tunnel);
    const image = await capture(page);
    const open = meanLuminance(image, { x: 0, y: 0, width: 960, height: 440 });
    const cell = await page.evaluate(
      ([x, y, z]) => window.__mc.getLight(x, y, z),
      [deep.x, deep.y, deep.z],
    );
    return { darkEnd, open, cell };
  };
  const low = await view(0);
  const high = await view(1);
  expect(high.darkEnd).toBeGreaterThanOrEqual(low.darkEnd * 3);
  expect(Math.abs(high.open / low.open - 1)).toBeLessThan(0.01);
  // The light itself does not change with the setting.
  expect(low.cell).toEqual({ sky: 10, block: 0 });
  expect(high.cell).toEqual(low.cell);
  expect(await page.evaluate(() => window.__mc.verifyLight())).toBe(0);

  // The value is stored and survives a reload.
  expect(
    await page.evaluate(
      (key) => JSON.parse(window.localStorage.getItem(key) ?? '{}'),
      SETTINGS_KEY,
    ),
  ).toMatchObject({ brightness: 1 });
  await page.reload();
  await page.waitForFunction(() => window.__mc !== undefined);
  await expect(page.locator('#setting-brightness')).toHaveValue('1');
  expect((await getState(page)).settings.brightness).toBe(1);
});

test('the game reports chunk work and frames; the debug overlay shows them (Phase 4 AC4.4)', async ({
  page,
}) => {
  await openGame(page);
  // A few frames more, so the numbers cover more than the loading.
  await page.evaluate(async () => {
    for (let i = 0; i < 20; i++) await new Promise((resolve) => requestAnimationFrame(resolve));
  });
  const { perf } = await getState(page);
  expect(perf.frames).toBeGreaterThanOrEqual(20);
  expect(perf.longFrames).toBeGreaterThanOrEqual(0);
  expect(perf.longFrames).toBeLessThanOrEqual(perf.frames);
  // Loading the world was chunk work: the largest frame shows it, the average is below it.
  expect(perf.chunkWorkMaxMs).toBeGreaterThan(0);
  expect(perf.chunkWorkAvgMs).toBeGreaterThan(0);
  expect(perf.chunkWorkAvgMs).toBeLessThanOrEqual(perf.chunkWorkMaxMs);

  await page.keyboard.press('F3');
  const value = (name: string) => page.locator(`[data-debug="${name}"]`);
  await expect(value('jobs')).toHaveText('169 generated, 121 lit, 81 meshed');
  await expect(value('work')).toHaveText(/^avg \d+\.\d ms, max \d+\.\d ms per frame$/);
  await expect(value('frames')).toHaveText(/^\d+ in 10 s, \d+ long$/);
  // The eye is in the open at the start point; inside the ground there is no light.
  await expect(value('light')).toHaveText('sky 15, block 0');
  const { player } = await getState(page);
  await setPlayer(page, { y: 20, mode: 'fly' });
  await expect(value('light')).toHaveText('sky 0, block 0');
  await setPlayer(page, { x: player.x + 5000, mode: 'fly' });
  await expect(value('jobs')).toHaveText(/^\d+ generated, \d+ lit, 162 meshed$/);
});
