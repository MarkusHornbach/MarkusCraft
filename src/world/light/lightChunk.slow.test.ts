import { describe, expect, it } from 'vitest';
import { CHUNK_SIZE, CHUNK_VOLUME, GENERATOR_VERSION, WORLD_HEIGHT } from '../../game/config';
import { LIGHT_CHECKSUM_1337_V1 } from '../../testing/lightChecksum';
import { TEST_LIGHT, artificialGroup, caveGroup } from '../../testing/lightScenes';
import { expectFasterThan } from '../../testing/timing';
import { generateChunk } from '../generation/terrain';
import { meshChunk } from '../meshing/mesher';
import { checkChunkLight, checkLight, joinChunks } from './lightCheck';
import { lightChecksumOf, lightChunk } from './lightChunk';
import { type ChunkLookup, blockOf, skyOf, stepLight } from './lightRules';

const SEED = 1337;
const terrain = new Map<string, Uint8Array>();
function terrainChunk(cx: number, cz: number): Uint8Array {
  const key = `${cx},${cz}`;
  let blocks = terrain.get(key);
  if (!blocks) {
    blocks = generateChunk(SEED, cx, cz, GENERATOR_VERSION);
    terrain.set(key, blocks);
  }
  return blocks;
}
function around(cx: number, cz: number): ChunkLookup {
  return (dx, dz) => terrainChunk(cx + dx, cz + dz);
}

/** The first cell in which two light arrays differ, as text; null if they are equal. */
function firstDifference(actual: Uint8Array, expected: Uint8Array): string | null {
  for (let i = 0; i < expected.length; i++) {
    if (actual[i] !== expected[i]) {
      return (
        `cell ${i & 15}, ${i >> 8}, ${(i >> 4) & 15}: sky ${skyOf(actual[i])} block ` +
        `${blockOf(actual[i])}, expected sky ${skyOf(expected[i])} block ${blockOf(expected[i])}`
      );
    }
  }
  return null;
}

function bestOf(rounds: number, run: () => void): number {
  let best = Infinity;
  for (let i = 0; i < rounds; i++) {
    const start = performance.now();
    run();
    best = Math.min(best, performance.now() - start);
  }
  return best;
}

describe('lightChunk', () => {
  it('Phase 4 AC1.3: equals the slow check for 30 artificial volumes', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const group = artificialGroup(seed);
      const lookup: ChunkLookup = (dx, dz) => group.at(dx + 1, dz + 1);
      const light = lightChunk(lookup, TEST_LIGHT);
      expect(light.length).toBe(CHUNK_VOLUME);
      expect(
        firstDifference(light, checkChunkLight(lookup, TEST_LIGHT)),
        `seed ${seed}`,
      ).toBeNull();
    }
  });

  it('Phase 4 AC1.3: the artificial volumes contain what they are meant to test', () => {
    let dim = 0;
    let lit = 0;
    let dark = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const group = artificialGroup(seed);
      const light = lightChunk((dx, dz) => group.at(dx + 1, dz + 1), TEST_LIGHT);
      for (let i = 0; i < 256 * 24; i++) {
        const sky = skyOf(light[i]);
        if (sky > 0 && sky < 15) dim++;
        if (blockOf(light[i]) > 0) lit++;
        if (light[i] === 0 && group.at(1, 1)?.[i] === 0) dark++;
      }
    }
    expect(dim).toBeGreaterThan(5000);
    expect(lit).toBeGreaterThan(5000);
    // Air without any light: closed hollows and the far ends of tunnels.
    expect(dark).toBeGreaterThan(200);
  });

  it('Phase 4 AC1.3: equals the slow check for 16 chunks of the terrain of seed 1337', () => {
    for (let cz = 0; cz < 4; cz++) {
      for (let cx = 0; cx < 4; cx++) {
        const light = lightChunk(around(cx, cz));
        expect(firstDifference(light, checkChunkLight(around(cx, cz))), `${cx},${cz}`).toBeNull();
      }
    }
  });

  it('a missing chunk counts as air', () => {
    const group = artificialGroup(7);
    const lookup: ChunkLookup = (dx, dz) => (dx === 1 ? null : group.at(dx + 1, dz + 1));
    expect(
      firstDifference(lightChunk(lookup, TEST_LIGHT), checkChunkLight(lookup, TEST_LIGHT)),
    ).toBeNull();
    const empty = lightChunk(() => null);
    expect(empty.every((value) => value === 0xf0)).toBe(true);
  });

  it('Phase 4 AC1.4: the light does not depend on anything beyond the 3 × 3 chunks', () => {
    for (const seed of [3, 4]) {
      const inner = artificialGroup(seed);
      const light = lightChunk((dx, dz) => inner.at(dx + 1, dz + 1), TEST_LIGHT);
      // The same nine chunks in the middle of 5 × 5, with two very different surroundings.
      for (const outerSeed of [100, 101]) {
        const outer = artificialGroup(outerSeed, 5);
        const box = checkLight(
          joinChunks((ix, iz) => inner.at(ix - 1, iz - 1) ?? outer.at(ix, iz), 5, 5),
          80,
          80,
          TEST_LIGHT,
        );
        for (let i = 0; i < CHUNK_VOLUME; i++) {
          const x = 32 + (i & 15);
          const z = 32 + ((i >> 4) & 15);
          if (box[x + z * 80 + (i >> 8) * 6400] !== light[i]) {
            throw new Error(`seed ${seed}/${outerSeed}: light differs at index ${i}`);
          }
        }
      }
    }
  });

  it('Phase 4 AC1.4: two neighbouring chunks agree at their border', () => {
    // Each cell must be at least as bright as what its neighbour across the border sends.
    const check = (
      west: Uint8Array,
      east: Uint8Array,
      blocksW: Uint8Array,
      blocksE: Uint8Array,
    ) => {
      for (let y = 0; y < WORLD_HEIGHT; y++) {
        for (let z = 0; z < CHUNK_SIZE; z++) {
          const w = CHUNK_SIZE - 1 + z * CHUNK_SIZE + y * 256;
          const e = z * CHUNK_SIZE + y * 256;
          const opacityW = TEST_LIGHT.opacity[blocksW[w]];
          const opacityE = TEST_LIGHT.opacity[blocksE[e]];
          expect(skyOf(east[e])).toBeGreaterThanOrEqual(stepLight(skyOf(west[w]), opacityE, false));
          expect(skyOf(west[w])).toBeGreaterThanOrEqual(stepLight(skyOf(east[e]), opacityW, false));
          const emitE = TEST_LIGHT.emission[blocksE[e]];
          const emitW = TEST_LIGHT.emission[blocksW[w]];
          if (opacityE < 15 || emitE > 0) {
            expect(blockOf(east[e])).toBeGreaterThanOrEqual(
              stepLight(blockOf(west[w]), opacityE, false),
            );
          }
          if (opacityW < 15 || emitW > 0) {
            expect(blockOf(west[w])).toBeGreaterThanOrEqual(
              stepLight(blockOf(east[e]), opacityW, false),
            );
          }
        }
      }
    };
    const group = artificialGroup(11, 4);
    const west = lightChunk((dx, dz) => group.at(1 + dx, 1 + dz), TEST_LIGHT);
    const east = lightChunk((dx, dz) => group.at(2 + dx, 1 + dz), TEST_LIGHT);
    check(west, east, group.at(1, 1) as Uint8Array, group.at(2, 1) as Uint8Array);
    check(
      lightChunk(around(0, 0)),
      lightChunk(around(1, 0)),
      terrainChunk(0, 0),
      terrainChunk(1, 0),
    );
  });

  it('Phase 4 AC1.5: never changes its inputs and returns a fresh array every time', () => {
    const group = artificialGroup(5);
    const copies = group.chunks.map((blocks) => blocks.slice());
    const tables = { opacity: TEST_LIGHT.opacity.slice(), emission: TEST_LIGHT.emission.slice() };
    const lookup: ChunkLookup = (dx, dz) => group.at(dx + 1, dz + 1);
    const first = lightChunk(lookup, tables);
    const second = lightChunk(lookup, tables);
    expect(second).not.toBe(first);
    expect(second).toEqual(first);
    group.chunks.forEach((blocks, i) => expect(blocks).toEqual(copies[i]));
    expect(tables.opacity).toEqual(TEST_LIGHT.opacity);
    expect(tables.emission).toEqual(TEST_LIGHT.emission);
    // Nothing of one call leaks into the next: other blocks in between change nothing.
    lightChunk(around(0, 0));
    expect(lightChunk(lookup, tables)).toEqual(first);
  });

  it('Phase 4 AC1.6: the light checksum of seed 1337 equals the recorded constant', () => {
    expect(lightChecksumOf((cx, cz) => lightChunk(around(cx, cz)))).toBe(LIGHT_CHECKSUM_1337_V1);
  });

  it('Phase 4 AC1.7: lighting a terrain chunk takes at most 40 % of meshing it', () => {
    for (let cz = -1; cz <= 4; cz++) for (let cx = -1; cx <= 4; cx++) terrainChunk(cx, cz);
    const each = (run: (cx: number, cz: number) => void) => () => {
      for (let cz = 0; cz < 4; cz++) for (let cx = 0; cx < 4; cx++) run(cx, cz);
    };
    const light =
      bestOf(
        8,
        each((cx, cz) => lightChunk(around(cx, cz))),
      ) / 16;
    const mesh =
      bestOf(
        8,
        each((cx, cz) => meshChunk(terrainChunk(cx, cz), around(cx, cz))),
      ) / 16;
    console.log(`light ${light.toFixed(3)} ms/chunk, meshing ${mesh.toFixed(3)} ms/chunk`);
    expectFasterThan(light, mesh * 0.4);
  });

  it('Phase 4 AC1.7: a chunk full of caves takes at most four times a terrain chunk', () => {
    const caves = caveGroup(SEED, 1, 1);
    expect(caves.carvedShare).toBeGreaterThan(0.25);
    expect(caves.carvedShare).toBeLessThan(0.42);
    const lookup: ChunkLookup = (dx, dz) => caves.at(dx + 1, dz + 1);
    expect(firstDifference(lightChunk(lookup), checkChunkLight(lookup))).toBeNull();
    const cave = bestOf(12, () => lightChunk(lookup));
    const plain = bestOf(12, () => lightChunk(around(1, 1)));
    console.log(
      `cave chunk ${cave.toFixed(3)} ms, terrain chunk ${plain.toFixed(3)} ms, ` +
        `carved ${(caves.carvedShare * 100).toFixed(0)} %`,
    );
    expectFasterThan(cave, plain * 4);
  });
});
