// Poses of generator 3's reference pictures (Phase 8 part B2a), worked out from the terrain.
import { walkTo, type Cell } from '../bot/walk';
import { getTerrain } from '../world/generation/terrain';
import { TerrainV3, caveSites } from '../world/generation/terrainV3';
import type { WorldGen } from '../world/generation/worldOptions';
import { Block } from '../world/blocks';
import { standingBelow } from '../bot/caveWalks';
import { generatedWalkWorld } from './walkWorld';

export interface ViewPose {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
}

/** Eye height above the feet (the player's camera). */
const EYE = 1.6;

/** The yaw and pitch that look from one point at another (forward is -sin yaw, -cos yaw). */
export function lookAt(
  from: { x: number; y: number; z: number },
  to: { x: number; y: number; z: number },
): { yaw: number; pitch: number } {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dz = to.z - from.z;
  return { yaw: Math.atan2(-dx, -dz), pitch: Math.atan2(dy, Math.hypot(dx, dz)) };
}

/**
 * Inside the entrance nearest the spawn: feet on the way down from the mouth, looking
 * further down the tunnel at a cell where a torch is placed; the mouth lies behind.
 */
export function tunnelView(seed: number, gen: WorldGen): { pose: ViewPose; torch: Cell } {
  const terrain = getTerrain(seed, gen);
  if (!(terrain instanceof TerrainV3)) throw new Error('not a generator 3 world');
  const sites = caveSites(terrain);
  if (!sites.entrance) throw new Error('no entrance');
  const { walk } = generatedWalkWorld(seed, gen);
  const { mouth, end } = sites.entrance;
  const start = standingBelow(walk, mouth.x, mouth.y + 2, mouth.z);
  if (!start) throw new Error('no mouth');
  const path: Cell[] = [];
  walkTo(walk, start, (x, y, z) => x === end.x && z === end.z && Math.abs(y - end.y) <= 3, {
    path,
    allowed: (x, y, z) => terrain.carved(x, y, z),
  });
  // The first place well down the tunnel whose torch cell, four steps on, is in sight.
  const clear = (a: Cell, b: { x: number; y: number; z: number }): boolean => {
    const from = { x: a.x + 0.5, y: a.y + EYE, z: a.z + 0.5 };
    for (let t = 0.05; t < 0.95; t += 0.05) {
      const x = Math.floor(from.x + (b.x - from.x) * t);
      const y = Math.floor(from.y + (b.y - from.y) * t);
      const z = Math.floor(from.z + (b.z - from.z) * t);
      if (walk.block(x, y, z) !== 0) return false;
    }
    return true;
  };
  for (let i = 16; i + 4 < path.length; i++) {
    const feet = path[i];
    const torch = path[i + 4];
    const target = { x: torch.x + 0.5, y: torch.y + 0.5, z: torch.z + 0.5 };
    if (!clear(feet, target)) continue;
    const eye = { x: feet.x + 0.5, y: feet.y + EYE, z: feet.z + 0.5 };
    return { pose: { ...eye, y: feet.y, ...lookAt(eye, target) }, torch };
  }
  throw new Error('no view down the tunnel');
}

/** On the spawn shaft's collar, looking down its well at the stairs. */
export function shaftView(seed: number, gen: WorldGen): ViewPose {
  const terrain = getTerrain(seed, gen);
  if (!(terrain instanceof TerrainV3)) throw new Error('not a generator 3 world');
  const shaft = caveSites(terrain).shaft;
  if (!shaft) throw new Error('no shaft');
  // Above the log column, looking straight down the well: the steps wind around it.
  const top = shaft.top.y - 1;
  return { x: shaft.x + 0.5, y: top + 6, z: shaft.z + 0.5, yaw: 0, pitch: -89 * (Math.PI / 180) };
}

/**
 * Inside the ravine nearest the spawn, looking at the exposed ore of its wall that lies
 * highest (seen from the floor's side, a few blocks away), or down along it if none shows.
 */
export function ravineView(seed: number, gen: WorldGen): ViewPose {
  const terrain = getTerrain(seed, gen);
  if (!(terrain instanceof TerrainV3)) throw new Error('not a generator 3 world');
  const sites = caveSites(terrain);
  const ravine = sites.ravine;
  if (!ravine) throw new Error('no ravine');
  const shape = terrain.caves
    .shapesIn(ravine.floor.x, ravine.floor.z, ravine.floor.x, ravine.floor.z)
    .find((r) => r.kind === 'ravine');
  if (!shape) throw new Error('no ravine shape');
  const { walk } = generatedWalkWorld(seed, gen);
  const isOre = (id: number): boolean => id === Block.COAL_ORE || id === Block.IRON_ORE;
  let best: { ore: Cell; air: Cell } | null = null;
  for (let s = 0; s < shape.count; s++) {
    const x = shape.spans[s * 4];
    const z = shape.spans[s * 4 + 1];
    for (let y = shape.spans[s * 4 + 2]; y <= shape.spans[s * 4 + 3]; y++) {
      for (const [dx, dz] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        if (!isOre(walk.block(x + dx, y, z + dz))) continue;
        if (!best || y > best.ore.y) best = { ore: { x: x + dx, y, z: z + dz }, air: { x, y, z } };
      }
    }
  }
  if (!best) throw new Error('no ore in the ravine walls');
  const { ore, air } = best;
  const away = { x: air.x - ore.x, z: air.z - ore.z };
  // Back from the wall while the cells stay open, then a little up.
  let steps = 0;
  while (steps < 4) {
    const nx = air.x + away.x * (steps + 1);
    const nz = air.z + away.z * (steps + 1);
    if (walk.block(nx, air.y + 2, nz) !== 0 || walk.block(nx, air.y + 3, nz) !== 0) break;
    steps++;
  }
  const x = air.x + away.x * steps + 0.5;
  const z = air.z + away.z * steps + 0.5;
  const y = air.y + 2;
  return {
    x,
    y,
    z,
    ...lookAt({ x, y: y + EYE, z }, { x: ore.x + 0.5, y: ore.y + 0.5, z: ore.z + 0.5 }),
  };
}
