// A `WalkWorld` over a generated `World`: chunks are generated and lit as the walk reads them.
import { CHUNK_SIZE } from '../game/config';
import type { WalkWorld } from '../bot/walk';
import { blockOf } from '../world/light/lightRules';
import { World } from '../world/World';
import type { WorldGen } from '../world/generation/worldOptions';

export function walkWorldOf(world: World): WalkWorld {
  const ensure = (x: number, z: number): void => {
    const cx = Math.floor(x / CHUNK_SIZE);
    const cz = Math.floor(z / CHUNK_SIZE);
    if (!world.hasChunk(cx, cz)) world.generate(cx, cz);
  };
  return {
    block: (x, y, z) => {
      ensure(x, z);
      return world.getBlock(x, y, z);
    },
    blockLight: (x, y, z) => {
      const cx = Math.floor(x / CHUNK_SIZE);
      const cz = Math.floor(z / CHUNK_SIZE);
      if (!world.getChunk(cx, cz)?.light) {
        for (let dz = -1; dz <= 1; dz++)
          for (let dx = -1; dx <= 1; dx++) world.generate(cx + dx, cz + dz);
        world.light(cx, cz);
      }
      return blockOf(world.getLight(x, y, z) ?? 0);
    },
  };
}

export function generatedWalkWorld(seed: number, gen: WorldGen): { world: World; walk: WalkWorld } {
  const world = new World(seed, gen);
  return { world, walk: walkWorldOf(world) };
}
