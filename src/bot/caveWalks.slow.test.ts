// Phase 8B2a AC3.1–AC3.3: entrances, ravines and the spawn shaft are walked without digging.
import { describe, expect, it } from 'vitest';
import { generatedWalkWorld } from '../testing/walkWorld';
import { findSpawn } from '../world/generation/spawn';
import { getTerrain } from '../world/generation/terrain';
import type { TerrainV3 } from '../world/generation/terrainV3';
import { TERRAIN_SHAPES, TREE_DENSITIES, type WorldGen } from '../world/generation/worldOptions';
import { walkEntrance, walkRavine, walkShaft, walkShaftChest } from './caveWalks';

const SEEDS = [1, 42, 1337, 2024];
const GENS: WorldGen[] = TERRAIN_SHAPES.flatMap((terrain) =>
  TREE_DENSITIES.map((trees): WorldGen => ({ version: 3, options: { terrain, trees } })),
);
const label = (seed: number, gen: WorldGen): string =>
  gen.version === 1 ? `${seed}` : `${seed} ${gen.options.terrain}/${gen.options.trees}`;

describe('caves are walked without digging', () => {
  it('Phase 8B2a AC3.1 AC3.2 AC3.3 entrances, ravines and the spawn shaft', () => {
    let entrances = 0;
    let ravines = 0;
    for (const seed of SEEDS) {
      for (const gen of GENS) {
        const terrain = getTerrain(seed, gen) as TerrainV3;
        const spawn = findSpawn(terrain);
        const { walk } = generatedWalkWorld(seed, gen);
        const near = (d: number) =>
          terrain.caves
            .shapesIn(spawn.x - d, spawn.z - d, spawn.x + d, spawn.z + d)
            .filter((s) => Math.hypot(s.startX - spawn.x, s.startZ - spawn.z) <= d);
        for (const shape of near(96).filter((s) => s.kind === 'entrance')) {
          const result = walkEntrance(walk, shape, terrain);
          const at = `${label(seed, gen)} entrance at ${shape.startX},${shape.startZ}`;
          expect(result.down, at).not.toBeNull();
          expect(result.up, at).not.toBeNull();
          entrances++;
        }
        for (const shape of near(192).filter((s) => s.kind === 'ravine')) {
          const result = walkRavine(walk, shape);
          expect(
            result.down,
            `${label(seed, gen)} ravine at ${shape.startX},${shape.startZ}`,
          ).not.toBeNull();
          ravines++;
        }
        const shaft = terrain.shafts.spawnShaft();
        expect(shaft, label(seed, gen)).not.toBeNull();
        if (!shaft) continue;
        const result = walkShaft(walk, shaft);
        expect(result.down, `${label(seed, gen)} shaft down`).not.toBeNull();
        expect(result.up, `${label(seed, gen)} shaft up`).not.toBeNull();
      }
    }
    console.log(`walked ${entrances} entrances and ${ravines} ravines`);
    expect(entrances).toBeGreaterThan(20);
    expect(ravines).toBeGreaterThan(0);
  });
});

describe('the loot chest is walked to in torch light (Phase 8B3b AC1.4)', () => {
  it('Phase 8B3b AC1.4 every spawn shaft of the 48 worlds reaches a cell next to its chest and returns', () => {
    let walked = 0;
    for (const seed of SEEDS) {
      for (const terrain of TERRAIN_SHAPES) {
        for (const trees of TREE_DENSITIES) {
          const gen: WorldGen = { version: 4, options: { terrain, trees } };
          const shaft = (getTerrain(seed, gen) as TerrainV3).shafts.spawnShaft();
          expect(shaft, label(seed, gen)).not.toBeNull();
          if (!shaft) continue;
          const { walk } = generatedWalkWorld(seed, gen);
          const result = walkShaftChest(walk, shaft);
          expect(result.down, `${label(seed, gen)} to the chest`).not.toBeNull();
          expect(result.up, `${label(seed, gen)} back up`).not.toBeNull();
          walked++;
        }
      }
    }
    expect(walked).toBe(48);
  });
});
