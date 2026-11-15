// Scenes for light tests, built with the direct `setBlock` tool at fixed places of the
// test world (Phase 4 plan 6.3): a tunnel, a closed room with a window, a roof.
import type { Page } from '@playwright/test';
import { type Image, type Region, meanLuminance } from './helpers';

const STONE = 3;
const BRICKS = 8;
const GLASS = 9;

/** Height of the scenes that are built in the air, far above the terrain. */
export const SCENE_Y = 110;

export interface Tunnel {
  /** The pit cell in front of the mouth; the tunnel's cells are `mouth + i × dir`, i = 1..20. */
  mouth: { x: number; z: number };
  dir: { x: number; z: number };
  /** Y of the floor blocks; the tunnel is the two cells above. */
  floorY: number;
  /** Yaw that looks into the tunnel. */
  yaw: number;
}

export const TUNNEL_LENGTH = 20;

/**
 * Digs a tunnel, 1 wide, 2 high and 20 long, into the ground near the start point, at the
 * place where the pit in front of its mouth has to be least deep (a hillside if there is
 * one). The pit is open to the sky; floor, walls, roof and end of the tunnel are solid.
 */
export function buildTunnel(page: Page): Promise<Tunnel> {
  return page.evaluate(
    async ([length, stone]) => {
      const mc = window.__mc;
      const start = mc.getState().player;
      const sx = Math.floor(start.x);
      const sz = Math.floor(start.z);
      const R = 34;
      const size = 2 * R + 1;
      const heights = new Int16Array(size * size);
      for (let dz = -R; dz <= R; dz++) {
        for (let dx = -R; dx <= R; dx++) {
          heights[dx + R + (dz + R) * size] = mc.surfaceY(sx + dx, sz + dz);
        }
      }
      const h = (x: number, z: number) => heights[x - sx + R + (z - sz + R) * size];
      const dirs: [number, number, number][] = [
        [0, -1, 0],
        [0, 1, Math.PI],
        [1, 0, -Math.PI / 2],
        [-1, 0, Math.PI / 2],
      ];
      let best: {
        x: number;
        z: number;
        dx: number;
        dz: number;
        yaw: number;
        floorY: number;
      } | null = null;
      let bestDepth = Infinity;
      for (const [dx, dz, yaw] of dirs) {
        for (let oz = -10; oz <= 10; oz++) {
          for (let ox = -10; ox <= 10; ox++) {
            const x = sx + ox;
            const z = sz + oz;
            // The lowest ground over the tunnel and its walls decides how deep it must lie.
            let lowest = Infinity;
            for (let i = 1; i <= length + 1; i++) {
              for (let side = -1; side <= 1; side++) {
                lowest = Math.min(lowest, h(x + dx * i + dz * side, z + dz * i + dx * side));
              }
            }
            // A column that is not loaded has no height: no tunnel there.
            if (lowest < 8) continue;
            const floorY = lowest - 3;
            let solid = true;
            for (let i = 1; i <= length + 1 && solid; i++) {
              for (let side = -1; side <= 1 && solid; side++) {
                for (let y = floorY; y <= floorY + 3 && solid; y++) {
                  const id = mc.getBlock(x + dx * i + dz * side, y, z + dz * i + dx * side);
                  solid = id !== 0 && id !== 6 && id !== 9 && id !== 10;
                }
              }
            }
            if (!solid) continue;
            let depth = 0;
            for (let i = -2; i <= 0; i++) {
              for (let side = -1; side <= 1; side++) {
                depth = Math.max(depth, h(x + dx * i + dz * side, z + dz * i + dx * side) - floorY);
              }
            }
            if (depth < bestDepth) {
              bestDepth = depth;
              best = { x, z, dx, dz, yaw, floorY };
            }
          }
        }
      }
      if (!best) throw new Error('no place for a tunnel near the start point');
      const { x, z, dx, dz, yaw, floorY } = best;
      for (let i = -2; i <= 0; i++) {
        for (let side = -1; side <= 1; side++) {
          const cx = x + dx * i + dz * side;
          const cz = z + dz * i + dx * side;
          mc.setBlock(cx, floorY, cz, stone);
          for (let y = floorY + 1; y < 128; y++)
            if (mc.getBlock(cx, y, cz) !== 0) mc.setBlock(cx, y, cz, 0);
        }
      }
      for (let i = 1; i <= length; i++) {
        mc.setBlock(x + dx * i, floorY, z + dz * i, stone);
        mc.setBlock(x + dx * i, floorY + 1, z + dz * i, 0);
        mc.setBlock(x + dx * i, floorY + 2, z + dz * i, 0);
      }
      await mc.whenIdle();
      return { mouth: { x, z }, dir: { x: dx, z: dz }, floorY, yaw };
    },
    [TUNNEL_LENGTH, STONE],
  );
}

/** Puts the player into the pit, one cell in front of the mouth, looking into the tunnel. */
export async function lookIntoTunnel(page: Page, tunnel: Tunnel): Promise<void> {
  await page.evaluate(async (t) => {
    window.__mc.setPlayer({
      x: t.mouth.x - t.dir.x + 0.5,
      y: t.floorY + 1,
      z: t.mouth.z - t.dir.z + 0.5,
      yaw: t.yaw,
      pitch: 0,
      mode: 'walk',
    });
    window.__mc.step(2);
    await window.__mc.whenIdle();
  }, tunnel);
}

/** Vertical field of view of the test view (75°) as the distance of the image plane in pixels. */
const FOCAL = 270 / Math.tan((37.5 * Math.PI) / 180);
const EYE = 1.62;

/** A small patch of the tunnel's floor, `distance` blocks in front of the eye. */
export function floorPatch(distance: number): Region {
  const halfWidth = Math.max(2, Math.floor((0.3 * FOCAL) / distance));
  const y = Math.round(270 + (FOCAL * EYE) / distance);
  return { x: 480 - halfWidth, y: y - 2, width: 2 * halfWidth, height: 5 };
}

/** Mean brightness of a region as linear light, 0..1 (pixel values are gamma-encoded). */
export function linearBrightness(image: Image, region?: Region): number {
  return (meanLuminance(image, region) / 255) ** 2.2;
}

export interface Room {
  /** Centre column of the room and y of its floor blocks. */
  x: number;
  y: number;
  z: number;
  window: { x: number; y: number; z: number };
}

/**
 * Builds a room of bricks, 5 × 5 × 3 inside, in the air near the start point. Its wall at
 * -z has a window cell (still bricks). A chunk border runs through the room, one cell
 * behind that wall, and the window is no border cell itself: opening it changes the light
 * of the next chunk too.
 */
export function buildRoom(page: Page): Promise<Room> {
  return page.evaluate(
    async ([y, bricks]) => {
      const mc = window.__mc;
      const start = mc.getState().player;
      const x = Math.floor(start.x / 16) * 16 + 5;
      const z = Math.floor(start.z / 16) * 16 + 1;
      for (let dy = 0; dy <= 4; dy++) {
        for (let dz = -3; dz <= 3; dz++) {
          for (let dx = -3; dx <= 3; dx++) {
            const shell = dy === 0 || dy === 4 || Math.abs(dx) === 3 || Math.abs(dz) === 3;
            mc.setBlock(x + dx, y + dy, z + dz, shell ? bricks : 0);
          }
        }
      }
      mc.setPlayer({ x: x + 0.5, y: y + 1, z: z + 0.5, yaw: 0, pitch: 0, mode: 'walk' });
      mc.step(2);
      await mc.whenIdle();
      return { x, y, z, window: { x, y: y + 2, z: z - 3 } };
    },
    [SCENE_Y, BRICKS],
  );
}

/** Takes the roof of the room away or puts it back. */
export function setRoomRoof(page: Page, room: Room, closed: boolean): Promise<void> {
  return page.evaluate(
    async ([x, y, z, id]) => {
      for (let dz = -2; dz <= 2; dz++) {
        for (let dx = -2; dx <= 2; dx++) window.__mc.setBlock(x + dx, y + 4, z + dz, id);
      }
      await window.__mc.whenIdle();
    },
    [room.x, room.y, room.z, closed ? BRICKS : 0],
  );
}

export function setWindow(page: Page, room: Room, glass: boolean): Promise<void> {
  return page.evaluate(
    async ([x, y, z, id]) => {
      window.__mc.setBlock(x, y, z, id);
      await window.__mc.whenIdle();
    },
    [room.window.x, room.window.y, room.window.z, glass ? GLASS : BRICKS],
  );
}

/** The part of the view inside the room that shows floor and walls only, not the sky. */
export const ROOM_VIEW: Region = { x: 0, y: 216, width: 960, height: 324 };

/**
 * Builds a stone floor of 21 × 21 around the corner of four chunks next to the start
 * point, a roof of 9 × 9 planks three blocks above it, and puts the camera under the
 * roof, right above the corner, looking straight down. The chunk border along x runs down
 * the middle column of the picture, the one along z across its middle row.
 */
export function buildRoof(page: Page): Promise<{ x: number; z: number }> {
  return page.evaluate(
    async ([y, stone]) => {
      const mc = window.__mc;
      const start = mc.getState().player;
      const x = Math.round(start.x / 16) * 16;
      const z = Math.round(start.z / 16) * 16;
      for (let dz = -10; dz <= 10; dz++) {
        for (let dx = -10; dx <= 10; dx++) {
          mc.setBlock(x + dx, y, z + dz, stone);
          if (Math.abs(dx) <= 4 && Math.abs(dz) <= 4) mc.setBlock(x + dx, y + 4, z + dz, 7);
        }
      }
      mc.setPlayer({ x, y: y + 3.6 - 1.62, z, yaw: 0, pitch: (-89 * Math.PI) / 180, mode: 'fly' });
      await mc.whenIdle();
      return { x, z };
    },
    [SCENE_Y, STONE],
  );
}
