import { describe, expect, it } from 'vitest';
import { Block } from './blocks';
import { ChunkManager } from './ChunkManager';
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

describe('ChunkManager (AC7.3)', () => {
  it('does nothing before a centre is set', () => {
    const { manager } = setup(2);
    expect(manager.update(fakeClock(1), 6)).toBe(0);
    expect(manager.pending).toBe(25);
    expect(manager.loaded).toBe(0);
  });

  it('runs exactly one job once the budget is exhausted', () => {
    const { manager } = setup(2);
    manager.setCenter(0, 0);
    // Every clock read advances 10 ms: the budget of 6 ms is gone after the first job.
    expect(manager.update(fakeClock(10), 6)).toBe(1);
    expect(manager.update(fakeClock(10), 6)).toBe(1);
    // A budget of zero still makes progress.
    expect(manager.update(fakeClock(0), 0)).toBe(1);
  });

  it('runs several jobs while budget remains, and stops at the limit', () => {
    const { manager } = setup(2);
    manager.setCenter(0, 0);
    // 1 ms per read: start at 0, then checks at 1, 2, … → 6 jobs fit into 6 ms.
    expect(manager.update(fakeClock(1), 6)).toBe(6);
  });

  it('meshes nearest first and only with all neighbours generated', () => {
    const { manager, recorder } = setup(3, (world, cx, cz) => {
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          expect(world.hasChunk(cx + dx, cz + dz)).toBe(true);
        }
      }
    });
    manager.setCenter(5, -7);
    runToIdle(manager);
    expect(recorder.meshed.length).toBe(49);
    expect(new Set(recorder.meshed).size).toBe(49);
    expect(recorder.meshed[0]).toBe('5,-7');
    const distances = recorder.meshed.map((key) => {
      const [cx, cz] = key.split(',').map(Number);
      return (cx - 5) ** 2 + (cz + 7) ** 2;
    });
    for (let i = 1; i < distances.length; i++) {
      expect(distances[i]).toBeGreaterThanOrEqual(distances[i - 1]);
    }
    expect(manager.loaded).toBe(49);
    expect(manager.meshed).toBe(49);
    expect(manager.pending).toBe(0);
    expect(manager.update(fakeClock(1), 6)).toBe(0);
  });

  it('generates the ring of neighbours but nothing beyond it', () => {
    const { manager, world } = setup(2);
    manager.setCenter(0, 0);
    runToIdle(manager);
    // Radius 2 meshes 5×5 and needs data for 7×7.
    expect(world.chunkCount).toBe(49);
  });

  it('unloads chunks farther than radius + 1 and keeps the hysteresis ring', () => {
    const { manager, world, recorder } = setup(2);
    manager.setCenter(0, 0);
    runToIdle(manager);
    // One chunk east: column -2 is now at distance 3 = R + 1 and keeps its meshes.
    manager.setCenter(1, 0);
    expect(recorder.unloaded.length).toBe(0);
    expect(manager.loaded).toBe(20);
    expect(manager.pending).toBe(5);
    runToIdle(manager);
    expect(manager.loaded).toBe(25);
    expect(manager.meshed).toBe(30);
    // Another chunk east: column -2 is at distance 4 and goes away.
    manager.setCenter(2, 0);
    expect(recorder.unloaded.sort()).toEqual(['-2,-1', '-2,-2', '-2,0', '-2,1', '-2,2']);
    expect(world.hasChunk(-3, 0)).toBe(false);
    expect(world.hasChunk(-1, 0)).toBe(true);
    runToIdle(manager);
    expect(manager.meshed).toBe(30);

    // A far jump unloads everything.
    manager.setCenter(100, 100);
    expect(manager.loaded).toBe(0);
    expect(manager.meshed).toBe(0);
    expect(world.chunkCount).toBe(0);
    runToIdle(manager);
    expect(manager.loaded).toBe(25);
    expect(world.chunkCount).toBe(49);
  });

  it('follows radius changes', () => {
    const { manager, world } = setup(3);
    manager.setCenter(0, 0);
    runToIdle(manager);
    manager.setRadius(1);
    expect(manager.loadRadius).toBe(1);
    expect(manager.targetCount).toBe(9);
    expect(manager.loaded).toBe(9);
    expect(manager.pending).toBe(0);
    expect(manager.meshed).toBe(25);
    expect(world.chunkCount).toBe(25);
    manager.setRadius(2);
    expect(manager.pending).toBe(0);
    manager.setRadius(3);
    expect(manager.pending).toBe(24);
    runToIdle(manager);
    expect(manager.loaded).toBe(49);
  });

  it('remeshes immediately after an edit', () => {
    const { manager, world, recorder } = setup(2);
    manager.setCenter(0, 0);
    runToIdle(manager);
    recorder.meshed.length = 0;
    world.setBlock(5, 120, 5, Block.BRICKS);
    manager.remesh(0, 0);
    expect(recorder.meshed).toEqual(['0,0']);
    // Unknown or unmeshed chunks are ignored.
    manager.remesh(50, 50);
    manager.remesh(3, 3);
    expect(recorder.meshed).toEqual(['0,0']);
  });

  it('drops and requeues a mesh whose neighbours are gone', () => {
    const { manager, world, recorder } = setup(2);
    manager.setCenter(0, 0);
    runToIdle(manager);
    manager.setCenter(1, 0);
    runToIdle(manager);
    // Chunk (-2, 0) sits in the hysteresis ring; remove one of its neighbours.
    world.removeChunk(-3, 0);
    recorder.meshed.length = 0;
    manager.remesh(-2, 0);
    expect(recorder.unloaded).toEqual(['-2,0']);
    expect(recorder.meshed).toEqual([]);
    expect(manager.meshed).toBe(29);
    expect(manager.loaded).toBe(25);
    // Inside the radius the dropped chunk is rebuilt by the normal queue.
    world.removeChunk(4, 0);
    manager.remesh(3, 0);
    expect(manager.loaded).toBe(24);
    expect(manager.pending).toBe(1);
    runToIdle(manager);
    expect(manager.loaded).toBe(25);
    expect(recorder.meshed).toEqual(['3,0']);
  });
});

describe('ChunkManager performance (AC12.2)', () => {
  it('generates and meshes the 81 chunks of render distance 4 in under 3 s', () => {
    const { manager } = setup(4);
    manager.setCenter(0, 0);
    const start = performance.now();
    while (manager.pending > 0) manager.update(() => performance.now(), 1000);
    const elapsed = performance.now() - start;
    expect(manager.loaded).toBe(81);
    expect(elapsed).toBeLessThan(3000);
  });
});
