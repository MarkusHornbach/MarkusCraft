// Generator 4's checksums, dispatch, chest cells and places (Phase 8 part B3b, AC1.1–AC1.3).
import { describe, expect, it } from 'vitest';
import { CHUNK_SIZE } from '../../game/config';
import {
  TERRAIN_CHECKSUMS_1337_V3,
  TERRAIN_CHECKSUMS_1337_V4,
} from '../../testing/terrainChecksum';
import { Block } from '../blocks';
import { shaftBlock, shaftChestCell } from './shafts';
import { type Place, generateChunk, getTerrain, terrainChecksumAt } from './terrain';
import { TerrainV3 } from './terrainV3';
import { TerrainV4, spawnChestChunk } from './terrainV4';
import {
  TERRAIN_SHAPES,
  TREE_DENSITIES,
  describeWorldGen,
  debugWorldGen,
  isKnownGeneratorVersion,
  worldGenOf,
} from './worldOptions';

const PRESETS = TERRAIN_SHAPES.flatMap((terrain) =>
  TREE_DENSITIES.map((trees) => ({ terrain, trees })),
);
const LAYER = CHUNK_SIZE * CHUNK_SIZE;
const BALANCED = { terrain: 'balanced', trees: 'few' } as const;

function blockAt(
  seed: number,
  gen: Parameters<typeof generateChunk>[3],
  x: number,
  y: number,
  z: number,
): number {
  const cx = Math.floor(x / CHUNK_SIZE);
  const cz = Math.floor(z / CHUNK_SIZE);
  const chunk = generateChunk(seed, cx, cz, gen);
  return chunk[x - cx * CHUNK_SIZE + (z - cz * CHUNK_SIZE) * CHUNK_SIZE + y * LAYER];
}

describe('generator 4', () => {
  it('Phase 8B3b AC1.3 has the recorded checksums around the spawn chest of seed 1337', () => {
    for (const options of PRESETS) {
      const key = `${options.terrain}/${options.trees}`;
      const terrain = getTerrain(1337, { version: 4, options }) as TerrainV4;
      const chunk = spawnChestChunk(terrain);
      expect(chunk, key).not.toBeNull();
      if (!chunk) continue;
      const v4 = terrainChecksumAt(1337, { version: 4, options }, chunk.cx, chunk.cz);
      const v3 = terrainChecksumAt(1337, { version: 3, options }, chunk.cx, chunk.cz);
      expect(v4, key).toBe(TERRAIN_CHECKSUMS_1337_V4[key]);
      expect(v4, key).not.toBe(v3);
    }
    expect(Object.keys(TERRAIN_CHECKSUMS_1337_V4)).toHaveLength(12);
    // Generator 3 stays as it was.
    expect(Object.keys(TERRAIN_CHECKSUMS_1337_V3)).toHaveLength(12);
  });

  it('Phase 8B3b AC1.1 version 4 is known, labelled and dispatched to TerrainV4', () => {
    expect(isKnownGeneratorVersion(4)).toBe(true);
    expect(isKnownGeneratorVersion(5)).toBe(false);
    expect(worldGenOf(4, BALANCED)).toEqual({ version: 4, options: BALANCED });
    expect(worldGenOf(4, null)).toBeNull();
    const gen = { version: 4, options: BALANCED } as const;
    expect(describeWorldGen(gen)).toBe('Balanced · Few trees · Caves · Loot');
    expect(describeWorldGen({ version: 3, options: BALANCED })).toBe(
      'Balanced · Few trees · Caves',
    );
    expect(debugWorldGen(gen)).toBe('Generator 4 · balanced · few');
    const terrain = getTerrain(1337, gen);
    expect(terrain).toBeInstanceOf(TerrainV4);
    expect(getTerrain(1337, { version: 3, options: BALANCED })).not.toBeInstanceOf(TerrainV4);
    expect(generateChunk(1337, 0, 0, gen)).toEqual(
      new TerrainV4(1337, BALANCED).generateChunk(0, 0),
    );
  });

  it('Phase 8B3b AC1.2 the spawn shaft holds one chest at its chest cell, on stone bricks', () => {
    const gen = { version: 4, options: BALANCED } as const;
    const terrain = getTerrain(1337, gen) as TerrainV4;
    const s = terrain.shafts.spawnShaft();
    expect(s).not.toBeNull();
    if (!s) return;
    const c = shaftChestCell(s);
    // Generator 3 leaves air there: a free chamber corner without a torch.
    expect(shaftBlock(s, c.x, c.y, c.z)).toBe(Block.AIR);
    expect(blockAt(1337, gen, c.x, c.y, c.z)).toBe(Block.CHEST);
    expect(blockAt(1337, gen, c.x, c.y - 1, c.z)).toBe(Block.STONE_BRICKS);
    expect(blockAt(1337, { version: 3, options: BALANCED }, c.x, c.y, c.z)).toBe(Block.AIR);
    expect(terrain.lootAt(c.x, c.y, c.z)).not.toBeNull();
    expect(terrain.lootAt(c.x, c.y + 1, c.z)).toBeNull();
    expect(terrain.lootAt(c.x + 1, c.y, c.z)).toBeNull();
  });

  it('Phase 8B3b AC1.2 placesIn lists generator 3 places, then one chest per shaft', () => {
    const v3 = new TerrainV3(1337, BALANCED);
    const v4 = new TerrainV4(1337, BALANCED);
    const a: Place[] = [];
    const b: Place[] = [];
    v3.placesIn(-600, -600, 600, 600, a);
    v4.placesIn(-600, -600, 600, 600, b);
    expect(b.slice(0, a.length)).toEqual(a);
    const chests = b.slice(a.length);
    expect(chests.every((p) => p.kind === 'chest')).toBe(true);
    const shafts = a.filter((p) => p.kind === 'shaft');
    expect(chests.length).toBe(shafts.length);
    for (const p of chests) expect(v4.lootAt(p.x, p.y, p.z), `${p.x} ${p.z}`).not.toBeNull();
  });
});
