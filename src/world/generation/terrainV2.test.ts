// Generator version 2 (Phase 7 part A): shapes, dispatch, trees off, order independence.
import { describe, expect, it } from 'vitest';
import { CHUNK_SIZE, SEA_LEVEL, WORLD_HEIGHT } from '../../game/config';
import { Block } from '../blocks';
import { blockIndex } from '../chunk';
import { TERRAIN_CHECKSUMS_1337_V2 } from '../../testing/terrainChecksum';
import { SPAWN_MIN_TREES, SPAWN_WOOD_RADIUS } from '../../game/config';
import { expectFasterThan } from '../../testing/timing';
import { SPAWN_TREE_CLEARANCE, findSpawn } from './spawn';
import { Terrain, generateChunk, getTerrain, terrainChecksum } from './terrain';
import { TREE_MIN_SPACING } from './trees';
import { TerrainV2 } from './terrainV2';
import { TERRAIN_SHAPES, TREE_DENSITIES, type WorldGen, type WorldOptions } from './worldOptions';

const gen = (terrain: WorldOptions['terrain'], trees: WorldOptions['trees']): WorldGen => ({
  version: 2,
  options: { terrain, trees },
});

describe('generator 2 shapes', () => {
  it('Phase 7 AC2.1: hilly has the heights of version 1 (sample; the full area is slow)', () => {
    for (const seed of [1337, 42]) {
      const v1 = new Terrain(seed);
      const v2 = new TerrainV2(seed, { terrain: 'hilly', trees: 'few' });
      for (let z = -160; z < 160; z += 3) {
        for (let x = -160; x < 160; x += 3) expect(v2.heightAt(x, z)).toBe(v1.heightAt(x, z));
      }
    }
  });

  it('keep the basins: below sea level every shape has the same ground', () => {
    const seed = 1337;
    const shapes = TERRAIN_SHAPES.map((t) => new TerrainV2(seed, { terrain: t, trees: 'none' }));
    let deep = 0;
    for (let z = -160; z < 160; z += 4) {
      for (let x = -160; x < 160; x += 4) {
        const h = shapes.map((s) => s.heightAt(x, z));
        // Where the hilly ground is well below the water, the flatter shapes are too.
        if (h[2] < SEA_LEVEL - 8) {
          deep++;
          expect(h[0]).toBeLessThan(SEA_LEVEL);
          expect(h[1]).toBeLessThan(SEA_LEVEL);
        }
      }
    }
    expect(deep).toBeGreaterThan(100);
  });

  it('is chosen by generateChunk and the checksum, cached per seed and options', () => {
    expect(getTerrain(1337, gen('flat', 'few'))).toBe(getTerrain(1337, gen('flat', 'few')));
    expect(getTerrain(1337, gen('flat', 'few'))).not.toBe(getTerrain(1337, gen('flat', 'many')));
    expect(getTerrain(1337, gen('flat', 'few'))).toBeInstanceOf(TerrainV2);
    expect(getTerrain(1337)).toBeInstanceOf(Terrain);
    const flat = generateChunk(1337, 2, 3, gen('flat', 'few'));
    const fresh = new TerrainV2(1337, { terrain: 'flat', trees: 'few' }).generateChunk(2, 3);
    expect(Buffer.from(flat).equals(Buffer.from(fresh))).toBe(true);
    const sums = new Set<number>();
    for (const t of TERRAIN_SHAPES) sums.add(terrainChecksum(1337, gen(t, 'normal')));
    expect(sums.size).toBe(3);
  });

  it('has no tree with none, and every shape has the version 1 layers', () => {
    const terrain = new TerrainV2(1337, { terrain: 'balanced', trees: 'none' });
    for (let cz = -2; cz < 2; cz++) {
      for (let cx = -2; cx < 2; cx++) {
        const blocks = terrain.generateChunk(cx, cz);
        expect(blocks.includes(Block.LOG)).toBe(false);
        expect(blocks.includes(Block.LEAVES)).toBe(false);
        for (let lz = 0; lz < CHUNK_SIZE; lz += 5) {
          for (let lx = 0; lx < CHUNK_SIZE; lx += 5) {
            const x = cx * CHUNK_SIZE + lx;
            const z = cz * CHUNK_SIZE + lz;
            const h = terrain.heightAt(x, z);
            expect(blocks[blockIndex(lx, 0, lz)]).toBe(Block.BEDROCK);
            const top = blocks[blockIndex(lx, h, lz)];
            if (terrain.isGrass(x, z)) expect(top).toBe(Block.GRASS);
            if (h < SEA_LEVEL) expect(blocks[blockIndex(lx, SEA_LEVEL, lz)]).toBe(Block.WATER);
          }
        }
      }
    }
  });

  it('knows every combination of the options', () => {
    for (const t of TERRAIN_SHAPES) {
      for (const trees of TREE_DENSITIES) {
        expect(generateChunk(7, 0, 0, gen(t, trees)).length).toBeGreaterThan(0);
      }
    }
  });
});

const COMBINATIONS = TERRAIN_SHAPES.flatMap((t) => TREE_DENSITIES.map((trees) => gen(t, trees)));
const nameOf = (g: WorldGen): string =>
  g.version === 1 ? 'v1' : `${g.options.terrain}/${g.options.trees}`;

describe('generator 2 determinism', () => {
  it('Phase 7 AC4.1: has the recorded checksum of seed 1337 for every combination', () => {
    for (const g of COMBINATIONS) {
      expect(terrainChecksum(1337, g), nameOf(g)).toBe(TERRAIN_CHECKSUMS_1337_V2[nameOf(g)]);
    }
    expect(new Set(Object.values(TERRAIN_CHECKSUMS_1337_V2)).size).toBe(12);
  });

  it('Phase 7 AC4.2: a chunk is the same alone and after its neighbours, in any order', () => {
    for (const g of COMBINATIONS) {
      if (g.version !== 2) continue;
      const alone = new TerrainV2(31337, g.options).generateChunk(1, -1);
      const around = new TerrainV2(31337, g.options);
      for (const [cx, cz] of [
        [2, -1],
        [1, 0],
        [0, -2],
        [0, -1],
        [2, 0],
      ]) {
        around.generateChunk(cx, cz);
      }
      const after = around.generateChunk(1, -1);
      expect(Buffer.from(after).equals(Buffer.from(alone)), nameOf(g)).toBe(true);
    }
  });

  it('Phase 7 AC4.2: canopies across chunk borders are complete on both sides', () => {
    for (const trees of ['few', 'normal', 'many'] as const) {
      const terrain = new TerrainV2(7, { terrain: 'balanced', trees });
      const chunks = new Map<string, Uint8Array>();
      const blockAt = (x: number, y: number, z: number): number => {
        const cx = Math.floor(x / CHUNK_SIZE);
        const cz = Math.floor(z / CHUNK_SIZE);
        const key = `${cx},${cz}`;
        let blocks = chunks.get(key);
        if (!blocks) {
          // Each chunk from a fresh generator: no cache shared between the two sides.
          blocks = new TerrainV2(7, { terrain: 'balanced', trees }).generateChunk(cx, cz);
          chunks.set(key, blocks);
        }
        return blocks[blockIndex(x - cx * CHUNK_SIZE, y, z - cz * CHUNK_SIZE)];
      };
      let crossing = 0;
      for (let z = -128; z < 128; z++) {
        for (let x = -128; x < 128; x++) {
          const trunk = terrain.treeAt(x, z);
          if (trunk === 0) continue;
          const lx = ((x % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
          const lz = ((z % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
          const nearBorder = lx < 2 || lx > CHUNK_SIZE - 3 || lz < 2 || lz > CHUNK_SIZE - 3;
          if (!nearBorder) continue;
          crossing++;
          const top = terrain.heightAt(x, z) + trunk;
          expect(blockAt(x, top, z)).toBe(Block.LOG);
          // The four sides of the second layer always hold leaves (or what was there before).
          for (const [dx, dz] of [
            [2, 0],
            [-2, 0],
            [0, 2],
            [0, -2],
          ]) {
            // Leaves fill only air, so a hillside may hold the cell; air means a cut canopy.
            expect(blockAt(x + dx, top - 1, z + dz), `${trees} ${x},${z}`).not.toBe(Block.AIR);
          }
        }
      }
      expect(crossing, trees).toBeGreaterThan(5);
    }
  });
});

describe('generator 2 trees', () => {
  it('keeps the spacing rule: no two trunks closer than the minimum spacing', () => {
    for (const trees of ['few', 'normal', 'many'] as const) {
      const terrain = new TerrainV2(42, { terrain: 'flat', trees });
      const trunks: [number, number][] = [];
      for (let z = -96; z < 96; z++) {
        for (let x = -96; x < 96; x++) if (terrain.treeAt(x, z) > 0) trunks.push([x, z]);
      }
      expect(trunks.length, trees).toBeGreaterThan(20);
      const at = new Set(trunks.map(([x, z]) => `${x},${z}`));
      for (const [x, z] of trunks) {
        for (let dz = -(TREE_MIN_SPACING - 1); dz < TREE_MIN_SPACING; dz++) {
          for (let dx = -(TREE_MIN_SPACING - 1); dx < TREE_MIN_SPACING; dx++) {
            if (dx === 0 && dz === 0) continue;
            expect(at.has(`${x + dx},${z + dz}`)).toBe(false);
          }
        }
      }
    }
  });

  it('places trunks on grass only, with the version 1 tree shape', () => {
    const terrain = new TerrainV2(1337, { terrain: 'hilly', trees: 'many' });
    let trees = 0;
    for (let cz = -2; cz < 2; cz++) {
      for (let cx = -2; cx < 2; cx++) {
        const blocks = terrain.generateChunk(cx, cz);
        for (let lz = 0; lz < CHUNK_SIZE; lz++) {
          for (let lx = 0; lx < CHUNK_SIZE; lx++) {
            const x = cx * CHUNK_SIZE + lx;
            const z = cz * CHUNK_SIZE + lz;
            const trunk = terrain.treeAt(x, z);
            if (trunk === 0) continue;
            trees++;
            expect(terrain.isGrass(x, z)).toBe(true);
            expect(trunk).toBeGreaterThanOrEqual(4);
            expect(trunk).toBeLessThanOrEqual(6);
            const h = terrain.heightAt(x, z);
            for (let y = h + 1; y <= h + trunk && y < WORLD_HEIGHT; y++) {
              expect(blocks[blockIndex(lx, y, lz)]).toBe(Block.LOG);
            }
          }
        }
      }
    }
    expect(trees).toBeGreaterThan(50);
  });

  it('makes forests and meadows: the forest weight varies slowly', () => {
    const terrain = new TerrainV2(1337, { terrain: 'balanced', trees: 'few' });
    let forest = 0;
    let meadow = 0;
    let step = 0;
    let steps = 0;
    for (let z = -400; z < 400; z += 8) {
      for (let x = -400; x < 400; x += 8) {
        const w = terrain.forestWeight(x, z);
        if (w > 0.9) forest++;
        if (w < 0.1) meadow++;
        // Neighbouring columns differ by little.
        step += Math.abs(terrain.forestWeight(x + 1, z) - w);
        steps++;
      }
    }
    expect(step / steps).toBeLessThan(0.02);
    expect(forest).toBeGreaterThan(100);
    expect(meadow).toBeGreaterThan(1000);
  });
});

describe('generator 2 spawn', () => {
  it('Phase 7 AC3.3: grass, clear of trunks, with wood near it, found quickly', () => {
    let slowest = 0;
    for (const t of TERRAIN_SHAPES) {
      for (const trees of ['few', 'normal', 'many'] as const) {
        for (let seed = 1; seed <= 20; seed++) {
          const terrain = new TerrainV2(seed, { terrain: t, trees });
          const start = performance.now();
          const spawn = findSpawn(terrain);
          slowest = Math.max(slowest, performance.now() - start);
          const name = `${t}/${trees} seed ${seed}`;
          expect(terrain.isGrass(spawn.x, spawn.z), name).toBe(true);
          expect(spawn.y).toBe(terrain.heightAt(spawn.x, spawn.z) + 1);
          let near = 0;
          let wood = 0;
          for (let dz = -SPAWN_WOOD_RADIUS; dz <= SPAWN_WOOD_RADIUS; dz++) {
            for (let dx = -SPAWN_WOOD_RADIUS; dx <= SPAWN_WOOD_RADIUS; dx++) {
              if (terrain.treeAt(spawn.x + dx, spawn.z + dz) === 0) continue;
              wood++;
              if (Math.max(Math.abs(dx), Math.abs(dz)) <= SPAWN_TREE_CLEARANCE) near++;
            }
          }
          expect(near, name).toBe(0);
          expect(wood, name).toBeGreaterThanOrEqual(SPAWN_MIN_TREES);
        }
      }
    }
    expectFasterThan(slowest, 200);
  });

  it('without trees uses the plain rule of version 1', () => {
    for (let seed = 1; seed <= 5; seed++) {
      const two = new TerrainV2(seed, { terrain: 'hilly', trees: 'none' });
      const spawn = findSpawn(two);
      expect(two.isGrass(spawn.x, spawn.z)).toBe(true);
      // Hilly has version 1's heights; with no trees nothing blocks the first grass column.
      const one = new Terrain(seed);
      let first: { x: number; z: number } | null = null;
      for (let ring = 0; ring < 64 && !first; ring++) {
        for (let dz = -ring; dz <= ring && !first; dz++) {
          for (let dx = -ring; dx <= ring && !first; dx++) {
            if (Math.max(Math.abs(dx), Math.abs(dz)) !== ring) continue;
            if (one.isGrass(dx, dz)) first = { x: dx, z: dz };
          }
        }
      }
      expect(first).toEqual({ x: spawn.x, z: spawn.z });
    }
  });
});
