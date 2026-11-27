// The mine shaft's layout (Phase 8 part B2a, 6.4).
import { describe, expect, it } from 'vitest';
import { type WalkWorld, walkTo } from '../../bot/walk';
import { Block, isSupport } from '../blocks';
import { RING, SHAFT_HALF, type Shaft, shaftBlock, shaftChamberCell, shaftTopCell } from './shafts';

const SHAFT: Shaft = {
  x: 0,
  z: 0,
  top: 60,
  floor: 12,
  entry: (((2 - 48) % 8) + 8) % 8,
  spawn: true,
};

/**
 * The shaft in a world of stone up to its top; a torch lights a cell by 14 minus the steps
 * between them (open air, as inside the shaft).
 */
function shaftWorld(s: Shaft): WalkWorld {
  const block = (x: number, y: number, z: number): number => {
    const own = shaftBlock(s, x, y, z);
    if (own >= 0) return own;
    return y <= s.top ? Block.STONE : Block.AIR;
  };
  return {
    block,
    blockLight: (x, y, z) => {
      let best = 0;
      for (let dy = -6; dy <= 6; dy++) {
        for (let dz = -7; dz <= 7; dz++) {
          for (let dx = -7; dx <= 7; dx++) {
            if (block(x + dx, y + dy, z + dz) !== Block.TORCH) continue;
            best = Math.max(best, 14 - Math.abs(dx) - Math.abs(dy) - Math.abs(dz));
          }
        }
      }
      return best;
    },
  };
}

describe('mine shaft', () => {
  it('Phase 8B2a stays in its footprint and builds from existing blocks', () => {
    const used = new Set<number>();
    for (let y = 0; y < 128; y++) {
      for (let z = -5; z <= 5; z++) {
        for (let x = -5; x <= 5; x++) {
          const id = shaftBlock(SHAFT, x, y, z);
          if (id < 0) continue;
          expect(Math.max(Math.abs(x), Math.abs(z))).toBeLessThanOrEqual(SHAFT_HALF);
          expect(y).toBeLessThanOrEqual(SHAFT.top + 4);
          used.add(id);
          if (id === Block.TORCH) expect(isSupport(shaftBlock(SHAFT, x, y - 1, z))).toBe(true);
        }
      }
    }
    expect([...used].sort((a, b) => a - b)).toEqual(
      [Block.AIR, Block.LOG, Block.PLANKS, Block.STONE_BRICKS, Block.TORCH].sort((a, b) => a - b),
    );
  });

  it('Phase 8B2a has a torch at least every 6 steps and two in the chamber', () => {
    const torchesAt: number[] = [];
    for (let y = SHAFT.floor + 1; y <= SHAFT.top; y++) {
      for (const [dx, dz] of RING)
        if (shaftBlock(SHAFT, dx, y, dz) === Block.TORCH) torchesAt.push(y);
    }
    for (let i = 1; i < torchesAt.length; i++) {
      expect(torchesAt[i] - torchesAt[i - 1]).toBeLessThanOrEqual(6);
    }
    let chamber = 0;
    for (let z = -3; z <= 3; z++) {
      for (let x = -3; x <= 3; x++)
        if (shaftBlock(SHAFT, x, SHAFT.floor, z) === Block.TORCH) chamber++;
    }
    expect(chamber).toBe(2);
  });

  it('Phase 8B2a is walked from its top to its chamber and back in torch light', () => {
    const w = shaftWorld(SHAFT);
    const top = shaftTopCell(SHAFT);
    const chamber = shaftChamberCell(SHAFT);
    const isAt = (c: { x: number; y: number; z: number }) => (x: number, y: number, z: number) =>
      x === c.x && y === c.y && z === c.z;
    const limits = { minX: -3, maxX: 3, minZ: -3, maxZ: 3, lightAbove: 4 };
    expect(walkTo(w, top, isAt(chamber), limits)).not.toBeNull();
    expect(walkTo(w, chamber, isAt(top), limits)).not.toBeNull();
  });
});
