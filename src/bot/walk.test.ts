// The walk check on small hand-built worlds (Phase 8 part B2a).
import { describe, expect, it } from 'vitest';
import { Block } from '../world/blocks';
import { type WalkWorld, isStanding, walkTo } from './walk';

/** A world of stone below y 1 and air above, with cells set by hand. */
function world(cells: Record<string, number>, light: Record<string, number> = {}): WalkWorld {
  return {
    block: (x, y, z) => cells[`${x},${y},${z}`] ?? (y <= 0 ? Block.STONE : Block.AIR),
    blockLight: (x, y, z) => light[`${x},${y},${z}`] ?? 0,
  };
}

const at = (x: number, y: number, z: number) => (cx: number, cy: number, cz: number) =>
  cx === x && cy === y && cz === z;
const box = { minX: -1, maxX: 6, minZ: -1, maxZ: 1 };

describe('walk check', () => {
  it('Phase 8B2a stands on solid cubes with a free cell above', () => {
    const w = world({ '0,1,0': Block.TORCH, '1,2,0': Block.STONE });
    expect(isStanding(w, 0, 1, 0)).toBe(true);
    expect(isStanding(w, 1, 1, 0)).toBe(false);
    expect(isStanding(w, 2, 2, 0)).toBe(false);
  });

  it('Phase 8B2a walks a stair up one block per step and down again', () => {
    const cells: Record<string, number> = {};
    for (let x = 1; x <= 4; x++) for (let y = 1; y <= x; y++) cells[`${x},${y},0`] = Block.STONE;
    const w = world(cells);
    expect(walkTo(w, { x: 0, y: 1, z: 0 }, at(4, 5, 0), box)).toBe(4);
    const path: { x: number; y: number; z: number }[] = [];
    expect(walkTo(w, { x: 4, y: 5, z: 0 }, at(0, 1, 0), { ...box, path })).toBe(4);
    expect(path.map((c) => c.y)).toEqual([5, 4, 3, 2, 1]);
  });

  it('Phase 8B2a never jumps two blocks, but drops any depth', () => {
    const cells: Record<string, number> = {};
    for (let y = 1; y <= 2; y++) cells[`1,${y},0`] = Block.STONE;
    const w = world(cells);
    expect(walkTo(w, { x: 0, y: 1, z: 0 }, at(1, 3, 0), box)).toBeNull();
    expect(walkTo(w, { x: 1, y: 3, z: 0 }, at(0, 1, 0), box)).toBe(1);
  });

  it('Phase 8B2a a jump needs headroom, and walls and water block the way', () => {
    const line = { minX: -1, maxX: 6, minZ: 0, maxZ: 0 };
    const w = world({ '1,1,0': Block.STONE, '0,3,0': Block.STONE });
    expect(walkTo(w, { x: 0, y: 1, z: 0 }, at(1, 2, 0), line)).toBeNull();
    const wall = world({ '1,1,0': Block.STONE, '1,2,0': Block.STONE });
    expect(walkTo(wall, { x: 0, y: 1, z: 0 }, at(2, 1, 0), line)).toBeNull();
    const pool = world({ '1,0,0': Block.WATER, '1,1,0': Block.WATER });
    expect(walkTo(pool, { x: 0, y: 1, z: 0 }, at(2, 1, 0), line)).toBeNull();
    expect(walkTo(world({}), { x: 0, y: 1, z: 0 }, at(2, 1, 0), line)).toBe(2);
  });

  it('Phase 8B2a the light floor keeps to lit cells', () => {
    const light = { '0,1,0': 10, '1,1,0': 10, '2,1,0': 3, '3,1,0': 10 };
    const w = world({}, light);
    const narrow = { minX: 0, maxX: 3, minZ: 0, maxZ: 0 };
    expect(walkTo(w, { x: 0, y: 1, z: 0 }, at(3, 1, 0), { ...narrow, lightAbove: 4 })).toBeNull();
    expect(walkTo(w, { x: 0, y: 1, z: 0 }, at(3, 1, 0), narrow)).toBe(3);
  });
});
