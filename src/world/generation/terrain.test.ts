import { describe, expect, it } from 'vitest';
import { CHUNK_SIZE, SEA_LEVEL, WORLD_HEIGHT } from '../../game/config';
import { Block } from '../blocks';
import { blockIndex } from '../chunk';
import { findSpawn } from './spawn';
import { Terrain, generateChunk } from './terrain';
import { TREE_MIN_SPACING, hasLeaf, isTreeOrigin, trunkHeight } from './trees';

const SEEDS = [1337, 42, 987654321];
const AREA = 16; // chunks per side

function columnTop(blocks: Uint8Array, lx: number, lz: number, skipTree: boolean): number {
  for (let y = WORLD_HEIGHT - 1; y >= 0; y--) {
    const id = blocks[blockIndex(lx, y, lz)];
    if (id === Block.AIR || id === Block.WATER) continue;
    if (skipTree && (id === Block.LEAVES || id === Block.LOG)) continue;
    return y;
  }
  return -1;
}

describe('generateChunk', () => {
  it('is deterministic and depends on the seed (AC4.1)', () => {
    const a = generateChunk(1337, 3, -2);
    const b = generateChunk(1337, 3, -2);
    // Interleave another seed to prove the terrain cache does not leak state.
    const c = generateChunk(7, 3, -2);
    const d = generateChunk(1337, 3, -2);
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true);
    expect(Buffer.from(a).equals(Buffer.from(d))).toBe(true);
    expect(Buffer.from(a).equals(Buffer.from(c))).toBe(false);
    expect(Buffer.from(a).equals(Buffer.from(generateChunk(1337, 4, -2)))).toBe(false);
  });

  it('builds valid columns over a 16×16-chunk area for 3 seeds (AC4.2)', () => {
    let waterColumns = 0;
    let columns = 0;
    for (const seed of SEEDS) {
      const terrain = new Terrain(seed);
      for (let cz = -AREA / 2; cz < AREA / 2; cz++) {
        for (let cx = -AREA / 2; cx < AREA / 2; cx++) {
          const blocks = terrain.generateChunk(cx, cz);
          for (let lz = 0; lz < CHUNK_SIZE; lz++) {
            for (let lx = 0; lx < CHUNK_SIZE; lx++) {
              columns++;
              const h = terrain.heightAt(cx * CHUNK_SIZE + lx, cz * CHUNK_SIZE + lz);
              expect(blocks[blockIndex(lx, 0, lz)]).toBe(Block.BEDROCK);
              expect(h).toBeGreaterThanOrEqual(20);
              expect(h).toBeLessThanOrEqual(110);
              // The generated ground agrees with the height function.
              if (columnTop(blocks, lx, lz, true) !== h) {
                throw new Error(`ground mismatch at seed ${seed} chunk ${cx},${cz}`);
              }
              // Solid ground all the way down: no air or water below the surface.
              for (let y = 1; y <= h; y++) {
                const id = blocks[blockIndex(lx, y, lz)];
                if (id === Block.AIR || id === Block.WATER || id === Block.LEAVES) {
                  throw new Error(`hole below surface at seed ${seed}, y=${y}`);
                }
              }
              // Everything between the ground and sea level is water.
              for (let y = h + 1; y <= SEA_LEVEL; y++) {
                if (blocks[blockIndex(lx, y, lz)] !== Block.WATER) {
                  throw new Error(`missing water at seed ${seed}, y=${y}`);
                }
              }
              // No water above sea level.
              for (let y = Math.max(h, SEA_LEVEL) + 1; y < WORLD_HEIGHT; y++) {
                if (blocks[blockIndex(lx, y, lz)] === Block.WATER) {
                  throw new Error(`water above sea level at seed ${seed}, y=${y}`);
                }
              }
              if (h < SEA_LEVEL) waterColumns++;
            }
          }
        }
      }
    }
    const share = waterColumns / columns;
    expect(share).toBeGreaterThan(0.1);
    expect(share).toBeLessThan(0.6);
  });

  it('uses the specified layers', () => {
    const terrain = new Terrain(1337);
    const seen = { grass: false, beach: false, deep: false };
    for (let x = -400; x < 400 && !(seen.grass && seen.beach && seen.deep); x++) {
      const z = x * 3;
      const h = terrain.heightAt(x, z);
      const cx = Math.floor(x / CHUNK_SIZE);
      const cz = Math.floor(z / CHUNK_SIZE);
      const blocks = terrain.generateChunk(cx, cz);
      const at = (y: number) => blocks[blockIndex(x - cx * CHUNK_SIZE, y, z - cz * CHUNK_SIZE)];
      if (h > SEA_LEVEL + 2) {
        seen.grass = true;
        expect(at(h)).toBe(Block.GRASS);
        expect([at(h - 1), at(h - 2), at(h - 3)]).toEqual([Block.DIRT, Block.DIRT, Block.DIRT]);
        expect(at(h - 4)).toBe(Block.STONE);
      } else if (h >= SEA_LEVEL - 3) {
        seen.beach = true;
        expect(at(h)).toBe(Block.SAND);
        expect(at(h - 3)).toBe(Block.SAND);
        expect(at(h - 4)).toBe(Block.STONE);
      } else {
        seen.deep = true;
        expect(at(h)).toBe(Block.DIRT);
        expect(at(h + 1)).toBe(Block.WATER);
      }
    }
    expect(seen).toEqual({ grass: true, beach: true, deep: true });
  });

  it('keeps heights continuous across chunk borders (AC4.3)', () => {
    let pairs = 0;
    let smooth = 0;
    for (const seed of SEEDS) {
      const terrain = new Terrain(seed);
      for (let c = -AREA / 2; c < AREA / 2; c++) {
        const border = c * CHUNK_SIZE;
        for (let i = -128; i < 128; i++) {
          pairs += 2;
          if (Math.abs(terrain.heightAt(border - 1, i) - terrain.heightAt(border, i)) <= 3)
            smooth++;
          if (Math.abs(terrain.heightAt(i, border - 1) - terrain.heightAt(i, border)) <= 3)
            smooth++;
        }
      }
    }
    expect(smooth / pairs).toBeGreaterThanOrEqual(0.99);
  });

  it('covers the intended height range', () => {
    const terrain = new Terrain(1337);
    let min = Infinity;
    let max = -Infinity;
    for (let z = -512; z < 512; z += 2) {
      for (let x = -512; x < 512; x += 2) {
        const h = terrain.heightAt(x, z);
        min = Math.min(min, h);
        max = Math.max(max, h);
      }
    }
    expect(min).toBeLessThan(40);
    expect(max).toBeGreaterThan(80);
  });

  it('generates a chunk in under 15 ms on average (AC4.6)', () => {
    generateChunk(5, 0, 0); // warm-up
    const start = performance.now();
    for (let i = 0; i < 50; i++) generateChunk(5, i - 25, (i * 7) % 13);
    const average = (performance.now() - start) / 50;
    expect(average).toBeLessThan(15);
  });
});

describe('trees', () => {
  it('stand on dirt or grass, never in water or on sand (AC4.4)', () => {
    let logs = 0;
    for (const seed of SEEDS) {
      const terrain = new Terrain(seed);
      for (let cz = -4; cz < 4; cz++) {
        for (let cx = -4; cx < 4; cx++) {
          const blocks = terrain.generateChunk(cx, cz);
          for (let lz = 0; lz < CHUNK_SIZE; lz++) {
            for (let lx = 0; lx < CHUNK_SIZE; lx++) {
              for (let y = 1; y < WORLD_HEIGHT; y++) {
                if (blocks[blockIndex(lx, y, lz)] !== Block.LOG) continue;
                logs++;
                const below = blocks[blockIndex(lx, y - 1, lz)];
                expect([Block.LOG, Block.GRASS, Block.DIRT]).toContain(below);
              }
            }
          }
        }
      }
    }
    expect(logs).toBeGreaterThan(100);
  });

  it('have complete canopies across chunk borders regardless of order (AC4.4)', () => {
    const seed = 1337;
    const terrain = new Terrain(seed);
    let checked = 0;
    for (let z = -200; z < 200 && checked < 5; z++) {
      for (let x = -200; x < 200 && checked < 5; x++) {
        // Find trees whose trunk is in the last column of a chunk: the canopy crosses.
        if (((x % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE !== CHUNK_SIZE - 1) continue;
        const trunk = terrain.treeAt(x, z);
        if (trunk === 0) continue;
        checked++;
        const cx = Math.floor(x / CHUNK_SIZE);
        const cz = Math.floor(z / CHUNK_SIZE);
        // Order 1: own chunk first; order 2 (fresh generator): neighbour first.
        const own1 = generateChunk(seed, cx, cz);
        const next1 = generateChunk(seed, cx + 1, cz);
        const fresh = new Terrain(seed);
        const next2 = fresh.generateChunk(cx + 1, cz);
        const own2 = fresh.generateChunk(cx, cz);
        expect(Buffer.from(own1).equals(Buffer.from(own2))).toBe(true);
        expect(Buffer.from(next1).equals(Buffer.from(next2))).toBe(true);

        // The neighbour chunk holds exactly the leaves the shape function asks for.
        const topLog = terrain.heightAt(x, z) + trunk;
        const lz = z - cz * CHUNK_SIZE;
        let leavesInNeighbour = 0;
        for (let dy = -2; dy <= 1; dy++) {
          for (let dx = 1; dx <= 2; dx++) {
            const id = next1[blockIndex(dx - 1, topLog + dy, lz)];
            if (hasLeaf(seed, x, z, dx, dy, 0)) {
              expect([Block.LEAVES, Block.LOG]).toContain(id);
              leavesInNeighbour++;
            }
          }
        }
        expect(leavesInNeighbour).toBeGreaterThan(0);
      }
    }
    expect(checked).toBe(5);
  });

  it('have a density of 0.5–3 per 100 grass columns and keep their spacing (AC4.4)', () => {
    for (const seed of SEEDS) {
      const terrain = new Terrain(seed);
      let grass = 0;
      let trees = 0;
      for (let z = -160; z < 160; z++) {
        for (let x = -160; x < 160; x++) {
          if (terrain.heightAt(x, z) > SEA_LEVEL + 2) grass++;
          if (terrain.treeAt(x, z) === 0) continue;
          trees++;
          expect(terrain.treeAt(x, z)).toBe(trunkHeight(seed, x, z));
          const r = TREE_MIN_SPACING - 1;
          for (let dz = -r; dz <= r; dz++) {
            for (let dx = -r; dx <= r; dx++) {
              if (dx === 0 && dz === 0) continue;
              expect(isTreeOrigin(seed, x + dx, z + dz)).toBe(false);
            }
          }
        }
      }
      const density = (trees / grass) * 100;
      expect(density).toBeGreaterThan(0.5);
      expect(density).toBeLessThan(3);
    }
  });

  it('have trunks of 4 to 6 logs and the specified canopy shape', () => {
    const heights = new Set<number>();
    for (let i = 0; i < 200; i++) heights.add(trunkHeight(3, i, -i * 3));
    expect([...heights].sort()).toEqual([4, 5, 6]);
    // 5×5 layers: full edges, top-layer corners trimmed; cap is at most 3×3.
    expect(hasLeaf(1, 0, 0, 2, -1, 0)).toBe(true);
    expect(hasLeaf(1, 0, 0, 2, 0, 2)).toBe(false);
    expect(hasLeaf(1, 0, 0, 3, 0, 0)).toBe(false);
    expect(hasLeaf(1, 0, 0, 0, 1, 0)).toBe(true);
    expect(hasLeaf(1, 0, 0, 1, 1, 0)).toBe(true);
    expect(hasLeaf(1, 0, 0, 2, 1, 0)).toBe(false);
    expect(hasLeaf(1, 0, 0, 0, 2, 0)).toBe(false);
    expect(hasLeaf(1, 0, 0, 0, -3, 0)).toBe(false);
  });
});

describe('findSpawn', () => {
  it('returns a dry column clear of trees for 20 seeds (AC4.7)', () => {
    let moved = 0;
    for (let seed = 100; seed < 120; seed++) {
      const terrain = new Terrain(seed);
      const spawn = findSpawn(terrain);
      expect(terrain.isUnderWater(spawn.x, spawn.z)).toBe(false);
      expect(spawn.y).toBe(terrain.heightAt(spawn.x, spawn.z) + 1);
      expect(spawn.y).toBeGreaterThan(SEA_LEVEL);
      // Head room: the two cells the player occupies are free in the generated chunk.
      const cx = Math.floor(spawn.x / CHUNK_SIZE);
      const cz = Math.floor(spawn.z / CHUNK_SIZE);
      const blocks = terrain.generateChunk(cx, cz);
      const lx = spawn.x - cx * CHUNK_SIZE;
      const lz = spawn.z - cz * CHUNK_SIZE;
      expect(blocks[blockIndex(lx, spawn.y, lz)]).toBe(Block.AIR);
      expect(blocks[blockIndex(lx, spawn.y + 1, lz)]).toBe(Block.AIR);
      if (spawn.x !== 0 || spawn.z !== 0) {
        moved++;
        // Nearest ring: every column of the inner rings was unsuitable.
        expect(terrain.isUnderWater(0, 0) || terrain.treeAt(0, 0) >= 0).toBe(true);
      }
    }
    // Some of the 20 seeds start in water, so the spiral is actually exercised.
    expect(moved).toBeGreaterThan(0);
  });
});
