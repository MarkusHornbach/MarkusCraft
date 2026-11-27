// Generator 3's checksums and dispatch (Phase 8 part B2a, AC1.1).
import { describe, expect, it } from 'vitest';
import {
  TERRAIN_CHECKSUMS_1337_V2,
  TERRAIN_CHECKSUMS_1337_V3,
} from '../../testing/terrainChecksum';
import { findSpawn } from './spawn';
import { generateChunk, getTerrain, terrainChecksum } from './terrain';
import { TerrainV3 } from './terrainV3';
import { TERRAIN_SHAPES, TREE_DENSITIES } from './worldOptions';

const PRESETS = TERRAIN_SHAPES.flatMap((terrain) =>
  TREE_DENSITIES.map((trees) => ({ terrain, trees })),
);

describe('generator 3', () => {
  it('Phase 8B2a AC1.1 has the recorded checksum of seed 1337 for every combination', () => {
    for (const options of PRESETS) {
      const key = `${options.terrain}/${options.trees}`;
      expect(terrainChecksum(1337, { version: 3, options }), key).toBe(
        TERRAIN_CHECKSUMS_1337_V3[key],
      );
      if (options.trees !== 'many') {
        expect(TERRAIN_CHECKSUMS_1337_V3[key], key).not.toBe(TERRAIN_CHECKSUMS_1337_V2[key]);
      }
    }
    expect(Object.keys(TERRAIN_CHECKSUMS_1337_V3)).toHaveLength(12);
  });

  it('Phase 8B2a AC1.1 generateChunk dispatches version 3 to TerrainV3', () => {
    const gen = { version: 3, options: { terrain: 'balanced', trees: 'few' } } as const;
    expect(getTerrain(1337, gen)).toBeInstanceOf(TerrainV3);
    expect(generateChunk(1337, 0, 0, gen)).toEqual(
      new TerrainV3(1337, gen.options).generateChunk(0, 0),
    );
    // The spawn of findSpawn is the terrain's own (no shafts, no caves below).
    const terrain = getTerrain(1337, gen) as TerrainV3;
    expect(findSpawn(terrain)).toEqual(terrain.spawnPoint());
  });
});
