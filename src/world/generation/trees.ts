// Tree placement and shape, decided purely by hashes of (seed, x, z).
import { hash2, hash2Float } from '../../util/rng';

/** Chance that a column is a tree candidate, before the spacing rule thins them out. */
export const TREE_CANDIDATE_CHANCE = 1 / 42;
/** No two trees are closer than this (Chebyshev distance). */
export const TREE_MIN_SPACING = 3;
/** Leaves reach this many columns away from the trunk. */
export const TREE_CANOPY_RADIUS = 2;
export const TREE_MIN_TRUNK = 4;
export const TREE_MAX_TRUNK = 6;

const SALT_PLACE = 0x51ab;
const SALT_SHAPE = 0x7ee5;

function isCandidate(seed: number, x: number, z: number): boolean {
  return hash2Float(seed ^ SALT_PLACE, x, z) < TREE_CANDIDATE_CHANCE;
}

/**
 * Whether column (x, z) wants a tree, looking at hashes only (terrain is checked by the
 * caller). Among candidates closer than the minimum spacing, the one with the highest
 * hash wins, which keeps the rule independent of generation order.
 */
export function isTreeOrigin(seed: number, x: number, z: number): boolean {
  if (!isCandidate(seed, x, z)) return false;
  const own = hash2(seed ^ SALT_PLACE, x, z);
  const reach = TREE_MIN_SPACING - 1;
  for (let dz = -reach; dz <= reach; dz++) {
    for (let dx = -reach; dx <= reach; dx++) {
      if (dx === 0 && dz === 0) continue;
      if (!isCandidate(seed, x + dx, z + dz)) continue;
      const other = hash2(seed ^ SALT_PLACE, x + dx, z + dz);
      // Ties are broken by position so exactly one of two equal candidates survives.
      if (other > own || (other === own && (dx > 0 || (dx === 0 && dz > 0)))) return false;
    }
  }
  return true;
}

/** Number of log blocks in the trunk of the tree at (x, z): 4 to 6. */
export function trunkHeight(seed: number, x: number, z: number): number {
  const span = TREE_MAX_TRUNK - TREE_MIN_TRUNK + 1;
  return TREE_MIN_TRUNK + (hash2(seed ^ SALT_SHAPE, x, z) % span);
}

/**
 * Whether the canopy of the tree at origin (ox, oz) with the given trunk height has a
 * leaf at offset (dx, dy, dz), where dy is relative to the topmost log.
 *
 * Shape: three 5×5 layers (dy = -2, -1, 0) with trimmed corners and a 3×3 cap (dy = 1).
 */
export function hasLeaf(
  seed: number,
  ox: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
): boolean {
  const ax = Math.abs(dx);
  const az = Math.abs(dz);
  if (dy === 1) {
    if (ax > 1 || az > 1) return false;
    // The cap is a plus shape; a hash keeps the occasional corner for variety.
    if (ax === 1 && az === 1)
      return (hash2(seed ^ SALT_SHAPE, ox + dx * 7, oz + dz * 13) & 3) === 0;
    return true;
  }
  if (dy < -2 || dy > 0) return false;
  if (ax > 2 || az > 2) return false;
  if (ax === 2 && az === 2) {
    // Corners: always trimmed on the top layer, sometimes kept on the lower ones.
    if (dy === 0) return false;
    return (hash2(seed ^ SALT_SHAPE, ox + dx * 3 + dy, oz + dz * 5 - dy) & 1) === 0;
  }
  return true;
}
