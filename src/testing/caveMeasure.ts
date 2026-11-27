// Measures of generator 3's caves (Phase 8 part B2a): faces per chunk and the carved share.
import { CHUNK_SIZE } from '../game/config';
import { Block } from '../world/blocks';
import { meshChunk } from '../world/meshing/mesher';
import { generateChunk } from '../world/generation/terrain';
import type { WorldGen } from '../world/generation/worldOptions';

/** Seeds and shapes of the plan's budgets (trees "few"). */
export const CAVE_SEEDS = [1, 42, 1337, 2024] as const;
export const CAVE_SHAPES = ['flat', 'balanced', 'hilly'] as const;

/** Faces of the meshes of the (2r + 1)² chunks around the origin, per chunk (no light). */
export function facesPerChunk(seed: number, gen: WorldGen, r = 4): number {
  const chunks = new Map<string, Uint8Array>();
  const at = (cx: number, cz: number): Uint8Array => {
    const key = `${cx},${cz}`;
    let blocks = chunks.get(key);
    if (!blocks) {
      blocks = generateChunk(seed, cx, cz, gen);
      chunks.set(key, blocks);
    }
    return blocks;
  };
  let faces = 0;
  for (let cz = -r; cz <= r; cz++) {
    for (let cx = -r; cx <= r; cx++) {
      const mesh = meshChunk(at(cx, cz), (dx, dz) => at(cx + dx, cz + dz));
      faces +=
        (mesh.opaque.indices.length +
          mesh.cutout.indices.length +
          mesh.translucent.indices.length) /
        6;
    }
  }
  return faces / ((2 * r + 1) * (2 * r + 1));
}

/** Share of generator 2's solid cells below y 45 that generator 3 leaves as air. */
export function carvedShare(
  seed: number,
  options: { terrain: 'flat' | 'balanced' | 'hilly'; trees: 'few' },
  r = 4,
): number {
  let solid = 0;
  let carved = 0;
  const layers = 45 * CHUNK_SIZE * CHUNK_SIZE;
  for (let cz = -r; cz <= r; cz++) {
    for (let cx = -r; cx <= r; cx++) {
      const two = generateChunk(seed, cx, cz, { version: 2, options });
      const three = generateChunk(seed, cx, cz, { version: 3, options });
      for (let i = 0; i < layers; i++) {
        if (two[i] === Block.AIR || two[i] === Block.WATER) continue;
        solid++;
        if (three[i] === Block.AIR) carved++;
      }
    }
  }
  return carved / solid;
}
