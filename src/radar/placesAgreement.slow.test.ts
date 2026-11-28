// Phase 8B2b AC5.1: the places `placesIn` lists exist in generator 3's blocks, and every shaft
// and surface opening of a tunnel in the generated chunks belongs to a listed place.
import { describe, expect, it } from 'vitest';
import { CHUNK_SIZE, WORLD_HEIGHT } from '../game/config';
import { Block } from '../world/blocks';
import type { CaveShape } from '../world/generation/caves';
import { SHAFT_HALF } from '../world/generation/shafts';
import { getTerrain, type Place } from '../world/generation/terrain';
import type { TerrainV3 } from '../world/generation/terrainV3';
import { TERRAIN_SHAPES, TREE_DENSITIES, type WorldGen } from '../world/generation/worldOptions';
import { PlaceIndex } from './places';

const LAYER = CHUNK_SIZE * CHUNK_SIZE;
const GENS: WorldGen[] = TERRAIN_SHAPES.flatMap((terrain) =>
  TREE_DENSITIES.map((trees): WorldGen => ({ version: 3, options: { terrain, trees } })),
);

/** Whether one of the shape's spans carves cell (x, y, z). */
function carves(shape: CaveShape, x: number, y: number, z: number): boolean {
  for (let s = 0; s < shape.count; s++) {
    const o = s * 4;
    if (shape.spans[o] === x && shape.spans[o + 1] === z) {
      if (y >= shape.spans[o + 2] && y <= shape.spans[o + 3]) return true;
    }
  }
  return false;
}

describe('places agreement on generator 3', () => {
  it('Phase 8B2b AC5.1 lists exactly the shafts and entrance mouths of the generated world', () => {
    let places = 0;
    let openings = 0;
    let bricks = 0;
    for (const seed of [1, 42, 1337, 2024]) {
      for (const gen of GENS) {
        const label = `seed ${seed} ${JSON.stringify(gen)}`;
        const terrain = getTerrain(seed, gen) as TerrainV3;
        const chunks = new Map<string, Uint8Array>();
        const block = (x: number, y: number, z: number): number => {
          const cx = Math.floor(x / CHUNK_SIZE);
          const cz = Math.floor(z / CHUNK_SIZE);
          const key = `${cx},${cz}`;
          let blocks = chunks.get(key);
          if (!blocks) {
            blocks = terrain.generateChunk(cx, cz);
            chunks.set(key, blocks);
          }
          return blocks[x - cx * CHUNK_SIZE + (z - cz * CHUNK_SIZE) * CHUNK_SIZE + y * LAYER];
        };
        const spawn = terrain.spawnPoint();
        const listed: Place[] = [];
        terrain.placesIn(spawn.x - 128, spawn.z - 128, spawn.x + 128, spawn.z + 128, listed);
        // The index gives the same places as the generator.
        const index = new PlaceIndex(seed, gen);
        const viaIndex: Place[] = [];
        index.near(spawn.x, spawn.z, 128, (p) => {
          if (Math.abs(p.x - spawn.x) <= 128 && Math.abs(p.z - spawn.z) <= 128) viaIndex.push(p);
        });
        const key = (p: Place) => `${p.kind} ${p.x} ${p.y} ${p.z}`;
        expect(viaIndex.map(key).sort(), label).toEqual(listed.map(key).sort());
        expect(
          listed.some((p) => p.kind === 'shaft'),
          label,
        ).toBe(true);

        // Listed → exists: a frame log at a shaft's cell; at a mouth an air cell open to the
        // sky with ground below it.
        for (const p of listed) {
          places++;
          const where = `${label} ${key(p)}`;
          if (p.kind === 'shaft') {
            expect(block(p.x, p.y, p.z), where).toBe(Block.LOG);
            continue;
          }
          expect(block(p.x, p.y - 1, p.z), where).not.toBe(Block.AIR);
          for (let y = p.y; y < WORLD_HEIGHT; y++)
            expect(block(p.x, y, p.z), where).toBe(Block.AIR);
        }

        // Generated → listed, in 9 × 9 chunks around the spawn and around the spawn shaft.
        const shapes = terrain.caves.shapesIn(
          spawn.x - 256,
          spawn.z - 256,
          spawn.x + 256,
          spawn.z + 256,
        );
        const mouths = new Set(listed.filter((p) => p.kind === 'cave').map((p) => `${p.x},${p.z}`));
        const shafts = listed.filter((p) => p.kind === 'shaft');
        const own = terrain.shafts.spawnShaft();
        const centres: [number, number][] = [[spawn.x, spawn.z]];
        if (own) centres.push([own.x, own.z]);
        const seen = new Set<string>();
        for (const [px, pz] of centres) {
          const cx0 = Math.floor(px / CHUNK_SIZE);
          const cz0 = Math.floor(pz / CHUNK_SIZE);
          for (let cz = cz0 - 4; cz <= cz0 + 4; cz++) {
            for (let cx = cx0 - 4; cx <= cx0 + 4; cx++) {
              if (seen.has(`${cx},${cz}`)) continue;
              seen.add(`${cx},${cz}`);
              for (let lz = 0; lz < CHUNK_SIZE; lz++) {
                for (let lx = 0; lx < CHUNK_SIZE; lx++) {
                  const x = cx * CHUNK_SIZE + lx;
                  const z = cz * CHUNK_SIZE + lz;
                  // Stone bricks are made only by shafts (their chamber).
                  for (let y = 1; y < 20; y++) {
                    if (block(x, y, z) !== Block.STONE_BRICKS) continue;
                    bricks++;
                    const near = shafts.some(
                      (s) => Math.abs(s.x - x) <= SHAFT_HALF && Math.abs(s.z - z) <= SHAFT_HALF,
                    );
                    expect(near, `${label} brick at ${x},${y},${z}`).toBe(true);
                  }
                  // An opening: the noise ground carved. It is a ravine or an entrance with a
                  // listed mouth, never a deep tunnel.
                  if (terrain.inShaftFootprint(x, z)) continue;
                  const h = terrain.heightAt(x, z);
                  if (!terrain.carved(x, h, z)) continue;
                  const owners = shapes.filter((s) => carves(s, x, h, z));
                  if (owners.some((s) => s.kind === 'ravine')) continue;
                  openings++;
                  const listedOwner = owners.some(
                    (s) => s.kind === 'entrance' && mouths.has(`${s.startX},${s.startZ}`),
                  );
                  expect(listedOwner, `${label} opening at ${x},${h},${z}`).toBe(true);
                }
              }
            }
          }
        }
      }
    }
    expect(places).toBeGreaterThan(200);
    expect(openings).toBeGreaterThan(1000);
    expect(bricks).toBeGreaterThan(1000);
  });
});

describe('places agreement on generator 4 (Phase 8B3b AC5.3)', () => {
  it('Phase 8B3b AC5.3 every listed chest is a chest block; every chest block near the spawn and the spawn shaft is listed', () => {
    let listedChests = 0;
    let found = 0;
    for (const seed of [1, 42, 1337, 2024]) {
      for (const terrain4 of TERRAIN_SHAPES) {
        for (const trees of TREE_DENSITIES) {
          const gen: WorldGen = { version: 4, options: { terrain: terrain4, trees } };
          const label = `seed ${seed} ${terrain4}/${trees}`;
          const terrain = getTerrain(seed, gen) as TerrainV3;
          const chunks = new Map<string, Uint8Array>();
          const chunkOf = (cx: number, cz: number): Uint8Array => {
            const key = `${cx},${cz}`;
            let blocks = chunks.get(key);
            if (!blocks) {
              blocks = terrain.generateChunk(cx, cz);
              chunks.set(key, blocks);
            }
            return blocks;
          };
          const spawn = terrain.spawnPoint();
          const listed: Place[] = [];
          terrain.placesIn(spawn.x - 128, spawn.z - 128, spawn.x + 128, spawn.z + 128, listed);
          const chests = new Set(
            listed.filter((p) => p.kind === 'chest').map((p) => `${p.x},${p.y},${p.z}`),
          );
          expect(chests.size, label).toBeGreaterThan(0);
          for (const p of listed) {
            if (p.kind !== 'chest') continue;
            listedChests++;
            const cx = Math.floor(p.x / CHUNK_SIZE);
            const cz = Math.floor(p.z / CHUNK_SIZE);
            const b = chunkOf(cx, cz)[
              p.x - cx * CHUNK_SIZE + (p.z - cz * CHUNK_SIZE) * CHUNK_SIZE + p.y * LAYER
            ];
            expect(b, `${label} ${p.x},${p.y},${p.z}`).toBe(Block.CHEST);
          }
          const own = terrain.shafts.spawnShaft();
          const centres: [number, number][] = [[spawn.x, spawn.z]];
          if (own) centres.push([own.x, own.z]);
          const seen = new Set<string>();
          for (const [px, pz] of centres) {
            const cx0 = Math.floor(px / CHUNK_SIZE);
            const cz0 = Math.floor(pz / CHUNK_SIZE);
            for (let cz = cz0 - 3; cz <= cz0 + 3; cz++) {
              for (let cx = cx0 - 3; cx <= cx0 + 3; cx++) {
                if (seen.has(`${cx},${cz}`)) continue;
                seen.add(`${cx},${cz}`);
                const blocks = chunkOf(cx, cz);
                for (let i = 0; i < blocks.length; i++) {
                  if (blocks[i] !== Block.CHEST) continue;
                  found++;
                  const x = cx * CHUNK_SIZE + (i % CHUNK_SIZE);
                  const z = cz * CHUNK_SIZE + (Math.floor(i / CHUNK_SIZE) % CHUNK_SIZE);
                  const y = Math.floor(i / LAYER);
                  expect(chests.has(`${x},${y},${z}`), `${label} chest at ${x},${y},${z}`).toBe(
                    true,
                  );
                }
              }
            }
          }
        }
      }
    }
    expect(listedChests).toBeGreaterThan(48);
    expect(found).toBeGreaterThanOrEqual(48);
  });
});
