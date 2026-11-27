// Phase 8B1 AC1.1: the radar's prediction equals the ores of the generator, cell by cell.
import { describe, expect, it } from 'vitest';
import { radarAgreement } from '../testing/radarAgreement';
import { TERRAIN_SHAPES, TREE_DENSITIES, type WorldGen } from '../world/generation/worldOptions';
import { VeinIndex } from './veins';

const GENS: WorldGen[] = [
  { version: 1 },
  ...TERRAIN_SHAPES.flatMap((terrain) =>
    TREE_DENSITIES.map((trees): WorldGen => ({ version: 2, options: { terrain, trees } })),
  ),
];
const SQUARES: readonly [number, number][] = [
  [0, 0],
  [-20, 13],
];

describe('radar agreement', () => {
  it('Phase 8B1 AC1.1 predicts exactly the coal and iron of generateChunk', () => {
    let compared = 0;
    for (const seed of [1, 42, 1337, 2024]) {
      for (const gen of GENS) {
        const index = new VeinIndex(seed, gen);
        for (const [scx, scz] of SQUARES) {
          for (const result of radarAgreement(seed, gen, index, scx, scz)) {
            const label = `seed ${seed} ${JSON.stringify(gen)} ${result.kind} at ${scx},${scz}`;
            expect(result.extra, label).toEqual([]);
            expect(result.missing, label).toEqual([]);
            compared += result.compared;
          }
        }
      }
    }
    expect(compared).toBeGreaterThan(10_000);
  });
});
