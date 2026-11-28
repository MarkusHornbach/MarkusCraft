// Generator 4 equals generator 3 except the chest cells (Phase 8 part B3b, AC1.2).
import { describe, expect, it } from 'vitest';
import { CHUNK_SIZE } from '../../game/config';
import { Block } from '../blocks';
import { type Shaft, shaftChestCell } from './shafts';
import { generateChunk, getTerrain } from './terrain';
import { TerrainV4 } from './terrainV4';
import { TERRAIN_SHAPES, TREE_DENSITIES, type WorldOptions } from './worldOptions';

const PRESETS: WorldOptions[] = TERRAIN_SHAPES.flatMap((terrain) =>
  TREE_DENSITIES.map((trees) => ({ terrain, trees })),
);
const LAYER = CHUNK_SIZE * CHUNK_SIZE;
const R = 3;

describe('generator 4 identity', () => {
  it('Phase 8B3b AC1.2 chunks equal generator 3 except exactly the chest cells (twelve presets)', () => {
    for (const options of PRESETS) {
      const key = `${options.terrain}/${options.trees}`;
      const terrain = getTerrain(1337, { version: 4, options }) as TerrainV4;
      const spawn = terrain.shafts.spawnShaft();
      expect(spawn, key).not.toBeNull();
      // Two grid shafts: the nearest ones to the origin.
      const grid = terrain.shafts
        .shaftsIn(-800, -800, 800, 800)
        .filter((s) => !s.spawn)
        .sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z))
        .slice(0, 2);
      expect(grid.length, key).toBe(2);
      const centres = [spawn, ...grid].filter((s): s is Shaft => s !== null);
      const seen = new Set<string>();
      for (const s of centres) {
        const c = shaftChestCell(s);
        const ccx = Math.floor(c.x / CHUNK_SIZE);
        const ccz = Math.floor(c.z / CHUNK_SIZE);
        for (let cz = ccz - R; cz <= ccz + R; cz++) {
          for (let cx = ccx - R; cx <= ccx + R; cx++) {
            if (seen.has(`${cx},${cz}`)) continue;
            seen.add(`${cx},${cz}`);
            const three = generateChunk(1337, cx, cz, { version: 3, options });
            const four = generateChunk(1337, cx, cz, { version: 4, options });
            const x0 = cx * CHUNK_SIZE;
            const z0 = cz * CHUNK_SIZE;
            const expected = new Set<number>();
            for (const t of terrain.shafts.shaftsIn(x0, z0, x0 + 15, z0 + 15)) {
              const cell = shaftChestCell(t);
              if (cell.x < x0 || cell.x > x0 + 15 || cell.z < z0 || cell.z > z0 + 15) continue;
              expected.add(cell.x - x0 + (cell.z - z0) * CHUNK_SIZE + cell.y * LAYER);
            }
            const differing: number[] = [];
            for (let i = 0; i < four.length; i++) if (four[i] !== three[i]) differing.push(i);
            expect(differing, `${key} ${cx},${cz}`).toEqual([...expected].sort((a, b) => a - b));
            for (const i of expected) {
              expect(three[i], key).toBe(Block.AIR);
              expect(four[i], key).toBe(Block.CHEST);
            }
          }
        }
      }
    }
  });
});
