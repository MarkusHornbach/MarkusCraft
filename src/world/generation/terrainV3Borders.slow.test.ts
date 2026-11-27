// Generator 3 at chunk borders (Phase 8 part B2a AC1.2): a chunk is the same alone and after
// its neighbours; a file of its own, so it runs beside the rules check.
import { describe, expect, it } from 'vitest';
import { CHUNK_SIZE } from '../../game/config';
import { TerrainV3 } from './terrainV3';
import { TERRAIN_SHAPES, TREE_DENSITIES, type WorldOptions } from './worldOptions';

const SEEDS = [1, 42, 1337, 2024];
const PRESETS: WorldOptions[] = TERRAIN_SHAPES.flatMap((terrain) =>
  TREE_DENSITIES.map((trees) => ({ terrain, trees })),
);
const name = (seed: number, o: WorldOptions): string => `${seed} ${o.terrain}/${o.trees}`;

describe('generator 3 borders', () => {
  it('Phase 8B2a AC1.2 a chunk alone equals the chunk generated after its neighbours', () => {
    for (const seed of SEEDS) {
      for (const options of PRESETS) {
        const label = name(seed, options);
        const probe = new TerrainV3(seed, options);
        // A chunk with an entrance mouth (a tunnel crossing borders) and one in a ravine.
        const shapes = probe.caves.shapesIn(-400, -400, 400, 400);
        const picks = [
          shapes.find((s) => s.kind === 'entrance'),
          shapes.find((s) => s.kind === 'ravine'),
          shapes.find((s) => s.kind === 'deep'),
        ];
        for (const shape of picks) {
          if (!shape) continue;
          const cx = Math.floor(shape.endX / CHUNK_SIZE);
          const cz = Math.floor(shape.endZ / CHUNK_SIZE);
          const alone = new TerrainV3(seed, options).generateChunk(cx, cz);
          const after = new TerrainV3(seed, options);
          for (const [dx, dz] of [
            [1, 1],
            [-1, 0],
            [0, -1],
            [1, -1],
            [-1, 1],
            [0, 1],
            [1, 0],
            [-1, -1],
          ]) {
            after.generateChunk(cx + dx, cz + dz);
          }
          expect(after.generateChunk(cx, cz), `${label} ${shape.kind}`).toEqual(alone);
          // Both sides of the borders: the shape's spans land in the neighbours' masks too.
          for (let s = 0; s < shape.count; s++) {
            const x = shape.spans[s * 4];
            const z = shape.spans[s * 4 + 1];
            const y = shape.spans[s * 4 + 3];
            if (y < 3) continue;
            expect(after.carved(x, y, z), `${label} span ${x},${y},${z}`).toBe(true);
          }
        }
      }
    }
  });
});
