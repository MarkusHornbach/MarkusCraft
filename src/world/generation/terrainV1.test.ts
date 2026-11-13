// Generator version 1 (Phase 3 step 1): rock, ore veins, clay, checksum, speed.
import { describe, expect, it } from 'vitest';
import {
  CHUNK_SIZE,
  COAL_MAX_Y,
  COAL_MIN_Y,
  GENERATOR_VERSION,
  IRON_MAX_Y,
  IRON_MIN_Y,
  SEA_LEVEL,
  WORLD_HEIGHT,
} from '../../game/config';
import { TERRAIN_CHECKSUM_1337_V1 } from '../../testing/terrainChecksum';
import { expectFasterThan } from '../../testing/timing';
import { Block } from '../blocks';
import { blockIndex, chunkKey } from '../chunk';
import { findSpawn } from './spawn';
import {
  ALL_FEATURES,
  NO_FEATURES,
  Terrain,
  generateChunk,
  isKnownGeneratorVersion,
  terrainChecksum,
} from './terrain';

const SEEDS = [1337, 42, 987654321, 7, 2024];
const AREA = 16; // chunks per side: 256 chunks per seed
const HALF = AREA / 2;

interface Area {
  terrain: Terrain;
  chunks: Map<string, Uint8Array>;
  get(x: number, y: number, z: number): number | null;
}

function generateArea(seed: number): Area {
  const terrain = new Terrain(seed);
  const chunks = new Map<string, Uint8Array>();
  for (let cz = -HALF; cz < HALF; cz++) {
    for (let cx = -HALF; cx < HALF; cx++) {
      chunks.set(chunkKey(cx, cz), terrain.generateChunk(cx, cz));
    }
  }
  const get = (x: number, y: number, z: number): number | null => {
    if (y < 0 || y >= WORLD_HEIGHT) return null;
    const cx = Math.floor(x / CHUNK_SIZE);
    const cz = Math.floor(z / CHUNK_SIZE);
    const blocks = chunks.get(chunkKey(cx, cz));
    if (!blocks) return null;
    return blocks[blockIndex(x - cx * CHUNK_SIZE, y, z - cz * CHUNK_SIZE)];
  };
  return { terrain, chunks, get };
}

const areas = new Map<number, Area>();
function areaOf(seed: number): Area {
  let area = areas.get(seed);
  if (!area) {
    area = generateArea(seed);
    areas.set(seed, area);
  }
  return area;
}

const isOre = (id: number): boolean => id === Block.COAL_ORE || id === Block.IRON_ORE;
const MIN = -HALF * CHUNK_SIZE;
const MAX = HALF * CHUNK_SIZE;

describe('generator version', () => {
  it('has the recorded checksum for seed 1337 (Phase 3 AC1.1)', () => {
    expect(terrainChecksum(1337, GENERATOR_VERSION)).toBe(TERRAIN_CHECKSUM_1337_V1);
    expect(terrainChecksum(1338, GENERATOR_VERSION)).not.toBe(TERRAIN_CHECKSUM_1337_V1);
  });

  it('is taken by generateChunk, which rejects unknown versions (Phase 3 AC1.9)', () => {
    expect(GENERATOR_VERSION).toBe(1);
    expect(isKnownGeneratorVersion(1)).toBe(true);
    expect(isKnownGeneratorVersion(0)).toBe(false);
    expect(isKnownGeneratorVersion(2)).toBe(false);
    expect(generateChunk(1337, 0, 0, 1).length).toBe(CHUNK_SIZE * CHUNK_SIZE * WORLD_HEIGHT);
    expect(() => generateChunk(1337, 0, 0, 0)).toThrow(/generator version/);
    expect(() => generateChunk(1337, 0, 0, 2)).toThrow(/generator version/);
  });
});

describe('ores', () => {
  it('replace stone only, in their height ranges and at their densities (Phase 3 AC1.3)', () => {
    for (const seed of SEEDS) {
      const { terrain, chunks, get } = areaOf(seed);
      const stone = { coal: 0, iron: 0 };
      const ore = { coal: 0, iron: 0 };
      let oreBlocks = 0;
      let withNeighbour = 0;
      for (let cz = -HALF; cz < HALF; cz++) {
        for (let cx = -HALF; cx < HALF; cx++) {
          const blocks = chunks.get(chunkKey(cx, cz)) as Uint8Array;
          const plain = terrain.generateChunk(cx, cz, { ...ALL_FEATURES, ores: false });
          for (let i = 0; i < blocks.length; i++) {
            const id = blocks[i];
            const y = Math.floor(i / (CHUNK_SIZE * CHUNK_SIZE));
            if (!isOre(id)) {
              // Without the ore pass nothing else changes.
              if (plain[i] !== id) throw new Error(`seed ${seed}: non-ore block differs`);
              if (id !== Block.STONE) continue;
            } else if (plain[i] !== Block.STONE) {
              throw new Error(`seed ${seed}: ore replaced block ${plain[i]}`);
            }
            const inCoal = y >= COAL_MIN_Y && y <= COAL_MAX_Y;
            const inIron = y >= IRON_MIN_Y && y <= IRON_MAX_Y;
            if (inCoal) stone.coal++;
            if (inIron) stone.iron++;
            if (id === Block.COAL_ORE) {
              if (!inCoal) throw new Error(`seed ${seed}: coal ore at y ${y}`);
              ore.coal++;
            }
            if (id === Block.IRON_ORE) {
              if (!inIron) throw new Error(`seed ${seed}: iron ore at y ${y}`);
              ore.iron++;
            }
            if (!isOre(id)) continue;
            const x = cx * CHUNK_SIZE + (i % CHUNK_SIZE);
            const z = cz * CHUNK_SIZE + (Math.floor(i / CHUNK_SIZE) % CHUNK_SIZE);
            // Veins at the edge of the area may continue outside of it: not counted.
            if (x === MIN || x === MAX - 1 || z === MIN || z === MAX - 1) continue;
            oreBlocks++;
            if (
              get(x + 1, y, z) === id ||
              get(x - 1, y, z) === id ||
              get(x, y + 1, z) === id ||
              get(x, y - 1, z) === id ||
              get(x, y, z + 1) === id ||
              get(x, y, z - 1) === id
            ) {
              withNeighbour++;
            }
          }
        }
      }
      const coalShare = ore.coal / stone.coal;
      const ironShare = ore.iron / stone.iron;
      expect(coalShare, `coal, seed ${seed}`).toBeGreaterThanOrEqual(0.008);
      expect(coalShare, `coal, seed ${seed}`).toBeLessThanOrEqual(0.016);
      expect(ironShare, `iron, seed ${seed}`).toBeGreaterThanOrEqual(0.004);
      expect(ironShare, `iron, seed ${seed}`).toBeLessThanOrEqual(0.008);
      expect(withNeighbour / oreBlocks, `veins, seed ${seed}`).toBeGreaterThanOrEqual(0.9);
    }
  });

  it('do not depend on generation order and cross chunk borders (Phase 3 AC1.4)', () => {
    for (const seed of SEEDS) {
      const { chunks, get } = areaOf(seed);
      // The same chunks from a fresh generator, in the opposite order.
      const fresh = new Terrain(seed);
      for (let cz = 1; cz >= -2; cz--) {
        for (let cx = 1; cx >= -2; cx--) {
          const again = fresh.generateChunk(cx, cz);
          const first = chunks.get(chunkKey(cx, cz)) as Uint8Array;
          expect(Buffer.from(again).equals(Buffer.from(first))).toBe(true);
        }
      }
      // And a single chunk on its own, with no neighbour generated at all.
      const alone = new Terrain(seed).generateChunk(0, 0);
      expect(Buffer.from(alone).equals(Buffer.from(chunks.get('0,0') as Uint8Array))).toBe(true);

      // An ore block in the last column of a chunk with the same ore right across.
      let spanning = 0;
      for (let x = MIN + CHUNK_SIZE - 1; x < MAX - 1; x += CHUNK_SIZE) {
        for (let z = MIN; z < MAX; z++) {
          for (let y = IRON_MIN_Y; y <= COAL_MAX_Y; y++) {
            const id = get(x, y, z);
            if (id !== null && isOre(id) && get(x + 1, y, z) === id) spanning++;
          }
        }
      }
      expect(spanning, `seed ${seed}`).toBeGreaterThan(0);
    }
  });

  it('put coal close to the surface near every spawn (Phase 3 AC1.7)', () => {
    for (let seed = 100; seed < 120; seed++) {
      const terrain = new Terrain(seed);
      const spawn = findSpawn(terrain);
      let found = false;
      const c0x = Math.floor((spawn.x - 24) / CHUNK_SIZE);
      const c1x = Math.floor((spawn.x + 24) / CHUNK_SIZE);
      const c0z = Math.floor((spawn.z - 24) / CHUNK_SIZE);
      const c1z = Math.floor((spawn.z + 24) / CHUNK_SIZE);
      for (let cz = c0z; cz <= c1z && !found; cz++) {
        for (let cx = c0x; cx <= c1x && !found; cx++) {
          const blocks = terrain.generateChunk(cx, cz);
          for (let lz = 0; lz < CHUNK_SIZE && !found; lz++) {
            for (let lx = 0; lx < CHUNK_SIZE && !found; lx++) {
              const x = cx * CHUNK_SIZE + lx;
              const z = cz * CHUNK_SIZE + lz;
              if (Math.abs(x - spawn.x) > 24 || Math.abs(z - spawn.z) > 24) continue;
              const h = terrain.heightAt(x, z);
              for (let y = h; y >= h - 8 && y > 0; y--) {
                if (blocks[blockIndex(lx, y, lz)] === Block.COAL_ORE) found = true;
              }
            }
          }
        }
      }
      expect(found, `seed ${seed}`).toBe(true);
    }
  });
});

describe('rock', () => {
  it('covers high ground and steep steps, and nothing low and flat (Phase 3 AC1.5)', () => {
    let rockColumns = 0;
    let steepColumns = 0;
    for (const seed of SEEDS) {
      const { terrain, get } = areaOf(seed);
      for (let z = MIN; z < MAX; z++) {
        for (let x = MIN; x < MAX; x++) {
          const h = terrain.heightAt(x, z);
          // Rock is a rule for land; lake beds keep their sand, dirt and clay.
          if (h < SEA_LEVEL) continue;
          const steep =
            Math.abs(h - terrain.heightAt(x + 1, z)) >= 3 ||
            Math.abs(h - terrain.heightAt(x - 1, z)) >= 3 ||
            Math.abs(h - terrain.heightAt(x, z + 1)) >= 3 ||
            Math.abs(h - terrain.heightAt(x, z - 1)) >= 3;
          const top = get(x, h, z) as number;
          const rocky = top === Block.STONE || isOre(top);
          if (rocky !== terrain.isRock(x, z)) throw new Error(`isRock disagrees at ${x},${z}`);
          if (rocky) rockColumns++;
          if (steep) steepColumns++;
          if ((h >= 88 || steep) && !rocky) {
            throw new Error(`seed ${seed}: no rock at ${x},${z} (h ${h}, steep ${steep})`);
          }
          if (h < 72 && !steep && rocky) throw new Error(`seed ${seed}: rock at ${x},${z}, h ${h}`);
          if (rocky) {
            // Bare rock: stone or ore all the way down, no soil.
            for (let y = h - 1; y >= h - 4; y--) {
              const id = get(x, y, z) as number;
              if (id !== Block.STONE && !isOre(id)) throw new Error(`soil in rock at ${x},${z}`);
            }
          }
        }
      }
    }
    expect(rockColumns).toBeGreaterThan(1000);
    expect(steepColumns).toBeGreaterThan(10);
  });

  it('carries no trees (Phase 3 AC1.5)', () => {
    let logs = 0;
    for (const seed of SEEDS) {
      const { terrain, get } = areaOf(seed);
      for (let z = MIN; z < MAX; z++) {
        for (let x = MIN; x < MAX; x++) {
          const h = terrain.heightAt(x, z);
          if (get(x, h + 1, z) !== Block.LOG) continue;
          logs++;
          expect(get(x, h, z)).toBe(Block.GRASS);
          expect(terrain.isRock(x, z)).toBe(false);
          expect(terrain.treeAt(x, z)).toBeGreaterThan(0);
        }
      }
    }
    expect(logs).toBeGreaterThan(500);
  });

  it('is never under the spawn: 20 seeds start on grass (Phase 3 AC1.5)', () => {
    for (let seed = 100; seed < 120; seed++) {
      const terrain = new Terrain(seed);
      const spawn = findSpawn(terrain);
      const cx = Math.floor(spawn.x / CHUNK_SIZE);
      const cz = Math.floor(spawn.z / CHUNK_SIZE);
      const blocks = terrain.generateChunk(cx, cz);
      const lx = spawn.x - cx * CHUNK_SIZE;
      const lz = spawn.z - cz * CHUNK_SIZE;
      expect(blocks[blockIndex(lx, spawn.y - 1, lz)], `seed ${seed}`).toBe(Block.GRASS);
      expect(terrain.isRock(spawn.x, spawn.z)).toBe(false);
    }
  });
});

describe('clay', () => {
  it('lies in the top two blocks of lake beds under deep enough water (Phase 3 AC1.6)', () => {
    for (const seed of SEEDS) {
      const { terrain, chunks, get } = areaOf(seed);
      let underwater = 0;
      let clayColumns = 0;
      for (let z = MIN; z < MAX; z++) {
        for (let x = MIN; x < MAX; x++) {
          const h = terrain.heightAt(x, z);
          if (h < SEA_LEVEL) underwater++;
          if (get(x, h, z) !== Block.CLAY) continue;
          clayColumns++;
          expect(SEA_LEVEL - h).toBeGreaterThanOrEqual(2);
          expect(get(x, h + 1, z)).toBe(Block.WATER);
          expect(get(x, h + 2, z)).toBe(Block.WATER);
          expect(get(x, h - 1, z)).toBe(Block.CLAY);
          expect(get(x, h - 2, z)).not.toBe(Block.CLAY);
        }
      }
      // No clay anywhere else: every clay block belongs to one of the columns above.
      let clayBlocks = 0;
      for (const blocks of chunks.values()) {
        for (let i = 0; i < blocks.length; i++) if (blocks[i] === Block.CLAY) clayBlocks++;
      }
      expect(clayBlocks).toBe(clayColumns * 2);
      const share = clayColumns / underwater;
      expect(share, `seed ${seed}`).toBeGreaterThanOrEqual(0.04);
      expect(share, `seed ${seed}`).toBeLessThanOrEqual(0.12);
    }
  });
});

describe('Phase 1 terrain properties', () => {
  it('keep their limits: heights, water, smooth neighbours (Phase 3 AC1.8)', () => {
    let columns = 0;
    let water = 0;
    let pairs = 0;
    let smooth = 0;
    for (const seed of SEEDS) {
      const { terrain } = areaOf(seed);
      for (let z = MIN; z < MAX; z++) {
        for (let x = MIN; x < MAX; x++) {
          const h = terrain.heightAt(x, z);
          if (h < 20 || h > 110) throw new Error(`height ${h} out of range`);
          columns++;
          if (h < SEA_LEVEL) water++;
          pairs++;
          if (Math.abs(h - terrain.heightAt(x + 1, z)) <= 3) smooth++;
        }
      }
    }
    expect(water / columns).toBeGreaterThan(0.1);
    expect(water / columns).toBeLessThan(0.6);
    expect(smooth / pairs).toBeGreaterThanOrEqual(0.99);
  });

  it('keep the tree density within 20 % on land that is not rock (Phase 3 AC1.8)', () => {
    // Phase 1 measured 1.80 trees per 100 grass columns (docs/phase-1-report.md).
    const PHASE_1_DENSITY = 1.8;
    for (const seed of SEEDS) {
      const { terrain } = areaOf(seed);
      let grass = 0;
      let trees = 0;
      for (let z = MIN; z < MAX; z++) {
        for (let x = MIN; x < MAX; x++) {
          if (terrain.isGrass(x, z)) grass++;
          if (terrain.treeAt(x, z) > 0) trees++;
        }
      }
      const density = (trees / grass) * 100;
      expect(density, `seed ${seed}`).toBeGreaterThan(PHASE_1_DENSITY * 0.8);
      expect(density, `seed ${seed}`).toBeLessThan(PHASE_1_DENSITY * 1.2);
    }
  });

  it('are what remains without rock, ores and clay', () => {
    const terrain = new Terrain(1337);
    const seen = new Set<number>();
    for (let cz = -4; cz < 4; cz++) {
      for (let cx = -4; cx < 4; cx++) {
        for (const id of terrain.generateChunk(cx, cz, NO_FEATURES)) seen.add(id);
      }
    }
    expect([...seen].sort((a, b) => a - b)).toEqual([
      Block.AIR,
      Block.GRASS,
      Block.DIRT,
      Block.STONE,
      Block.SAND,
      Block.LOG,
      Block.LEAVES,
      Block.WATER,
      Block.BEDROCK,
    ]);
  });
});

describe('generation speed', () => {
  it('is at most 20 % slower than the Phase 1 terrain (Phase 3 AC1.10)', () => {
    // Both generators run in the same process on the same contiguous area, as the game
    // loads it; each round starts with a fresh generator so no cache is warm.
    const run = (features: typeof ALL_FEATURES): number => {
      const terrain = new Terrain(5);
      const start = performance.now();
      for (let cz = 0; cz < 7; cz++) {
        for (let cx = 0; cx < 7; cx++) terrain.generateChunk(cx, cz, features);
      }
      return (performance.now() - start) / 49;
    };
    run(ALL_FEATURES);
    run(NO_FEATURES);
    let plain = Infinity;
    let full = Infinity;
    for (let round = 0; round < 40; round++) {
      plain = Math.min(plain, run(NO_FEATURES));
      full = Math.min(full, run(ALL_FEATURES));
    }
    expectFasterThan(full, plain * 1.2);
    // The absolute limit of Phase 1 (AC4.6) still holds with a wide margin.
    expectFasterThan(full, 15);
  });
});
