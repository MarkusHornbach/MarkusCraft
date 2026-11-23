// Generator version 2 (Phase 7 part A): shapes, dispatch, trees off, order independence.
import { describe, expect, it } from 'vitest';
import { CHUNK_SIZE, SEA_LEVEL } from '../../game/config';
import { Block } from '../blocks';
import { blockIndex } from '../chunk';
import { Terrain, generateChunk, getTerrain, terrainChecksum } from './terrain';
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
