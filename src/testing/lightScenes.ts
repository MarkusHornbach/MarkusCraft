// Test helpers for light: tables with emitters, artificial block volumes, a cave chunk.
import { CHUNK_SIZE, CHUNK_VOLUME, GENERATOR_VERSION, WORLD_HEIGHT } from '../game/config';
import { BLOCK_EMISSION, BLOCK_OPACITY, Block } from '../world/blocks';
import { generateChunk } from '../world/generation/terrain';
import type { LightTables } from '../world/light/lightRules';
import { hash32, mulberry32, randInt } from '../util/rng';

/** A clear block that shines like a torch. No such block exists before Part B. */
export const LAMP = 200;
/** An opaque block that glows weakly. */
export const GLOW_ROCK = 201;
export const LAMP_LIGHT = 14;
export const GLOW_ROCK_LIGHT = 9;

/** The real tables plus the two test emitters. */
export const TEST_LIGHT: LightTables = (() => {
  const opacity = BLOCK_OPACITY.slice();
  const emission = BLOCK_EMISSION.slice();
  emission[LAMP] = LAMP_LIGHT;
  opacity[GLOW_ROCK] = 15;
  emission[GLOW_ROCK] = GLOW_ROCK_LIGHT;
  return { opacity, emission };
})();

/** Chunk-shaped block data of a group of `count` × `count` chunks, written by world cell. */
export class ChunkGroup {
  readonly chunks: Uint8Array[] = [];
  readonly size: number;
  /** Share of the ground that `caveGroup` turned into air. */
  carvedShare = 0;

  constructor(readonly count: number) {
    this.size = count * CHUNK_SIZE;
    for (let i = 0; i < count * count; i++) this.chunks.push(new Uint8Array(CHUNK_VOLUME));
  }

  /** Blocks of the chunk at place (ix, iz) of the group, or null outside it. */
  at(ix: number, iz: number): Uint8Array | null {
    if (ix < 0 || iz < 0 || ix >= this.count || iz >= this.count) return null;
    return this.chunks[ix + iz * this.count];
  }

  get(x: number, y: number, z: number): number {
    return this.chunks[(x >> 4) + (z >> 4) * this.count][(x & 15) | ((z & 15) << 4) | (y << 8)];
  }

  /** Sets a cell; cells outside the group are ignored, so shapes may stick out. */
  set(x: number, y: number, z: number, id: number): void {
    if (x < 0 || z < 0 || x >= this.size || z >= this.size || y < 0 || y >= WORLD_HEIGHT) return;
    this.chunks[(x >> 4) + (z >> 4) * this.count][(x & 15) | ((z & 15) << 4) | (y << 8)] = id;
  }

  fill(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, id: number): void {
    for (let y = y0; y <= y1; y++) {
      for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) this.set(x, y, z, id);
    }
  }
}

/**
 * A seeded volume that has everything light has rules for: uneven ground, lakes, slabs
 * hanging in the air (overhangs), closed hollows, tunnels that cross chunk borders,
 * leaves, glass and emitters. The ground stays low, so the slow check is quick.
 */
export function artificialGroup(seed: number, count = 3): ChunkGroup {
  const rng = mulberry32(seed);
  const group = new ChunkGroup(count);
  const size = group.size;
  const phaseX = rng() * 7;
  const phaseZ = rng() * 7;
  const heightAt = (x: number, z: number): number =>
    Math.round(9 + 4 * Math.sin(x / 5 + phaseX) + 3 * Math.cos(z / 4 + phaseZ));
  for (let z = 0; z < size; z++) {
    for (let x = 0; x < size; x++) {
      const h = heightAt(x, z);
      for (let y = 0; y <= h; y++) group.set(x, y, z, y === h ? Block.GRASS : Block.STONE);
      for (let y = h + 1; y <= 8; y++) group.set(x, y, z, Block.WATER);
    }
  }
  const spot = (): [number, number] => [randInt(rng, size), randInt(rng, size)];
  // Slabs above the ground, some with a glass pane or a hole.
  for (let i = 0; i < 4 * count; i++) {
    const [x, z] = spot();
    const y = heightAt(x, z) + 2 + randInt(rng, 6);
    const w = 2 + randInt(rng, 12);
    const d = 2 + randInt(rng, 12);
    group.fill(x, y, z, x + w, y + randInt(rng, 2), z + d, Block.PLANKS);
    if (rng() < 0.5) group.set(x + randInt(rng, w), y, z + randInt(rng, d), Block.GLASS);
    if (rng() < 0.3) group.fill(x + 1, y, z + 1, x + 1, y + 1, z + 1, Block.AIR);
  }
  // Closed hollows inside the ground.
  for (let i = 0; i < 3 * count; i++) {
    const [x, z] = spot();
    const y = 1 + randInt(rng, 4);
    group.fill(
      x,
      y,
      z,
      x + 1 + randInt(rng, 6),
      y + 1 + randInt(rng, 2),
      z + 1 + randInt(rng, 6),
      0,
    );
  }
  // Tunnels, one wide and two high, long enough to cross a chunk border.
  for (let i = 0; i < 3 * count; i++) {
    const [x, z] = spot();
    const y = 2 + randInt(rng, 9);
    const length = 10 + randInt(rng, 24);
    if (rng() < 0.5) group.fill(x, y, z, x + length, y + 1, z, Block.AIR);
    else group.fill(x, y, z, x, y + 1, z + length, Block.AIR);
  }
  // Leaves in blobs, like tree tops.
  for (let i = 0; i < 4 * count; i++) {
    const [x, z] = spot();
    const y = heightAt(x, z) + 3 + randInt(rng, 4);
    group.fill(x - 2, y, z - 2, x + 2, y + 1 + randInt(rng, 2), z + 2, Block.LEAVES);
  }
  // A tower up to the top of the world, so the highest layer is not always air.
  if (rng() < 0.5) {
    const [x, z] = spot();
    group.fill(x, 0, z, x + 1, WORLD_HEIGHT - 1, z + 1, rng() < 0.5 ? Block.STONE : Block.LEAVES);
  }
  // Emitters anywhere up to a little above the ground: in the open, in water, buried.
  for (let i = 0; i < 3 * count; i++) {
    const [x, z] = spot();
    group.set(x, 1 + randInt(rng, 18), z, rng() < 0.7 ? LAMP : GLOW_ROCK);
  }
  return group;
}

function lattice(seed: number, x: number, y: number, z: number): number {
  return (
    hash32(seed ^ Math.imul(x, 0x27d4eb2d) ^ Math.imul(y, 0x165667b1) ^ Math.imul(z, 0x9e3779b1)) /
    4294967296
  );
}

/** Smooth noise in 0..1 from a lattice with a spacing of five cells. */
function caveNoise(seed: number, x: number, y: number, z: number): number {
  const fx = x / 5;
  const fy = y / 5;
  const fz = z / 5;
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const z0 = Math.floor(fz);
  let sum = 0;
  for (let i = 0; i < 8; i++) {
    const dx = i & 1;
    const dy = (i >> 1) & 1;
    const dz = i >> 2;
    const weight =
      (dx ? fx - x0 : 1 - (fx - x0)) *
      (dy ? fy - y0 : 1 - (fy - y0)) *
      (dz ? fz - z0 : 1 - (fz - z0));
    sum += weight * lattice(seed, x0 + dx, y0 + dy, z0 + dz);
  }
  return sum;
}

/**
 * The 3 × 3 chunks around (cx, cz) of a seed's terrain with caves carved into them: about
 * a third of the cells below the surface become air. Caves do not exist in the game yet;
 * this shows what they would cost.
 */
export function caveGroup(seed: number, cx: number, cz: number): ChunkGroup {
  const group = new ChunkGroup(3);
  let carved = 0;
  let solid = 0;
  for (let iz = 0; iz < 3; iz++) {
    for (let ix = 0; ix < 3; ix++) {
      const blocks = generateChunk(seed, cx + ix - 1, cz + iz - 1, GENERATOR_VERSION);
      for (let i = 0; i < CHUNK_VOLUME; i++) {
        const id = blocks[i];
        if (id === Block.AIR || id === Block.WATER || id === Block.BEDROCK) continue;
        const x = (cx + ix - 1) * CHUNK_SIZE + (i & 15);
        const z = (cz + iz - 1) * CHUNK_SIZE + ((i >> 4) & 15);
        solid++;
        if (caveNoise(seed, x, i >> 8, z) < 0.43) {
          blocks[i] = Block.AIR;
          carved++;
        }
      }
      group.chunks[ix + iz * 3] = blocks;
    }
  }
  group.carvedShare = carved / solid;
  return group;
}
