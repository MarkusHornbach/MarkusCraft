// Spawn search: the dry column nearest to the origin, away from tree canopies.
import { TREE_CANOPY_RADIUS } from './trees';
import type { Terrain } from './terrain';

export interface SpawnPoint {
  /** Block column of the spawn. */
  x: number;
  z: number;
  /** Y of the player's feet: one above the ground block. */
  y: number;
}

/** Upper bound of the spiral, in rings. Far more than any basin of the terrain needs. */
const MAX_RINGS = 2048;

function isSuitable(terrain: Terrain, x: number, z: number): boolean {
  if (terrain.isUnderWater(x, z)) return false;
  // Keep the player's head out of leaves and trunks.
  const r = TREE_CANOPY_RADIUS;
  for (let dz = -r; dz <= r; dz++) {
    for (let dx = -r; dx <= r; dx++) {
      if (terrain.treeAt(x + dx, z + dz) > 0) return false;
    }
  }
  return true;
}

/** Column (0, 0) if it is dry, otherwise the first dry column on an outward square spiral. */
export function findSpawn(terrain: Terrain): SpawnPoint {
  for (let ring = 0; ring <= MAX_RINGS; ring++) {
    for (let dz = -ring; dz <= ring; dz++) {
      for (let dx = -ring; dx <= ring; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== ring) continue;
        if (isSuitable(terrain, dx, dz)) return { x: dx, z: dz, y: terrain.heightAt(dx, dz) + 1 };
      }
    }
  }
  // Unreachable for this terrain; standing on the water bed is still a valid position.
  return { x: 0, z: 0, y: terrain.heightAt(0, 0) + 1 };
}
