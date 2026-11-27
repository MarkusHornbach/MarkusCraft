// Phase 8B2a AC3.4: the radar's prediction equals generator 3's ores (after carving and
// the shafts), cell by cell; a file of its own so each agreement file stays short.
import { describe, expect, it } from 'vitest';
import { CHUNK_SIZE } from '../game/config';
import { radarAgreement } from '../testing/radarAgreement';
import { getTerrain } from '../world/generation/terrain';
import type { TerrainV3 } from '../world/generation/terrainV3';
import { TERRAIN_SHAPES, TREE_DENSITIES, type WorldGen } from '../world/generation/worldOptions';
import { VeinIndex } from './veins';

const GENS: WorldGen[] = TERRAIN_SHAPES.flatMap((terrain) =>
  TREE_DENSITIES.map((trees): WorldGen => ({ version: 3, options: { terrain, trees } })),
);

describe('radar agreement on generator 3', () => {
  it('Phase 8B2a AC3.4 predicts exactly the coal and iron of generator 3', () => {
    let compared = 0;
    let carvedSquares = 0;
    for (const seed of [1, 42, 1337, 2024]) {
      for (const gen of GENS) {
        const terrain = getTerrain(seed, gen) as TerrainV3;
        const squares: [number, number][] = [
          [0, 0],
          [-20, 13],
        ];
        const shaft = terrain.shafts.spawnShaft();
        if (shaft)
          squares.push([Math.floor(shaft.x / CHUNK_SIZE), Math.floor(shaft.z / CHUNK_SIZE)]);
        const ravine = terrain.caves
          .shapesIn(-512, -512, 512, 512)
          .find((s) => s.kind === 'ravine');
        if (ravine) {
          squares.push([
            Math.floor(ravine.endX / CHUNK_SIZE),
            Math.floor(ravine.endZ / CHUNK_SIZE),
          ]);
          carvedSquares++;
        }
        const index = new VeinIndex(seed, gen);
        for (const [scx, scz] of squares) {
          for (const result of radarAgreement(seed, gen, index, scx, scz)) {
            const label = `seed ${seed} ${JSON.stringify(gen)} ${result.kind} at ${scx},${scz}`;
            expect(result.extra, label).toEqual([]);
            expect(result.missing, label).toEqual([]);
            compared += result.compared;
          }
        }
      }
    }
    expect(carvedSquares).toBeGreaterThan(0);
    expect(compared).toBeGreaterThan(10_000);
  });
});
