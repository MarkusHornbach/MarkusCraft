// The chunk manager with light: slow, because the light is compared with the reference.
import { describe, expect, it } from 'vitest';
import { TIMING_ENFORCED } from '../testing/timing';
import { mulberry32, randInt } from '../util/rng';
import { Block } from './blocks';
import { ChunkManager } from './ChunkManager';
import { type ChunkMeshData, meshChunk } from './meshing/mesher';
import { World } from './World';

interface Recorder {
  meshed: string[];
  unloaded: string[];
  onMesh(cx: number, cz: number): void;
  onUnload(cx: number, cz: number): void;
}

function setup(radius: number, check?: (world: World, cx: number, cz: number) => void) {
  const world = new World(1337);
  const recorder: Recorder = {
    meshed: [],
    unloaded: [],
    onMesh(cx, cz) {
      check?.(world, cx, cz);
      this.meshed.push(`${cx},${cz}`);
    },
    onUnload(cx, cz) {
      this.unloaded.push(`${cx},${cz}`);
    },
  };
  const manager = new ChunkManager(world, recorder, radius);
  return { world, recorder, manager };
}

/** A clock that advances by `tick` every time it is read. */
function fakeClock(tick: number): () => number {
  let t = 0;
  return () => {
    const value = t;
    t += tick;
    return value;
  };
}

function runToIdle(manager: ChunkManager): number {
  let frames = 0;
  while (manager.pending > 0) {
    manager.update(fakeClock(1), 6);
    if (++frames > 100_000) throw new Error('chunk manager does not converge');
  }
  return frames;
}

/** Light of every lit chunk of a world, by chunk key. */
function lightMap(world: World): Map<string, Uint8Array> {
  const map = new Map<string, Uint8Array>();
  for (const chunk of world.allChunks()) {
    if (chunk.light) map.set(`${chunk.cx},${chunk.cz}`, chunk.light.slice());
  }
  return map;
}

describe('ChunkManager with light (Phase 4)', () => {
  it('AC2.1: lights a chunk only with its 3 × 3 generated, meshes only with its 3 × 3 lit', () => {
    for (const radius of [1, 3]) {
      const { manager, world } = setup(radius, (w, cx, cz) => {
        for (let dz = -1; dz <= 1; dz++) {
          for (let dx = -1; dx <= 1; dx++) {
            expect(w.getChunk(cx + dx, cz + dz)?.light).toBeTruthy();
          }
        }
      });
      // `World.light` throws if a chunk it needs is missing, so every lighting job is checked.
      manager.setCenter(2, -3);
      runToIdle(manager);
      expect(manager.meshed).toBe((2 * radius + 1) ** 2);
      expect(world.litCount).toBeGreaterThanOrEqual((2 * radius + 3) ** 2);
      expect(world.chunkCount).toBeGreaterThanOrEqual((2 * radius + 5) ** 2);
      expect(manager.jobs).toEqual({
        generate: (2 * radius + 5) ** 2,
        light: (2 * radius + 3) ** 2,
        mesh: (2 * radius + 1) ** 2,
      });
      if (radius === 1) expect(world.verifyLight()).toBe(0);
    }
  });

  it('AC2.1: one job generates, lights or meshes exactly one chunk', () => {
    const { manager, world } = setup(1);
    manager.setCenter(0, 0);
    let last = 0;
    for (let i = 0; i < 500 && manager.pending > 0; i++) {
      expect(manager.update(fakeClock(10), 6)).toBe(1);
      const total = world.chunkCount + world.litCount + manager.meshed;
      expect(total).toBe(last + 1);
      last = total;
    }
    expect(manager.pending).toBe(0);
  });

  it('AC2.2: the light is the same whatever way the chunks were loaded', () => {
    const edits: [number, number, number, number][] = [
      [3, 70, 3, Block.BRICKS],
      [16, 64, 0, Block.GLASS],
      [-1, 66, -1, Block.LEAVES],
    ];
    const build = (path: [number, number][]) => {
      const { manager, world } = setup(1);
      for (const [x, y, z, id] of edits) world.setBlock(x, y, z, id);
      for (const [cx, cz] of path) {
        manager.setCenter(cx, cz);
        // A few frames only: the walk goes on while chunks are still missing.
        for (let i = 0; i < 7; i++) manager.update(fakeClock(1), 6);
      }
      manager.setCenter(0, 0);
      runToIdle(manager);
      return world;
    };
    const reference = build([]);
    const expected = lightMap(reference);
    expect(reference.verifyLight()).toBe(0);
    const rng = mulberry32(42);
    // Coverage slows lighting and meshing several times over: a quarter of the orders then.
    const orders = TIMING_ENFORCED ? 20 : 5;
    for (let order = 0; order < orders; order++) {
      const path: [number, number][] = [];
      for (let i = 0; i < 6; i++) path.push([randInt(rng, 7) - 3, randInt(rng, 7) - 3]);
      const world = build(path);
      for (let cz = -2; cz <= 2; cz++) {
        for (let cx = -2; cx <= 2; cx++) {
          // Compared as bytes: a deep comparison of 25 arrays of 32 768 cells is slow.
          const light = world.getChunk(cx, cz)?.light;
          const want = expected.get(`${cx},${cz}`);
          if (!light || !want) throw new Error(`chunk ${cx},${cz} is not lit`);
          expect(Buffer.compare(light, want), `${cx},${cz}`).toBe(0);
        }
      }
    }
  }, 180_000);

  it('AC2.2: unloading and reloading a chunk gives the same light, also with edits in it', () => {
    const { manager, world } = setup(2);
    manager.setCenter(0, 0);
    runToIdle(manager);
    world.setBlock(5, world.surfaceY(5, 5) + 4, 5, Block.PLANKS);
    world.setBlock(0, world.surfaceY(0, 9) + 2, 9, Block.LEAVES);
    expect(world.verifyLight()).toBe(0);
    const before = lightMap(world);
    manager.setCenter(40, 40);
    expect(world.chunkCount).toBe(0);
    manager.setCenter(0, 0);
    runToIdle(manager);
    expect(lightMap(world)).toEqual(before);
    expect(world.verifyLight()).toBe(0);
  });

  it('remeshes chunks whose light an edit changed before it loads more, nearest first', () => {
    const { manager, world, recorder } = setup(2);
    manager.setCenter(0, 0);
    runToIdle(manager);
    // A roof over the corner of four chunks, high above the ground: the shade falls into all.
    const y = world.surfaceY(0, 0) + 30;
    recorder.meshed.length = 0;
    for (let z = -3; z <= 2; z++)
      for (let x = -3; x <= 2; x++) world.setBlock(x, y, z, Block.PLANKS);
    expect(manager.relight).toBe(4);
    expect(recorder.meshed).toEqual([]);
    // The edited chunk is remeshed at once and leaves the queue.
    manager.remesh(0, 0);
    expect(recorder.meshed).toEqual(['0,0']);
    expect(manager.relight).toBe(3);
    // New chunks to load do not come before the waiting ones.
    manager.setCenter(1, 0);
    expect(manager.update(fakeClock(10), 6)).toBe(1);
    expect(manager.relight).toBe(2);
    expect(recorder.meshed).toEqual(['0,0', '0,-1']);
    manager.update(fakeClock(1), 6);
    expect(manager.relight).toBe(0);
    expect(recorder.meshed.slice(0, 4).sort()).toEqual(['-1,-1', '-1,0', '0,-1', '0,0']);
    runToIdle(manager);
    expect(world.verifyLight()).toBe(0);
  });

  it('Phase 4E AC1.1: after the edits of a chunk corner every mesh equals a fresh one', () => {
    const world = new World(1337);
    const meshes = new Map<string, ChunkMeshData>();
    const manager = new ChunkManager(
      world,
      {
        onMesh: (cx, cz, data) => meshes.set(`${cx},${cz}`, data),
        onUnload: (cx, cz) => meshes.delete(`${cx},${cz}`),
      },
      2,
    );
    manager.setCenter(0, 0);
    runToIdle(manager);
    // Place and break on the corner of four chunks, at the surface where light changes.
    const cells: [number, number][] = [
      [0, 0],
      [-1, 0],
      [0, -1],
      [-1, -1],
      [15, 3],
    ];
    for (const [x, z] of cells) {
      const y = world.surfaceY(x, z) + 1;
      world.setBlock(x, y, z, Block.STONE);
      manager.remeshAfterEdit(x, z);
      manager.update(fakeClock(10), 6);
      world.setBlock(x, y - 1, z, Block.AIR);
      manager.remeshAfterEdit(x, z);
    }
    while (manager.relight > 0) manager.update(fakeClock(1), 6);
    for (let cz = -2; cz <= 2; cz++) {
      for (let cx = -2; cx <= 2; cx++) {
        const fresh = meshChunk(
          world.getChunk(cx, cz)?.blocks ?? new Uint8Array(),
          (dx, dz) => world.getChunk(cx + dx, cz + dz)?.blocks ?? null,
          (dx, dz) => world.getChunk(cx + dx, cz + dz)?.light ?? null,
        );
        expect(meshes.get(`${cx},${cz}`), `${cx},${cz}`).toEqual(fresh);
      }
    }
    expect(world.verifyLight()).toBe(0);
  });

  it('forgets a waiting remesh when the chunk loses its mesh', () => {
    const { manager, world, recorder } = setup(2);
    manager.setCenter(0, 0);
    runToIdle(manager);
    world.setBlock(-20, world.surfaceY(-20, 5) + 1, 5, Block.PLANKS);
    expect(manager.relight).toBe(1);
    manager.setCenter(4, 0);
    expect(manager.relight).toBe(0);
    expect(recorder.unloaded).toContain('-2,0');
  });

  it('drops the meshes around a chunk that lost its light and builds them again', () => {
    const { manager, world, recorder } = setup(2);
    manager.setCenter(0, 0);
    runToIdle(manager);
    // An edit in a chunk that is not loaded: the lit chunks next to it cannot be trusted.
    world.removeChunk(4, 0);
    world.setBlock(4 * 16 + 1, 60, 0, Block.AIR);
    expect(world.getChunk(4, 0)).toBeUndefined();
    expect(world.getChunk(3, 0)?.light).toBeNull();
    expect(world.getChunk(3, 2)?.light).toBeTruthy();
    expect(world.getChunk(2, 0)?.light).toBeTruthy();
    expect(recorder.unloaded.sort()).toEqual(['2,-1', '2,-2', '2,0', '2,1', '2,2']);
    expect(manager.pending).toBe(5);
    runToIdle(manager);
    expect(manager.loaded).toBe(25);
    expect(world.verifyLight()).toBe(0);
  });
});
