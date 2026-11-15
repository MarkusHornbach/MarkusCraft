import { describe, expect, it } from 'vitest';
import { AO_LEVELS, CHUNK_SIZE } from '../../game/config';
import { flatGroup, worldOf } from '../../testing/lightEdits';
import { Block } from '../blocks';
import type { World } from '../World';
import { type ChunkMeshData, type MeshBuffers, meshChunk } from './mesher';

function meshOf(world: World, cx: number, cz: number): ChunkMeshData {
  const center = world.getChunk(cx, cz);
  if (!center) throw new Error('chunk missing');
  return meshChunk(
    center.blocks,
    (dx, dz) => world.getChunk(cx + dx, cz + dz)?.blocks ?? null,
    (dx, dz) => world.getChunk(cx + dx, cz + dz)?.light ?? null,
  );
}

function quads(buffers: MeshBuffers): number {
  return buffers.positions.length / 12;
}

/** Quads of a pass whose four corners all lie inside cell (x, y, z) of the chunk. */
function quadsInCell(buffers: MeshBuffers, x: number, y: number, z: number): number[] {
  const found: number[] = [];
  for (let q = 0; q < quads(buffers); q++) {
    let inside = true;
    for (let k = 0; k < 4; k++) {
      const i = (q * 4 + k) * 3;
      const [px, py, pz] = [
        buffers.positions[i],
        buffers.positions[i + 1],
        buffers.positions[i + 2],
      ];
      if (px < x || px > x + 1 || py < y || py > y + 1 || pz < z || pz > z + 1) inside = false;
    }
    if (inside) found.push(q);
  }
  return found;
}

// The torch stands in the middle chunk (2, 2), at local (8, 11, 8), on stone up to y 10.
const TX = 2 * CHUNK_SIZE + 8;
const TZ = 2 * CHUNK_SIZE + 8;

describe('the torch in the mesher (Phase 4 AC7.2)', () => {
  it('emits ten quads, all in the cutout pass and inside its cell', () => {
    const world = worldOf(flatGroup());
    const before = meshOf(world, 2, 2);
    world.setBlock(TX, 11, TZ, Block.TORCH);
    const after = meshOf(world, 2, 2);
    expect(quads(after.cutout) - quads(before.cutout)).toBe(10);
    expect(quads(after.cutout)).toBeLessThanOrEqual(12);
    expect(quadsInCell(after.cutout, 8, 11, 8).length).toBe(quads(after.cutout));
    expect(quads(after.translucent)).toBe(quads(before.translucent));
    // The ground keeps its top face under the torch, and blocks beside keep theirs.
    expect(quads(after.opaque)).toBe(quads(before.opaque));
    world.setBlock(TX + 1, 11, TZ, Block.STONE);
    const walled = meshOf(world, 2, 2);
    // The new stone shows five faces, its west face towards the torch included.
    expect(quads(walled.opaque) - quads(after.opaque)).toBe(5 - 1);
  });

  it('casts no ambient occlusion and carries the light of its own cell on every vertex', () => {
    const world = worldOf(flatGroup());
    const plain = meshOf(world, 2, 2).opaque.colors.slice();
    world.setBlock(TX, 11, TZ, Block.TORCH);
    const mesh = meshOf(world, 2, 2);
    // The red channel (shade × ambient occlusion) of the ground is unchanged.
    const red = (c: Float32Array) => c.filter((_, i) => i % 3 === 0);
    expect([...red(mesh.opaque.colors)]).toEqual([...red(plain)]);
    const cutout = mesh.cutout;
    for (let v = 0; v < cutout.positions.length / 3; v++) {
      expect(cutout.colors[v * 3 + 1]).toBe(1);
      expect(cutout.colors[v * 3 + 2]).toBeCloseTo(14 / 15, 6);
      // Face shades only: no ambient occlusion darkens a torch.
      expect(cutout.colors[v * 3]).toBeGreaterThanOrEqual(0.5 * AO_LEVELS[0]);
    }
    // In the stick's middle the width is 2/16.
    const xs = new Set<number>();
    for (let v = 0; v < cutout.positions.length / 3; v++) xs.add(cutout.positions[v * 3]);
    expect([...xs].sort()).toEqual([8 + 6 / 16, 8 + 7 / 16, 8 + 9 / 16, 8 + 10 / 16]);
  });

  it('lights the faces next to it: the ground beside it gets block light', () => {
    const world = worldOf(flatGroup());
    world.setBlock(TX, 11, TZ, Block.TORCH);
    const mesh = meshOf(world, 2, 2);
    let lit = 0;
    for (let v = 0; v < mesh.opaque.positions.length / 3; v++) {
      if (mesh.opaque.positions[v * 3 + 1] === 11 && mesh.opaque.colors[v * 3 + 2] > 0.8) lit++;
    }
    expect(lit).toBeGreaterThanOrEqual(4);
  });
});
