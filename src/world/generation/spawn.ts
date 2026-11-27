// Spawn search: the grass column nearest to the origin, away from tree canopies, and in
// generator 2 worlds with trees also with wood within reach.
import { SPAWN_MIN_TREES, SPAWN_WOOD_RADIUS, SPAWN_WOOD_RINGS } from '../../game/config';
import type { TerrainSource } from './terrain';
import { TREE_CANOPY_RADIUS } from './trees';

/** No tree trunk this close to the spawn: leaves stay at least two blocks away. */
export const SPAWN_TREE_CLEARANCE = TREE_CANOPY_RADIUS + 2;

export interface SpawnPoint {
  /** Block column of the spawn. */
  x: number;
  z: number;
  /** Y of the player's feet: one above the ground block. */
  y: number;
}

/** Upper bound of the spiral, in rings. Far more than any basin of the terrain needs. */
const MAX_RINGS = 2048;
/** The wood rule searches in stages, so a near spot needs only a small trunk map. */
const WOOD_STAGES = [16, 64, SPAWN_WOOD_RINGS];

function isSuitable(terrain: TerrainSource, x: number, z: number): boolean {
  // Grass only: not in water, not on a beach and not on bare rock.
  if (!terrain.isGrass(x, z)) return false;
  // Keep the player's head out of leaves and the first view clear of foliage.
  const r = SPAWN_TREE_CLEARANCE;
  for (let dz = -r; dz <= r; dz++) {
    for (let dx = -r; dx <= r; dx++) {
      if (terrain.treeAt(x + dx, z + dz) > 0) return false;
    }
  }
  return true;
}

/**
 * Column (0, 0) if it is suitable, otherwise the first one on an outward square spiral.
 * A terrain that `wantsWood` first looks for a suitable spot with at least
 * `SPAWN_MIN_TREES` trunks within `SPAWN_WOOD_RADIUS`, up to `SPAWN_WOOD_RINGS` rings.
 */
export function findSpawn(terrain: TerrainSource): SpawnPoint {
  if (terrain.spawnPoint) return terrain.spawnPoint();
  if (terrain.wantsWood) {
    const wooded = findWoodedSpawn(terrain);
    if (wooded) return wooded;
  }
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

/**
 * The spiral of `findSpawn` with the wood rule. Trunks are counted through a summed-area
 * table over a square trunk map, built anew for each stage of rings.
 */
function findWoodedSpawn(terrain: TerrainSource): SpawnPoint | null {
  const wood = SPAWN_WOOD_RADIUS;
  const clear = SPAWN_TREE_CLEARANCE;
  let from = 0;
  for (const rings of WOOD_STAGES) {
    const half = rings + wood;
    const n = 2 * half + 1;
    const w = n + 1;
    // sums[(x + 1) + (z + 1) · w]: trunks in the map columns [0, x] × [0, z].
    const sums = new Int32Array(w * w);
    for (let z = 0; z < n; z++) {
      let row = 0;
      for (let x = 0; x < n; x++) {
        if (terrain.treeAt(x - half, z - half) > 0) row++;
        sums[x + 1 + (z + 1) * w] = sums[x + 1 + z * w] + row;
      }
    }
    // Trunks within Chebyshev distance r of the spot (x, z) in map coordinates.
    const around = (x: number, z: number, r: number): number =>
      sums[x + r + 1 + (z + r + 1) * w] -
      sums[x - r + (z + r + 1) * w] -
      sums[x + r + 1 + (z - r) * w] +
      sums[x - r + (z - r) * w];
    for (let ring = from; ring <= rings; ring++) {
      for (let dz = -ring; dz <= ring; dz++) {
        for (let dx = -ring; dx <= ring; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== ring) continue;
          const x = dx + half;
          const z = dz + half;
          if (around(x, z, clear) !== 0) continue;
          if (around(x, z, wood) < SPAWN_MIN_TREES) continue;
          if (!terrain.isGrass(dx, dz)) continue;
          return { x: dx, z: dz, y: terrain.heightAt(dx, dz) + 1 };
        }
      }
    }
    from = rings + 1;
  }
  return null;
}
