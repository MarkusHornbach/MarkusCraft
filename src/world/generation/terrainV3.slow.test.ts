// Generator 3's rules over the plan's seeds and presets (Phase 8 part B2a, AC1.2–AC1.5).
import { describe, expect, it } from 'vitest';
import { CHUNK_SIZE, SEA_LEVEL, WORLD_HEIGHT } from '../../game/config';
import { Block, isSupport } from '../blocks';
import { SHAFT_HALF, shaftBlock } from './shafts';
import { findSpawn } from './spawn';
import { generateChunk, getTerrain } from './terrain';
import { TerrainV3 } from './terrainV3';
import { World } from '../World';
import { TERRAIN_SHAPES, TREE_DENSITIES, type WorldGen, type WorldOptions } from './worldOptions';

const SEEDS = [1, 42, 1337, 2024];
const PRESETS: WorldOptions[] = TERRAIN_SHAPES.flatMap((terrain) =>
  TREE_DENSITIES.map((trees) => ({ terrain, trees })),
);
const LAYER = CHUNK_SIZE * CHUNK_SIZE;
const ORES = new Set<number>([Block.COAL_ORE, Block.IRON_ORE]);

const v3 = (options: WorldOptions): WorldGen => ({ version: 3, options });
const v2 = (options: WorldOptions): WorldGen => ({ version: 2, options });
const name = (seed: number, o: WorldOptions): string => `${seed} ${o.terrain}/${o.trees}`;

/** Blocks of an area of chunks, read by world coordinates (air outside). */
class Area {
  private readonly chunks = new Map<string, Uint8Array>();
  constructor(
    readonly seed: number,
    readonly gen: WorldGen,
    readonly cx0: number,
    readonly cz0: number,
    readonly cx1: number,
    readonly cz1: number,
  ) {
    for (let cz = cz0; cz <= cz1; cz++) {
      for (let cx = cx0; cx <= cx1; cx++)
        this.chunks.set(`${cx},${cz}`, generateChunk(seed, cx, cz, gen));
    }
  }
  block(x: number, y: number, z: number): number {
    if (y < 0 || y >= WORLD_HEIGHT) return Block.AIR;
    const cx = Math.floor(x / CHUNK_SIZE);
    const cz = Math.floor(z / CHUNK_SIZE);
    const chunk = this.chunks.get(`${cx},${cz}`);
    if (!chunk) return -1;
    return chunk[x - cx * CHUNK_SIZE + (z - cz * CHUNK_SIZE) * CHUNK_SIZE + y * LAYER];
  }
  /** Calls `visit` for every cell whose block differs from `other`'s (same area). */
  differences(other: Area, visit: (x: number, y: number, z: number) => void): void {
    for (const [key, mine] of this.chunks) {
      const theirs = other.chunks.get(key);
      if (!theirs) continue;
      const [cx, cz] = key.split(',').map(Number);
      for (let i = 0; i < mine.length; i++) {
        if (mine[i] === theirs[i]) continue;
        visit(
          cx * CHUNK_SIZE + (i % CHUNK_SIZE),
          Math.floor(i / LAYER),
          cz * CHUNK_SIZE + (Math.floor(i / CHUNK_SIZE) % CHUNK_SIZE),
        );
      }
    }
  }

  /** Calls `visit` for every torch. */
  torches(visit: (x: number, y: number, z: number) => void): void {
    for (const [key, mine] of this.chunks) {
      const [cx, cz] = key.split(',').map(Number);
      for (let i = 0; i < mine.length; i++) {
        if (mine[i] !== Block.TORCH) continue;
        visit(
          cx * CHUNK_SIZE + (i % CHUNK_SIZE),
          Math.floor(i / LAYER),
          cz * CHUNK_SIZE + (Math.floor(i / CHUNK_SIZE) % CHUNK_SIZE),
        );
      }
    }
  }
}

/** The areas a preset is checked in: 9 × 9 chunks at the origin and around the spawn shaft. */
function areasOf(seed: number, options: WorldOptions): [number, number, number, number][] {
  const t = getTerrain(seed, v3(options)) as TerrainV3;
  const s = t.shafts.spawnShaft();
  const areas: [number, number, number, number][] = [[-4, -4, 4, 4]];
  if (s) {
    const cx = Math.floor(s.x / CHUNK_SIZE);
    const cz = Math.floor(s.z / CHUNK_SIZE);
    areas.push([cx - 1, cz - 1, cx + 1, cz + 1]);
  }
  return areas;
}

const NEIGHBOURS = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
] as const;

describe('generator 3 rules', () => {
  it('Phase 8B2a AC1.3 AC1.4 bedrock, water, trees, shafts, torches and ores', () => {
    let totalCarved = 0;
    for (const seed of SEEDS) {
      for (const options of PRESETS) {
        const label = name(seed, options);
        const t = getTerrain(seed, v3(options)) as TerrainV3;
        for (const [cx0, cz0, cx1, cz1] of areasOf(seed, options)) {
          const three = new Area(seed, v3(options), cx0, cz0, cx1, cz1);
          const two = new Area(seed, v2(options), cx0, cz0, cx1, cz1);
          let carvedCells = 0;
          three.differences(two, (x, y, z) => {
            const a = three.block(x, y, z);
            const b = two.block(x, y, z);
            const shaft = t.shafts.shaftAt(x, z);
            const inShaft = shaft !== null && shaftBlock(shaft, x, y, z) >= 0;
            if (ORES.has(a)) {
              // AC1.4: every ore lies where generator 2 has the same ore.
              expect(b, `${label} ore at ${x},${y},${z}`).toBe(a);
            }
            if (ORES.has(b)) {
              expect(t.carved(x, y, z) || inShaft, `${label} lost ore ${x},${y},${z}`).toBe(true);
            }
            if (a === Block.AIR && !inShaft && b !== Block.LOG && b !== Block.LEAVES) {
              // A carved cell: never at y <= 2, never next to water.
              carvedCells++;
              expect(t.carved(x, y, z), `${label} air ${x},${y},${z}`).toBe(true);
              expect(y, `${label} bedrock ${x},${y},${z}`).toBeGreaterThan(2);
              for (const [dx, dy, dz] of NEIGHBOURS) {
                expect(
                  three.block(x + dx, y + dy, z + dz),
                  `${label} water by ${x},${y},${z}`,
                ).not.toBe(Block.WATER);
              }
            }
          });
          three.torches((x, y, z) => {
            expect(isSupport(three.block(x, y - 1, z)), `${label} torch ${x},${y},${z}`).toBe(true);
          });
          // No trunk or leaf over a carved column or in a shaft footprint; no carved cell in it.
          for (let x = cx0 * CHUNK_SIZE; x < (cx1 + 1) * CHUNK_SIZE; x++) {
            for (let z = cz0 * CHUNK_SIZE; z < (cz1 + 1) * CHUNK_SIZE; z++) {
              const footprint = t.inShaftFootprint(x, z);
              if (footprint) {
                expect(
                  t.caves.carvedBetween(x, z, 0, WORLD_HEIGHT - 1),
                  `${label} shaft carved`,
                ).toBe(false);
              }
              if (!footprint && !t.carvedColumn(x, z)) continue;
              for (let y = SEA_LEVEL; y < WORLD_HEIGHT; y++) {
                const id = three.block(x, y, z);
                const shaft = footprint ? t.shafts.shaftAt(x, z) : null;
                if (id === Block.LOG && shaft && shaftBlock(shaft, x, y, z) === Block.LOG) continue;
                expect(
                  id === Block.LOG || id === Block.LEAVES,
                  `${label} tree at ${x},${y},${z}`,
                ).toBe(false);
              }
            }
          }
          totalCarved += carvedCells;
        }
      }
    }
    expect(totalCarved).toBeGreaterThan(0);
  });

  it('Phase 8B2a AC1.5 the spawn is grass with no cave below; the spawn shaft lies near it', () => {
    let near = 0;
    let all = 0;
    const distances: number[] = [];
    for (const seed of SEEDS) {
      for (const options of PRESETS) {
        const label = name(seed, options);
        const t = getTerrain(seed, v3(options)) as TerrainV3;
        const spawn = findSpawn(t);
        expect(t.isGrass(spawn.x, spawn.z), label).toBe(true);
        const h = spawn.y - 1;
        for (let dz = -2; dz <= 2; dz++) {
          for (let dx = -2; dx <= 2; dx++) {
            expect(t.caves.carvedBetween(spawn.x + dx, spawn.z + dz, h - 8, h), label).toBe(false);
          }
        }
        const s = t.shafts.spawnShaft();
        expect(s, label).not.toBeNull();
        if (!s) continue;
        const d = Math.hypot(s.x - spawn.x, s.z - spawn.z);
        distances.push(Math.round(d));
        all++;
        if (d >= 24 && d <= 64) near++;
        expect(d, label).toBeLessThanOrEqual(128 + SHAFT_HALF);
      }
    }
    console.log(`spawn shaft distances: ${distances.join(', ')}`);
    expect(all).toBe(48);
    expect(near).toBeGreaterThanOrEqual(44);
  });

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

  it('Phase 8B2a AC2.3 the light invariant holds after breaking into a tunnel from the surface', () => {
    const gen: WorldGen = { version: 3, options: { terrain: 'balanced', trees: 'few' } };
    const terrain = getTerrain(1337, gen) as TerrainV3;
    // A deep tunnel cell with solid ground above it.
    const tunnel = terrain.caves.shapesIn(-300, -300, 300, 300).find((s) => s.kind === 'deep');
    expect(tunnel).toBeDefined();
    if (!tunnel) return;
    const x = tunnel.endX;
    const z = tunnel.endZ;
    const world = new World(1337, gen);
    const cx = Math.floor(x / CHUNK_SIZE);
    const cz = Math.floor(z / CHUNK_SIZE);
    for (let dz = -2; dz <= 2; dz++)
      for (let dx = -2; dx <= 2; dx++) world.generate(cx + dx, cz + dz);
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) world.light(cx + dx, cz + dz);
    expect(world.verifyLight()).toBe(0);
    let y = world.surfaceY(x, z);
    let broken = 0;
    while (y > 0 && !terrain.carved(x, y, z)) {
      world.setBlock(x, y, z, Block.AIR);
      broken++;
      y--;
    }
    expect(broken).toBeGreaterThan(3);
    expect(terrain.carved(x, y, z)).toBe(true);
    expect(world.verifyLight()).toBe(0);
  });
});
