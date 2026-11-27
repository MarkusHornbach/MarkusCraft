// Phase 8B1 AC1.1: the radar's prediction equals the ores of the generator, cell by cell.
import { describe, expect, it } from 'vitest';
import { CHUNK_SIZE, WORLD_HEIGHT } from '../game/config';
import { generateChunk } from '../world/generation/terrain';
import { TERRAIN_SHAPES, TREE_DENSITIES, type WorldGen } from '../world/generation/worldOptions';
import { RADAR_KINDS } from './kinds';
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

function key(x: number, y: number, z: number): string {
  return `${x},${y},${z}`;
}

describe('radar agreement', () => {
  it('Phase 8B1 AC1.1 predicts exactly the coal and iron of generateChunk', () => {
    let compared = 0;
    for (const seed of [1, 42, 1337, 2024]) {
      for (const gen of GENS) {
        const index = new VeinIndex(seed, gen);
        for (const [scx, scz] of SQUARES) {
          const x0 = (scx - 1) * CHUNK_SIZE;
          const z0 = (scz - 1) * CHUNK_SIZE;
          const x1 = (scx + 2) * CHUNK_SIZE - 1;
          const z1 = (scz + 2) * CHUNK_SIZE - 1;
          for (const kind of RADAR_KINDS) {
            const actual = new Set<string>();
            for (let cz = scz - 1; cz <= scz + 1; cz++) {
              for (let cx = scx - 1; cx <= scx + 1; cx++) {
                const blocks = generateChunk(seed, cx, cz, gen);
                for (let i = 0; i < blocks.length; i++) {
                  if (blocks[i] !== kind.block) continue;
                  const lx = i % CHUNK_SIZE;
                  const lz = Math.floor(i / CHUNK_SIZE) % CHUNK_SIZE;
                  const y = Math.floor(i / (CHUNK_SIZE * CHUNK_SIZE));
                  expect(y).toBeLessThan(WORLD_HEIGHT);
                  actual.add(key(cx * CHUNK_SIZE + lx, y, cz * CHUNK_SIZE + lz));
                }
              }
            }
            const predicted = new Set<string>();
            for (let cz = VeinIndex.cellOf(z0 - 2); cz <= VeinIndex.cellOf(z1 + 2); cz++) {
              for (let cx = VeinIndex.cellOf(x0 - 2); cx <= VeinIndex.cellOf(x1 + 2); cx++) {
                const column = index.column(cx, cz);
                for (let v = 0; v < column.count; v++) {
                  if (column.blocks[v] !== kind.block) continue;
                  for (let c = column.starts[v]; c < column.starts[v + 1]; c++) {
                    const x = column.cells[c * 3];
                    const z = column.cells[c * 3 + 2];
                    if (x < x0 || x > x1 || z < z0 || z > z1) continue;
                    predicted.add(key(x, column.cells[c * 3 + 1], z));
                  }
                }
              }
            }
            const label = `seed ${seed} ${JSON.stringify(gen)} ${kind.key} at ${scx},${scz}`;
            expect(
              [...predicted].filter((k) => !actual.has(k)),
              label,
            ).toEqual([]);
            expect(
              [...actual].filter((k) => !predicted.has(k)),
              label,
            ).toEqual([]);
            compared += actual.size;
          }
        }
      }
    }
    expect(compared).toBeGreaterThan(10_000);
  });
});
