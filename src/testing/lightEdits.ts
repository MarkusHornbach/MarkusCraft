// Test helper: a small lit world, the comparison with the slow light check, random edits.
import { expect } from 'vitest';
import { CHUNK_SIZE, WORLD_HEIGHT } from '../game/config';
import { mulberry32, randInt } from '../util/rng';
import { Block } from '../world/blocks';
import { createChunk } from '../world/chunk';
import { checkLight, joinChunks } from '../world/light/lightCheck';
import { blockOf, chunksSeeingCell, skyOf } from '../world/light/lightRules';
import { World } from '../world/World';
import { ChunkGroup, GLOW_ROCK, LAMP, TEST_LIGHT, artificialGroup } from './lightScenes';
import { TIMING_ENFORCED } from './timing';

export const COUNT = 5;

export const SIZE = COUNT * CHUNK_SIZE;

/** A world of 5 × 5 chunks (0..4) from a group; the inner 3 × 3 chunks are lit. */
export function worldOf(group: ChunkGroup): World {
  const world = new World(1);
  world.lightTables = TEST_LIGHT;
  for (let cz = 0; cz < COUNT; cz++) {
    for (let cx = 0; cx < COUNT; cx++) {
      world.addChunk(createChunk(cx, cz, (group.at(cx, cz) as Uint8Array).slice()));
    }
  }
  for (let cz = 1; cz <= 3; cz++) for (let cx = 1; cx <= 3; cx++) world.light(cx, cz);
  return world;
}

/** Flat ground of stone up to y = 10 in all 25 chunks. */
export function flatGroup(): ChunkGroup {
  const group = new ChunkGroup(COUNT);
  group.fill(0, 0, 0, SIZE - 1, 10, SIZE - 1, Block.STONE);
  return group;
}

/** The first lit cell whose stored light differs from the slow check of `box`, or null. */
export function firstWrongCell(
  world: World,
  box: Uint8Array,
  layers = WORLD_HEIGHT,
): string | null {
  const expected = checkLight(box, SIZE, SIZE, TEST_LIGHT);
  for (const chunk of world.allChunks()) {
    const light = chunk.light;
    if (!light) continue;
    const offset = chunk.cx * CHUNK_SIZE + chunk.cz * CHUNK_SIZE * SIZE;
    for (let i = 0; i < layers * 256; i++) {
      const want = expected[offset + (i & 15) + ((i >> 4) & 15) * SIZE + (i >> 8) * SIZE * SIZE];
      if (light[i] !== want) {
        const x = chunk.cx * CHUNK_SIZE + (i & 15);
        const z = chunk.cz * CHUNK_SIZE + ((i >> 4) & 15);
        return (
          `${x}, ${i >> 8}, ${z}: sky ${skyOf(light[i])} block ${blockOf(light[i])}, ` +
          `expected sky ${skyOf(want)} block ${blockOf(want)}`
        );
      }
    }
  }
  return null;
}

export function boxOf(world: World): Uint8Array {
  return joinChunks((ix, iz) => world.getChunk(ix, iz)?.blocks ?? null, COUNT, COUNT);
}

export function expectCorrect(world: World): void {
  expect(firstWrongCell(world, boxOf(world))).toBeNull();
}

export function sky(world: World, x: number, y: number, z: number): number {
  return skyOf(world.getLight(x, y, z) ?? -1);
}

export function block(world: World, x: number, y: number, z: number): number {
  return blockOf(world.getLight(x, y, z) ?? -1);
}

export function lights(world: World, layers = WORLD_HEIGHT): Map<string, Uint8Array> {
  const map = new Map<string, Uint8Array>();
  for (const chunk of world.allChunks()) {
    if (chunk.light) map.set(`${chunk.cx},${chunk.cz}`, chunk.light.slice(0, layers * 256));
  }
  return map;
}

/** The chunks a light change between two states must be reported for (AC2.5). */
function chunksToReport(before: Map<string, Uint8Array>, world: World): string[] {
  const keys = new Set<string>();
  for (const chunk of world.allChunks()) {
    const old = before.get(`${chunk.cx},${chunk.cz}`);
    if (!old || !chunk.light) continue;
    for (let i = 0; i < old.length; i++) {
      if (old[i] === chunk.light[i]) continue;
      const mask = chunksSeeingCell(1, 1, i & 15, (i >> 4) & 15);
      for (let g = 0; g < 9; g++) {
        if (mask & (1 << g))
          keys.add(`${chunk.cx + (g % 3) - 1},${chunk.cz + Math.floor(g / 3) - 1}`);
      }
    }
  }
  return [...keys].sort();
}

/**
 * Seeded random edits, each followed by the full comparison with the slow check and by
 * the check of the reported chunks (AC2.5). `top` puts some edits into the highest layers.
 */
export function randomEdits(world: World, count: number, seed: number, top: boolean): void {
  const box = boxOf(world);
  const reported = new Set<string>();
  world.onLightChange = (cx, cz, lit) => {
    expect(lit).toBe(true);
    reported.add(`${cx},${cz}`);
  };
  expect(firstWrongCell(world, box)).toBeNull();
  const rng = mulberry32(seed);
  const layers = top ? WORLD_HEIGHT : 40;
  let quick = 0;
  let lightChanges = 0;
  for (let edit = 0; edit < count; edit++) {
    // Six of ten edits fall into the middle chunk, where the quick update runs; the
    // others anywhere, also in chunks that are not lit. A third lie on chunk borders.
    const anywhere = rng() < 0.4;
    let x = anywhere ? randInt(rng, SIZE) : 32 + randInt(rng, CHUNK_SIZE);
    let z = anywhere ? randInt(rng, SIZE) : 32 + randInt(rng, CHUNK_SIZE);
    if (rng() < 1 / 3) {
      x = (x & ~15) + (rng() < 0.5 ? 0 : 15);
      if (rng() < 0.5) z = (z & ~15) + (rng() < 0.5 ? 0 : 15);
    }
    const y = top && rng() < 0.3 ? WORLD_HEIGHT - 1 - randInt(rng, 3) : randInt(rng, top ? 22 : 14);
    const id = PLACED[randInt(rng, PLACED.length)];
    const old = world.getBlock(x, y, z);
    const before = lights(world, layers);
    reported.clear();
    expect(world.setBlock(x, y, z, id)).toBe(true);
    box[x + z * SIZE + y * SIZE * SIZE] = id;
    // Without edits at the top nothing above layer 40 can change; it is checked at the end.
    const wrong = firstWrongCell(world, box, layers);
    if (wrong) throw new Error(`edit ${edit} (${old} → ${id} at ${x}, ${y}, ${z}): ${wrong}`);
    const expected = chunksToReport(before, world);
    expect([...reported].sort(), `edit ${edit}`).toEqual(expected);
    if (x >> 4 === 2 && z >> 4 === 2) quick++;
    if (expected.length > 0) lightChanges++;
  }
  expect(firstWrongCell(world, box)).toBeNull();
  expect(world.litCount).toBe(9);
  expect(quick).toBeGreaterThan(count / 2);
  expect(lightChanges).toBeGreaterThan(count / 8);
}

// Emitters are rare: hundreds of them would only make the slow check slower.
export const PLACED = [
  Block.AIR,
  Block.AIR,
  Block.AIR,
  Block.AIR,
  Block.AIR,
  Block.AIR,
  Block.STONE,
  Block.STONE,
  Block.PLANKS,
  Block.PLANKS,
  Block.GLASS,
  Block.GLASS,
  Block.LEAVES,
  Block.LEAVES,
  Block.WATER,
  Block.WATER,
  LAMP,
  GLOW_ROCK,
];

/**
 * A quarter of the 2 000 random edits of Phase 4 AC2.3 and AC2.5. The slow check after
 * every edit takes time, so four test files share the work and run side by side. Under
 * coverage, which slows the check several times over, each does a quarter of its part.
 */
export function editsPart(part: number): void {
  // Low ground without a tower: the slow check then has little air to work through.
  const world = worldOf(artificialGroup(76 + part, COUNT, true));
  randomEdits(world, TIMING_ENFORCED ? 500 : 125, 2023 + part, false);
}
