// Voxel ray traversal (Amanatides–Woo): finds the first solid block along a ray.
import { BLOCK_SOLID } from './blocks';

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
 * direction, up to `maxDistance`. Air and water are passed through; the first solid
 * block is returned. The cell containing the origin itself is never a hit.
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
    if (BLOCK_SOLID[id] === 1) return { x, y, z, id, face: [fx, fy, fz], distance: t };
  }
}
