// The walk check (Phase 8 part B2a): where a player gets on foot without breaking a block.
//
// A breadth-first search over standing cells: an air or torch cell with a solid cube below
// and a free cell above. A step goes to a 4-neighbour at the same height, one up (a jump,
// with a free cell above the head first) or any number down (no fall damage). Water,
// solid blocks and leaves are never entered.
import { Block, isSupport } from '../world/blocks';

export interface Cell {
  x: number;
  y: number;
  z: number;
}

/** What the walk reads: a block per cell and, for the light floor, block and sky light. */
export interface WalkWorld {
  block(x: number, y: number, z: number): number;
  /** Block light (0–15) of a cell. */
  blockLight?(x: number, y: number, z: number): number;
}

export interface WalkOptions {
  /** Only standing cells whose block light is above this (torch light). Off when undefined. */
  lightAbove?: number;
  /** The search stops after this many cells (default 200 000). */
  maxCells?: number;
  /** Only cells this accepts are stood on (for example the cells of one tunnel). */
  allowed?: (x: number, y: number, z: number) => boolean;
  /** Horizontal limits (inclusive); the search never leaves them. */
  minX?: number;
  maxX?: number;
  minZ?: number;
  maxZ?: number;
}

const DIRS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

/** Lowest cell a fall looks at. */
const FLOOR_Y = 1;

function isFree(id: number): boolean {
  return id === Block.AIR || id === Block.TORCH;
}

/** An air or torch cell with a solid cube below and a free cell above. */
export function isStanding(world: WalkWorld, x: number, y: number, z: number): boolean {
  return (
    isFree(world.block(x, y, z)) &&
    isFree(world.block(x, y + 1, z)) &&
    isSupport(world.block(x, y - 1, z))
  );
}

function key(x: number, y: number, z: number): string {
  return `${x},${y},${z}`;
}

/**
 * Breadth-first search from a standing cell. Returns the steps to the first cell `goal`
 * accepts (0 if the start does), or null if none is reached. A start that is not a
 * standing cell (or not lit enough) reaches nothing.
 */
export function walkTo(
  world: WalkWorld,
  start: Cell,
  goal: (x: number, y: number, z: number) => boolean,
  options: WalkOptions = {},
): number | null {
  const lightAbove = options.lightAbove;
  const allowed = options.allowed;
  const lit = (x: number, y: number, z: number): boolean =>
    (allowed === undefined || allowed(x, y, z)) &&
    (lightAbove === undefined || (world.blockLight?.(x, y, z) ?? 0) > lightAbove);
  const inside = (x: number, z: number): boolean =>
    (options.minX === undefined || x >= options.minX) &&
    (options.maxX === undefined || x <= options.maxX) &&
    (options.minZ === undefined || z >= options.minZ) &&
    (options.maxZ === undefined || z <= options.maxZ);
  if (!isStanding(world, start.x, start.y, start.z) || !lit(start.x, start.y, start.z)) {
    return null;
  }
  const maxCells = options.maxCells ?? 200_000;
  const seen = new Set<string>([key(start.x, start.y, start.z)]);
  let frontier: Cell[] = [start];
  let steps = 0;
  while (frontier.length > 0 && seen.size < maxCells) {
    const next: Cell[] = [];
    for (const c of frontier) {
      if (goal(c.x, c.y, c.z)) return steps;
      const headroom = isFree(world.block(c.x, c.y + 2, c.z));
      for (const [dx, dz] of DIRS) {
        const nx = c.x + dx;
        const nz = c.z + dz;
        if (!inside(nx, nz)) continue;
        const visit = (y: number): void => {
          const k = key(nx, y, nz);
          if (seen.has(k) || !lit(nx, y, nz)) return;
          seen.add(k);
          next.push({ x: nx, y, z: nz });
        };
        if (isStanding(world, nx, c.y, nz)) {
          visit(c.y);
          continue;
        }
        // One up: a jump needs the cell above the head free on both sides.
        if (
          headroom &&
          isStanding(world, nx, c.y + 1, nz) &&
          isFree(world.block(nx, c.y + 2, nz))
        ) {
          visit(c.y + 1);
          continue;
        }
        // Down: step over the edge, then fall to the first standing cell.
        if (!isFree(world.block(nx, c.y, nz)) || !isFree(world.block(nx, c.y + 1, nz))) continue;
        for (let y = c.y - 1; y >= FLOOR_Y; y--) {
          if (isFree(world.block(nx, y - 1, nz))) continue;
          if (isStanding(world, nx, y, nz)) visit(y);
          break;
        }
      }
    }
    frontier = next;
    steps++;
  }
  return null;
}
