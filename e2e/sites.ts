// Places near the start point of the test world, and breaking by a held mouse button.
import type { Page } from '@playwright/test';
import { step } from './game';

export interface Cell {
  x: number;
  y: number;
  z: number;
}

/** Holds the left mouse button on the crosshair for `steps` simulation steps. */
export async function holdBreak(page: Page, steps: number): Promise<void> {
  await page.mouse.move(480, 270);
  await page.mouse.down();
  await step(page, steps);
  await page.mouse.up();
  await step(page, 1);
}

/**
 * The nearest beach column, the nearest tree with a place to stand next to it, and the
 * nearest column of bare rock (three stone blocks from the surface down, open above).
 */
export function findSites(page: Page): Promise<{
  sand: Cell;
  tree: { log: Cell; stand: Cell; yaw: number };
  rock: Cell;
}> {
  return page.evaluate(() => {
    const mc = window.__mc;
    const start = mc.getState().player;
    const sx = Math.floor(start.x);
    const sz = Math.floor(start.z);
    let sand: { x: number; y: number; z: number; d: number } | null = null;
    let rock: { x: number; y: number; z: number; d: number } | null = null;
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
        if (
          id === 3 &&
          (!rock || d < rock.d) &&
          mc.getBlock(x, top - 1, z) === 3 &&
          mc.getBlock(x, top - 2, z) === 3 &&
          mc.getBlock(x, top + 1, z) === 0 &&
          mc.getBlock(x, top + 2, z) === 0
        ) {
          rock = { x, y: top, z, d };
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
    if (!sand || !tree || !rock) throw new Error('no beach, tree or rock near the start point');
    return { sand, tree, rock };
  });
}
