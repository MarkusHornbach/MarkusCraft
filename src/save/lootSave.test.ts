// Generator 4 worlds through the store (Phase 8 part B3b, AC4.1): a touched loot chest is an
// ordinary state, an untouched one writes nothing; a later generator is "newer".
import { describe, expect, it } from 'vitest';
import { CHUNK_SIZE } from '../game/config';
import { sampleMeta } from '../testing/sampleWorld';
import { Block } from '../world/blocks';
import { emptyChest } from '../world/blockState';
import { chunkKey } from '../world/chunk';
import { type Shaft, shaftChestCell } from '../world/generation/shafts';
import { getTerrain } from '../world/generation/terrain';
import type { TerrainV4 } from '../world/generation/terrainV4';
import { World } from '../world/World';
import { decodeMeta, encodeMeta } from './saveFormat';
import { MemoryStore } from './WorldStore';

const OPTIONS = { terrain: 'balanced', trees: 'few' } as const;
const GEN4 = { version: 4, options: OPTIONS } as const;

describe('generator 4 worlds in the store (Phase 8B3b AC4.1)', () => {
  it('a touched and an untouched loot chest save and reload; the untouched one writes no state', async () => {
    const terrain = getTerrain(1337, GEN4) as TerrainV4;
    const shafts = terrain.shafts.shaftsIn(-400, -400, 400, 400);
    const own = shafts.find((s) => s.spawn);
    const grid = shafts.find((s) => !s.spawn);
    if (!own || !grid) throw new Error('no shafts');
    const [touched, untouched] = [own, grid].map((s: Shaft) => shaftChestCell(s));
    const store = new MemoryStore();
    const meta = sampleMeta({ mode: 'gathering', generatorVersion: 4, options: OPTIONS });
    await store.create(meta);
    const world = new World(meta.seed, GEN4);
    const keyOf = (c: { x: number; z: number }): string =>
      chunkKey(Math.floor(c.x / CHUNK_SIZE), Math.floor(c.z / CHUNK_SIZE));
    for (const c of [touched, untouched]) {
      world.generate(Math.floor(c.x / CHUNK_SIZE), Math.floor(c.z / CHUNK_SIZE));
    }
    // What a take-one move stores: the loot minus its first stack.
    const loot = world.getState(touched.x, touched.y, touched.z);
    if (!loot) throw new Error('no loot');
    const first = loot.slots.findIndex((s) => s !== null);
    const left = {
      kind: 'chest' as const,
      slots: loot.slots.map((s, i) => (i === first ? null : s)),
    };
    world.setState(touched.x, touched.y, touched.z, left);
    await store.saveChunks(meta.id, world.edits, [keyOf(touched), keyOf(untouched)], world.states);
    const untouchedRecord = store.chunks.get(`w1|${keyOf(untouched)}`) as { states?: unknown };
    expect(untouchedRecord.states).toBeUndefined();

    const loaded = await store.load(meta.id);
    if (!loaded?.ok) throw new Error('not loaded');
    expect(loaded.value.meta.generatorVersion).toBe(4);
    const again = new World(meta.seed, GEN4, loaded.value.edits, loaded.value.states);
    for (const c of [touched, untouched]) {
      again.generate(Math.floor(c.x / CHUNK_SIZE), Math.floor(c.z / CHUNK_SIZE));
    }
    expect(again.getState(touched.x, touched.y, touched.z)).toEqual(left);
    expect(again.storedState(untouched.x, untouched.y, untouched.z)).toBeNull();
    expect(again.getState(untouched.x, untouched.y, untouched.z)).toEqual(
      terrain.lootAt(untouched.x, untouched.y, untouched.z),
    );
    expect(again.getBlock(untouched.x, untouched.y, untouched.z)).toBe(Block.CHEST);
    // An emptied chest is stored explicitly.
    again.setState(touched.x, touched.y, touched.z, emptyChest());
    await store.saveChunks(meta.id, again.edits, [keyOf(touched)], again.states);
    const back = await store.load(meta.id);
    if (!back?.ok) throw new Error('not loaded');
    const third = new World(meta.seed, GEN4, back.value.edits, back.value.states);
    third.generate(Math.floor(touched.x / CHUNK_SIZE), Math.floor(touched.z / CHUNK_SIZE));
    expect(third.getState(touched.x, touched.y, touched.z)).toEqual(emptyChest());
    expect(third.droppedStates).toBe(0);
  });

  it('a meta with generator 5 is newer; generator 4 round-trips', () => {
    const record = encodeMeta(sampleMeta({ generatorVersion: 4, options: OPTIONS }));
    const decoded = decodeMeta(record);
    expect(decoded.ok && decoded.value.generatorVersion).toBe(4);
    expect(decodeMeta({ ...record, generatorVersion: 5 })).toEqual({ ok: false, error: 'newer' });
  });
});
