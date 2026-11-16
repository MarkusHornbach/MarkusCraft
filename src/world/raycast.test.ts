import { describe, expect, it } from 'vitest';
import { REACH } from '../game/config';
import { mulberry32 } from '../util/rng';
import { BLOCK_TARGETABLE, Block } from './blocks';
import { aimBox, raycast } from './raycast';

function worldOf(cells: Record<string, number>) {
  return (x: number, y: number, z: number) => cells[`${x},${y},${z}`] ?? Block.AIR;
}

describe('raycast (AC9.1)', () => {
  const axes: [number, number, number][] = [
    [1, 0, 0],
    [-1, 0, 0],
    [0, 1, 0],
    [0, -1, 0],
    [0, 0, 1],
    [0, 0, -1],
  ];

  it('hits the correct block and face along all six axes', () => {
    for (const [dx, dy, dz] of axes) {
      const bx = dx * 3;
      const by = dy * 3;
      const bz = dz * 3;
      const get = worldOf({ [`${bx},${by},${bz}`]: Block.STONE });
      const hit = raycast(get, 0.5, 0.5, 0.5, dx, dy, dz, REACH);
      expect(hit).not.toBeNull();
      expect([hit?.x, hit?.y, hit?.z]).toEqual([bx, by, bz]);
      expect(hit?.face.map((v) => v + 0)).toEqual([-dx, -dy, -dz].map((v) => v + 0));
      expect(hit?.id).toBe(Block.STONE);
      expect(hit?.distance).toBeCloseTo(2.5, 10);
    }
  });

  it('hits blocks along diagonal rays with the face that was crossed', () => {
    const get = worldOf({ '2,2,0': Block.DIRT });
    // From the cell centre the diagonal passes exactly through corners; aim slightly off.
    const hit = raycast(get, 0.5, 0.2, 0.5, 1, 1, 0, REACH);
    expect([hit?.x, hit?.y, hit?.z]).toEqual([2, 2, 0]);
    // Starting low, the ray is still in row 1 when it reaches x = 2: it enters from below.
    expect(hit?.face).toEqual([0, -1, 0]);
    expect(hit?.distance).toBeCloseTo(1.8 * Math.SQRT2, 10);

    const other = raycast(get, 0.2, 0.5, 0.5, 1, 1, 0, REACH);
    expect([other?.x, other?.y, other?.z]).toEqual([2, 2, 0]);
    expect(other?.face).toEqual([-1, 0, 0]);

    // A 3D diagonal into a floor.
    const floor: Record<string, number> = {};
    for (let x = -6; x <= 6; x++) for (let z = -6; z <= 6; z++) floor[`${x},-2,${z}`] = Block.GRASS;
    const down = raycast(worldOf(floor), 0.5, 0.62, 0.5, 0.5, -0.7, -0.4, REACH);
    expect(down?.y).toBe(-2);
    expect(down?.face).toEqual([0, 1, 0]);
    expect(down?.x).toBe(1);
    expect(down?.z).toBe(-1);
  });

  it('returns the first of several blocks', () => {
    const get = worldOf({ '2,0,0': Block.GLASS, '3,0,0': Block.STONE });
    expect(raycast(get, 0.5, 0.5, 0.5, 1, 0, 0, REACH)?.id).toBe(Block.GLASS);
  });

  it('returns nothing beyond the reach', () => {
    const near = worldOf({ '5,0,0': Block.STONE });
    // Block face at x = 5, origin at 0.5: distance 4.5 → inside reach 5.
    expect(raycast(near, 0.5, 0.5, 0.5, 1, 0, 0, REACH)).not.toBeNull();
    const far = worldOf({ '6,0,0': Block.STONE });
    expect(raycast(far, 0.5, 0.5, 0.5, 1, 0, 0, REACH)).toBeNull();
    expect(raycast(far, 0.5, 0.5, 0.5, 1, 0, 0, 5.6)).not.toBeNull();
    expect(raycast(worldOf({}), 0.5, 0.5, 0.5, 0.3, -0.8, 0.1, REACH)).toBeNull();
  });

  it('passes through water and air', () => {
    const get = worldOf({ '1,0,0': Block.WATER, '2,0,0': Block.WATER, '3,0,0': Block.SAND });
    const hit = raycast(get, 0.5, 0.5, 0.5, 1, 0, 0, REACH);
    expect(hit?.x).toBe(3);
    expect(hit?.id).toBe(Block.SAND);
  });

  it('ignores the cell containing the origin and rejects a zero direction', () => {
    const get = worldOf({ '0,0,0': Block.STONE, '2,0,0': Block.STONE });
    expect(raycast(get, 0.5, 0.5, 0.5, 1, 0, 0, REACH)?.x).toBe(2);
    expect(raycast(get, 0.5, 0.5, 0.5, 0, 0, 0, REACH)).toBeNull();
  });

  it('normalises the direction', () => {
    const get = worldOf({ '3,0,0': Block.STONE });
    expect(raycast(get, 0.5, 0.5, 0.5, 10, 0, 0, REACH)?.distance).toBeCloseTo(2.5, 10);
  });

  it('works with negative coordinates', () => {
    const get = worldOf({ '-3,-1,-2': Block.STONE });
    const hit = raycast(get, -0.5, -0.5, -1.5, -1, 0, 0, REACH);
    expect([hit?.x, hit?.y, hit?.z]).toEqual([-3, -1, -2]);
    expect(hit?.face).toEqual([1, 0, 0]);
    expect(hit?.distance).toBeCloseTo(1.5, 10);
  });
});

describe('aiming at a torch (Phase 4 AC7.3)', () => {
  const box = aimBox(Block.TORCH);

  it('has a box of 6/16 × 14/16 standing on the floor of the cell', () => {
    expect([box.x1 - box.x0, box.y1 - box.y0, box.z1 - box.z0]).toEqual([6 / 16, 14 / 16, 6 / 16]);
    expect([box.x0, box.y0, box.z0]).toEqual([5 / 16, 0, 5 / 16]);
    expect(aimBox(Block.STONE)).toEqual({ x0: 0, y0: 0, z0: 0, x1: 1, y1: 1, z1: 1 });
  });

  it('a ray through the cell that misses the box hits the block behind', () => {
    const get = worldOf({ '2,0,0': Block.TORCH, '4,0,0': Block.STONE });
    // High in the cell, above the box.
    const over = raycast(get, 0.5, 0.95, 0.5, 1, 0, 0, REACH);
    expect([over?.x, over?.id]).toEqual([4, Block.STONE]);
    // Beside the box.
    const beside = raycast(get, 0.5, 0.4, 0.2, 1, 0, 0, REACH);
    expect([beside?.x, beside?.id]).toEqual([4, Block.STONE]);
  });

  it('a ray through the box hits the torch and reports the face it entered', () => {
    const get = worldOf({ '2,0,0': Block.TORCH, '4,0,0': Block.STONE });
    const hit = raycast(get, 0.5, 0.4, 0.5, 1, 0, 0, REACH);
    expect([hit?.x, hit?.y, hit?.z, hit?.id]).toEqual([2, 0, 0, Block.TORCH]);
    expect(hit?.face).toEqual([-1, 0, 0]);
    expect(hit?.distance).toBeCloseTo(1.5 + 5 / 16, 10);
    // From above onto its top.
    const down = raycast(get, 2.5, 3.5, 0.5, 0, -1, 0, REACH);
    expect(down?.face).toEqual([0, 1, 0]);
    expect(down?.distance).toBeCloseTo(3.5 - 14 / 16, 10);
    // Out of reach once the box lies beyond it, although the cell starts within.
    expect(raycast(get, 0.5, 0.4, 0.5, 1, 0, 0, 1.6)).toBeNull();
  });

  it('agrees with a slow reference for 1 000 seeded rays', () => {
    const cells: Record<string, number> = { '0,0,0': Block.TORCH, '0,-1,0': Block.STONE };
    for (let x = -1; x <= 1; x++) for (let z = -1; z <= 1; z++) cells[`${x},-1,${z}`] = Block.STONE;
    cells['0,0,-2'] = Block.STONE;
    const get = worldOf(cells);
    const rng = mulberry32(77);
    let torchHits = 0;
    let behind = 0;
    for (let i = 0; i < 1000; i++) {
      // From points around the torch, at it or near it.
      const angle = rng() * Math.PI * 2;
      const ox = 0.5 + Math.cos(angle) * 2.2;
      const oz = 0.5 + Math.sin(angle) * 2.2;
      const oy = rng() * 1.6;
      const tx = 0.5 + (rng() - 0.5) * 1.2;
      const ty = rng() * 1.1;
      const tz = 0.5 + (rng() - 0.5) * 1.2;
      const [dx, dy, dz] = [tx - ox, ty - oy, tz - oz];
      const hit = raycast(get, ox, oy, oz, dx, dy, dz, REACH);
      const expected = slowRay(get, ox, oy, oz, dx, dy, dz, REACH);
      expect([hit?.x, hit?.y, hit?.z], `ray ${i}`).toEqual([expected?.x, expected?.y, expected?.z]);
      if (hit && expected) expect(hit.distance).toBeCloseTo(expected.distance, 2);
      if (hit?.id === Block.TORCH) {
        torchHits++;
        // The entry point lies on the plane of the reported face of the box.
        const length = Math.hypot(dx, dy, dz);
        const point = [ox, oy, oz].map(
          (o, axis) => o + ([dx, dy, dz][axis] / length) * hit.distance,
        );
        const axis = hit.face.findIndex((n) => n !== 0);
        const lo = [box.x0, box.y0, box.z0][axis];
        const hi = [box.x1, box.y1, box.z1][axis];
        expect(point[axis]).toBeCloseTo(hit.face[axis] > 0 ? hi : lo, 9);
        // It meets the face the slow reference found, or an edge next to it.
        if (expected) expect(Math.abs(expected.distance - hit.distance)).toBeLessThan(0.002);
      } else if (hit) behind++;
    }
    expect(torchHits).toBeGreaterThan(100);
    expect(behind).toBeGreaterThan(100);
  });
});

/**
 * The slow reference: marches along the ray in tiny steps and stops at the first point
 * inside a cube or inside a block's aiming box. The face is the side of the box the point
 * is nearest to.
 */
function slowRay(
  get: (x: number, y: number, z: number) => number,
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
  max: number,
): { x: number; y: number; z: number; distance: number; face: number[] } | null {
  const length = Math.hypot(dx, dy, dz);
  const start = [Math.floor(ox), Math.floor(oy), Math.floor(oz)].join();
  for (let t = 0; t <= max; t += 0.0005) {
    const px = ox + (dx / length) * t;
    const py = oy + (dy / length) * t;
    const pz = oz + (dz / length) * t;
    const [x, y, z] = [Math.floor(px), Math.floor(py), Math.floor(pz)];
    if ([x, y, z].join() === start) continue;
    const id = get(x, y, z);
    if (BLOCK_TARGETABLE[id] !== 1) continue;
    const b = aimBox(id);
    const [lx, ly, lz] = [px - x, py - y, pz - z];
    if (lx < b.x0 || lx > b.x1 || ly < b.y0 || ly > b.y1 || lz < b.z0 || lz > b.z1) continue;
    const gaps = [lx - b.x0, b.x1 - lx, ly - b.y0, b.y1 - ly, lz - b.z0, b.z1 - lz];
    const nearest = gaps.indexOf(Math.min(...gaps));
    const face = [0, 0, 0];
    face[nearest >> 1] = nearest % 2 === 0 ? -1 : 1;
    return { x, y, z, distance: t, face };
  }
  return null;
}
