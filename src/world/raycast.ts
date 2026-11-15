// Voxel ray traversal (Amanatides–Woo): finds the first targetable block along a ray.
import { TORCH_AIM_HEIGHT, TORCH_AIM_WIDTH } from '../game/config';
import { BLOCK_SHAPE, BLOCK_TARGETABLE, SHAPE_CUBE } from './blocks';

/** A box inside a cell, in block units relative to the cell's corner. */
export interface CellBox {
  x0: number;
  y0: number;
  z0: number;
  x1: number;
  y1: number;
  z1: number;
}

const FULL_BOX: CellBox = { x0: 0, y0: 0, z0: 0, x1: 1, y1: 1, z1: 1 };
const TORCH_BOX: CellBox = {
  x0: 0.5 - TORCH_AIM_WIDTH / 2,
  y0: 0,
  z0: 0.5 - TORCH_AIM_WIDTH / 2,
  x1: 0.5 + TORCH_AIM_WIDTH / 2,
  y1: TORCH_AIM_HEIGHT,
  z1: 0.5 + TORCH_AIM_WIDTH / 2,
};

/** The box a block is aimed at with, and its target outline: the whole cell for cubes. */
export function aimBox(id: number): CellBox {
  return BLOCK_SHAPE[id] === SHAPE_CUBE ? FULL_BOX : TORCH_BOX;
}

export interface RayHit {
  /** Block coordinates of the hit block. */
  x: number;
  y: number;
  z: number;
  /** Block id of the hit block. */
  id: number;
  /** Outward normal of the face the ray entered through. */
  face: [number, number, number];
  /** Distance from the origin to the entry point. */
  distance: number;
}

/**
 * Walks the grid cell by cell from the origin along the (not necessarily normalised)
 * direction, up to `maxDistance`. Air and water are passed through; the first targetable
 * block is returned. A block that is not a cube is hit only where the ray passes through
 * its aiming box; a ray that misses the box goes on. The cell containing the origin
 * itself is never a hit.
 */
export function raycast(
  getBlock: (x: number, y: number, z: number) => number,
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
  maxDistance: number,
): RayHit | null {
  const length = Math.hypot(dx, dy, dz);
  if (length === 0) return null;
  dx /= length;
  dy /= length;
  dz /= length;

  let x = Math.floor(ox);
  let y = Math.floor(oy);
  let z = Math.floor(oz);
  const stepX = dx > 0 ? 1 : -1;
  const stepY = dy > 0 ? 1 : -1;
  const stepZ = dz > 0 ? 1 : -1;
  // Ray length needed to cross one whole cell along each axis.
  const deltaX = dx !== 0 ? Math.abs(1 / dx) : Infinity;
  const deltaY = dy !== 0 ? Math.abs(1 / dy) : Infinity;
  const deltaZ = dz !== 0 ? Math.abs(1 / dz) : Infinity;
  // Ray length to the first cell boundary along each axis.
  let tMaxX = dx !== 0 ? (dx > 0 ? x + 1 - ox : ox - x) * deltaX : Infinity;
  let tMaxY = dy !== 0 ? (dy > 0 ? y + 1 - oy : oy - y) * deltaY : Infinity;
  let tMaxZ = dz !== 0 ? (dz > 0 ? z + 1 - oz : oz - z) * deltaZ : Infinity;

  for (;;) {
    let t: number;
    let fx = 0;
    let fy = 0;
    let fz = 0;
    if (tMaxX <= tMaxY && tMaxX <= tMaxZ) {
      t = tMaxX;
      x += stepX;
      tMaxX += deltaX;
      fx = -stepX;
    } else if (tMaxY <= tMaxZ) {
      t = tMaxY;
      y += stepY;
      tMaxY += deltaY;
      fy = -stepY;
    } else {
      t = tMaxZ;
      z += stepZ;
      tMaxZ += deltaZ;
      fz = -stepZ;
    }
    if (t > maxDistance) return null;
    const id = getBlock(x, y, z);
    if (BLOCK_TARGETABLE[id] !== 1) continue;
    if (BLOCK_SHAPE[id] === SHAPE_CUBE) return { x, y, z, id, face: [fx, fy, fz], distance: t };
    const hit = hitBox(aimBox(id), x, y, z, ox, oy, oz, dx, dy, dz);
    if (hit && hit.distance <= maxDistance) return { x, y, z, id, ...hit };
  }
}

/**
 * Where a ray (unit direction) enters a box inside cell (x, y, z), by the slab method:
 * distance and outward face, or null if it misses. The ray starts outside the cell.
 */
export function hitBox(
  box: CellBox,
  x: number,
  y: number,
  z: number,
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
): { face: [number, number, number]; distance: number } | null {
  let near = -Infinity;
  let far = Infinity;
  let axis = -1;
  const origin = [ox - x, oy - y, oz - z];
  const dir = [dx, dy, dz];
  const lo = [box.x0, box.y0, box.z0];
  const hi = [box.x1, box.y1, box.z1];
  for (let a = 0; a < 3; a++) {
    const d = dir[a];
    if (d === 0) {
      if (origin[a] < lo[a] || origin[a] > hi[a]) return null;
      continue;
    }
    let t0 = (lo[a] - origin[a]) / d;
    let t1 = (hi[a] - origin[a]) / d;
    if (t0 > t1) [t0, t1] = [t1, t0];
    if (t0 > near) {
      near = t0;
      axis = a;
    }
    if (t1 < far) far = t1;
    if (near > far) return null;
  }
  if (axis < 0 || near < 0) return null;
  const face: [number, number, number] = [0, 0, 0];
  face[axis] = dir[axis] > 0 ? -1 : 1;
  return { face, distance: near };
}
