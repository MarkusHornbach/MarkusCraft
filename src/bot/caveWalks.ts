// The walk checks of generator 3's promises (Phase 8 part B2a, 6.7): entrances, ravines, shafts.
import { DARK_LIGHT } from './Bot';
import { type Cell, type WalkWorld, isStanding, walkTo } from './walk';
import type { CaveShape } from '../world/generation/caves';
import { SHAFT_HALF, type Shaft, shaftTopCell } from '../world/generation/shafts';

/** How far beside an entrance its walk may cross the surface. */
const SURFACE_MARGIN = 6;
/** Entrances reach at least this deep. */
export const ENTRANCE_DEPTH_Y = 30;

export interface WalkResult {
  /** Steps down to the goal and back up, null where the walk fails. */
  down: number | null;
  up: number | null;
}

/** The standing cell of a column nearest below `from` (up to `depth` cells down), or null. */
export function standingBelow(
  walk: WalkWorld,
  x: number,
  from: number,
  z: number,
  depth = 12,
): Cell | null {
  for (let y = from; y > from - depth; y--) if (isStanding(walk, x, y, z)) return { x, y, z };
  return null;
}

/** The cells of a shape: column key → [y0, y1, y0, y1, …]. */
function cellsOf(shape: CaveShape): (x: number, y: number, z: number) => boolean {
  const columns = new Map<string, number[]>();
  for (let s = 0; s < shape.count; s++) {
    const key = `${shape.spans[s * 4]},${shape.spans[s * 4 + 1]}`;
    let list = columns.get(key);
    if (!list) columns.set(key, (list = []));
    list.push(shape.spans[s * 4 + 2], shape.spans[s * 4 + 3]);
  }
  return (x, y, z) => {
    const list = columns.get(`${x},${z}`);
    if (!list) return false;
    for (let k = 0; k < list.length; k += 2) if (y >= list[k] && y <= list[k + 1]) return true;
    return false;
  };
}

/** What the walk of an entrance must know of the terrain besides the blocks. */
export interface CaveCells {
  /** Carved by any cave. */
  carved(x: number, y: number, z: number): boolean;
  /** Part of a mine shaft. */
  inShaft(x: number, y: number, z: number): boolean;
}

/**
 * An entrance from its mouth down to y ≤ 30 and back. It stands in its own cells or on
 * the open surface (a tunnel that comes out of a hillside goes on across the valley), never
 * in another cave or a shaft, so no other way down counts.
 */
export function walkEntrance(walk: WalkWorld, shape: CaveShape, cave: CaveCells): WalkResult {
  const own = cellsOf(shape);
  const allowed = (x: number, y: number, z: number): boolean =>
    own(x, y, z) || (!cave.carved(x, y, z) && !cave.inShaft(x, y, z));
  // Near the tunnel only: the surface beside it, not the whole country.
  const limits = {
    allowed,
    minX: shape.minX - SURFACE_MARGIN,
    maxX: shape.maxX + SURFACE_MARGIN,
    minZ: shape.minZ - SURFACE_MARGIN,
    maxZ: shape.maxZ + SURFACE_MARGIN,
  };
  const start = standingBelow(walk, shape.startX, shape.startY + 2, shape.startZ);
  if (!start) return { down: null, up: null };
  // Every deep cell reached; then the first of them (highest first) the mouth is reached from.
  const deep: Cell[] = [];
  walkTo(
    walk,
    start,
    (x, y, z) => {
      if (y <= ENTRANCE_DEPTH_Y) deep.push({ x, y, z });
      return false;
    },
    limits,
  );
  deep.sort((a, b) => b.y - a.y);
  for (const cell of deep) {
    const up = walkTo(
      walk,
      cell,
      (x, y, z) => x === start.x && y === start.y && z === start.z,
      limits,
    );
    if (up === null) continue;
    const down = walkTo(
      walk,
      start,
      (x, y, z) => x === cell.x && y === cell.y && z === cell.z,
      limits,
    );
    return { down, up };
  }
  return { down: deep.length > 0 ? 0 : null, up: null };
}

/** A standing cell in the column or, if a tree stands there, in one up to 3 columns away. */
export function standingNear(walk: WalkWorld, x: number, from: number, z: number): Cell | null {
  for (let r = 0; r <= 3; r++) {
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        const cell = standingBelow(walk, x + dx, from, z + dz);
        if (cell) return cell;
      }
    }
  }
  return null;
}

/** A ravine's floor (its deepest part) from the surface beside its first end. */
export function walkRavine(walk: WalkWorld, shape: CaveShape): WalkResult {
  const start = standingNear(walk, shape.startX, shape.startY + 2, shape.startZ);
  if (!start) return { down: null, up: null };
  // The start lies beyond the carved spans (the end of the line rises above the ground).
  const limits = {
    minX: Math.min(shape.minX, start.x) - 2,
    maxX: Math.max(shape.maxX, start.x) + 2,
    minZ: Math.min(shape.minZ, start.z) - 2,
    maxZ: Math.max(shape.maxZ, start.z) + 2,
  };
  const floor = shape.endY;
  let bottom: Cell | null = null;
  const down = walkTo(
    walk,
    start,
    (x, y, z) => {
      if (y > floor) return false;
      bottom = { x, y, z };
      return true;
    },
    limits,
  );
  if (!bottom) return { down, up: null };
  const up = walkTo(
    walk,
    bottom,
    (x, y, z) => x === start.x && y === start.y && z === start.z,
    limits,
  );
  return { down, up };
}

/** A shaft from its top to its chamber and back, every standing cell lit by torches. */
export function walkShaft(walk: WalkWorld, shaft: Shaft): WalkResult {
  const top = shaftTopCell(shaft);
  const limits = {
    minX: shaft.x - SHAFT_HALF,
    maxX: shaft.x + SHAFT_HALF,
    minZ: shaft.z - SHAFT_HALF,
    maxZ: shaft.z + SHAFT_HALF,
    lightAbove: DARK_LIGHT,
  };
  let chamber: Cell | null = null;
  const down = walkTo(
    walk,
    top,
    (x, y, z) => {
      if (y !== shaft.floor) return false;
      chamber = { x, y, z };
      return true;
    },
    limits,
  );
  if (!chamber) return { down, up: null };
  const up = walkTo(walk, chamber, (x, y, z) => x === top.x && y === top.y && z === top.z, limits);
  return { down, up };
}
