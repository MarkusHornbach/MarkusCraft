import { describe, expect, it } from 'vitest';
import { REACH } from '../game/config';
import { Block } from './blocks';
import { raycast } from './raycast';

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
