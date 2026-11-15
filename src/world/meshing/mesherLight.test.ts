import { describe, expect, it } from 'vitest';
import { CHUNK_SIZE } from '../../game/config';
import { ChunkGroup } from '../../testing/lightScenes';
import { Block } from '../blocks';
import { createChunk } from '../chunk';
import { World } from '../World';
import { type ChunkMeshData, type MeshBuffers, meshChunk } from './mesher';

const PASSES = ['opaque', 'cutout', 'translucent'] as const;

function meshOf(world: World, cx: number, cz: number, withLight = true): ChunkMeshData {
  const center = world.getChunk(cx, cz);
  if (!center) throw new Error('chunk missing');
  const blocks = (dx: number, dz: number) => world.getChunk(cx + dx, cz + dz)?.blocks ?? null;
  if (!withLight) return meshChunk(center.blocks, blocks);
  return meshChunk(
    center.blocks,
    blocks,
    (dx, dz) => world.getChunk(cx + dx, cz + dz)?.light ?? null,
  );
}

let terrain: World | null = null;
/**
 * The terrain of seed 1337 around the origin: chunks -3..4 generated, -2..3 lit. Built
 * once for all tests of this file; none of them changes it.
 */
function terrainWorld(): World {
  if (terrain) return terrain;
  const world = new World(1337);
  for (let cz = -3; cz <= 4; cz++) for (let cx = -3; cx <= 4; cx++) world.generate(cx, cz);
  for (let cz = -2; cz <= 3; cz++) for (let cx = -2; cx <= 3; cx++) world.light(cx, cz);
  terrain = world;
  return world;
}

/** A world of 5 × 5 chunks (0..4) from a group, the inner 3 × 3 lit. */
function groupWorld(group: ChunkGroup): World {
  const world = new World(1);
  for (let cz = 0; cz < 5; cz++) {
    for (let cx = 0; cx < 5; cx++)
      world.addChunk(createChunk(cx, cz, group.at(cx, cz) as Uint8Array));
  }
  for (let cz = 1; cz <= 3; cz++) for (let cx = 1; cx <= 3; cx++) world.light(cx, cz);
  return world;
}

interface LitVertex {
  x: number;
  y: number;
  z: number;
  sky: number;
  glow: number;
}

function vertices(buffers: MeshBuffers, cx = 0, cz = 0): LitVertex[] {
  const list: LitVertex[] = [];
  for (let v = 0; v < buffers.positions.length / 3; v++) {
    list.push({
      x: buffers.positions[v * 3] + cx * CHUNK_SIZE,
      y: buffers.positions[v * 3 + 1],
      z: buffers.positions[v * 3 + 2] + cz * CHUNK_SIZE,
      sky: buffers.colors[v * 3 + 1],
      glow: buffers.colors[v * 3 + 2],
    });
  }
  return list;
}

/**
 * Checks AC3.2 for the meshes of some chunks: two quads in the same plane, facing the
 * same way, that share an edge carry the same light at both ends of it. Returns the number of shared edges.
 */
function expectSharedEdgesAgree(meshes: { cx: number; cz: number; data: ChunkMeshData }[]): number {
  // Edge (plane, two corner positions) → light at the two corners, per quad.
  const edges = new Map<string, [LitVertex, LitVertex][]>();
  for (const { cx, cz, data } of meshes) {
    for (const pass of PASSES) {
      const list = vertices(data[pass], cx, cz);
      for (let q = 0; q < list.length / 4; q++) {
        const corners = list.slice(q * 4, q * 4 + 4);
        // The axis along which all four corners agree is the normal of the quad's plane.
        const axis = (['x', 'y', 'z'] as const).find((a) =>
          corners.every((c) => c[a] === corners[0][a]),
        );
        // Which way the quad faces: the corners run counter-clockwise seen from outside.
        const [a, b, c] = corners;
        const normal =
          axis === 'x'
            ? (b.y - a.y) * (c.z - a.z) - (b.z - a.z) * (c.y - a.y)
            : axis === 'y'
              ? (b.z - a.z) * (c.x - a.x) - (b.x - a.x) * (c.z - a.z)
              : (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
        const side = `${axis}${normal > 0 ? '+' : '-'}`;
        for (let k = 0; k < 4; k++) {
          const pair = [corners[k], corners[(k + 1) % 4]].sort(
            (a, b) => a.x - b.x || a.y - b.y || a.z - b.z,
          ) as [LitVertex, LitVertex];
          const key = `${side}|${pair.map((c) => `${c.x},${c.y},${c.z}`).join('|')}`;
          const found = edges.get(key);
          if (found) found.push(pair);
          else edges.set(key, [pair]);
        }
      }
    }
  }
  let shared = 0;
  for (const [key, quads] of edges) {
    if (quads.length < 2) continue;
    shared++;
    for (const [a, b] of quads) {
      expect(a.sky, key).toBeCloseTo(quads[0][0].sky, 6);
      expect(a.glow, key).toBeCloseTo(quads[0][0].glow, 6);
      expect(b.sky, key).toBeCloseTo(quads[0][1].sky, 6);
      expect(b.glow, key).toBeCloseTo(quads[0][1].glow, 6);
    }
  }
  return shared;
}

describe('light in the mesh (Phase 4 step 3)', () => {
  it('AC3.1: on flat open ground every vertex has full sky light and no block light', () => {
    const group = new ChunkGroup(5);
    group.fill(0, 0, 0, 79, 10, 79, Block.STONE);
    const data = meshOf(groupWorld(group), 2, 2);
    const list = vertices(data.opaque);
    expect(list.length).toBe(16 * 16 * 4);
    for (const v of list) {
      expect(v.sky).toBe(1);
      expect(v.glow).toBe(0);
    }
  });

  it('AC3.1: in a closed hollow every vertex has sky light 0', () => {
    const group = new ChunkGroup(5);
    group.fill(0, 0, 0, 79, 30, 79, Block.STONE);
    group.fill(34, 10, 34, 44, 14, 44, Block.AIR);
    const data = meshOf(groupWorld(group), 2, 2);
    const inside = vertices(data.opaque).filter((v) => v.y <= 15);
    // Six faces of a hollow of 11 × 5 × 11 cells.
    expect(inside.length).toBe((2 * 121 + 4 * 55) * 4);
    for (const v of inside) expect(v.sky).toBe(0);
    for (const v of vertices(data.opaque).filter((v) => v.y > 15)) expect(v.sky).toBe(1);
  });

  it('light is the average of the cells that touch a vertex, without the opaque ones', () => {
    const group = new ChunkGroup(5);
    group.fill(0, 0, 0, 79, 10, 79, Block.STONE);
    // A roof of 9 × 9 two cells above the floor: under it the light falls off evenly.
    group.fill(32, 13, 32, 40, 13, 40, Block.PLANKS);
    // A wall on the floor under the roof: the cells next to it have fewer neighbours.
    group.fill(36, 11, 34, 36, 12, 38, Block.STONE);
    const world = groupWorld(group);
    const data = meshOf(world, 2, 2);
    const sky = (x: number, y: number, z: number) => (world.getLight(x, y, z) ?? 0) >> 4;
    const top = vertices(data.opaque, 2, 2).filter((v) => v.y === 11);
    const at = (x: number, z: number) => top.find((v) => v.x === x && v.z === z)?.sky;
    // In the open under the roof: four cells around the vertex.
    const mean = (cells: [number, number][]) =>
      cells.reduce((sum, [x, z]) => sum + sky(x, 11, z), 0) / cells.length / 15;
    expect(at(34, 36)).toBeCloseTo(
      mean([
        [33, 35],
        [34, 35],
        [33, 36],
        [34, 36],
      ]),
      6,
    );
    // At the foot of the wall (x = 36): the two wall cells do not count.
    expect(at(36, 36)).toBeCloseTo(
      mean([
        [35, 35],
        [35, 36],
      ]),
      6,
    );
    expect(at(36, 36)).toBeLessThan(1);
    expect(at(36, 36)).toBeGreaterThan(0);
    // At the wall's end the cell diagonally behind it still counts for the outer corner.
    expect(at(36, 34)).toBeCloseTo(
      mean([
        [35, 33],
        [36, 33],
        [35, 34],
      ]),
      6,
    );
  });

  it('AC3.2: faces in one plane agree on the light of the vertices they share (terrain)', () => {
    const world = terrainWorld();
    const pairs: [number, number, number, number][] = [
      [0, 0, 1, 0],
      [0, 0, 0, 1],
      [1, 1, 2, 1],
      [-1, 0, -1, -1],
    ];
    for (const [ax, az, bx, bz] of pairs) {
      const shared = expectSharedEdgesAgree([
        { cx: ax, cz: az, data: meshOf(world, ax, az) },
        { cx: bx, cz: bz, data: meshOf(world, bx, bz) },
      ]);
      expect(shared).toBeGreaterThan(2000);
    }
  });

  it('AC3.2: the same in a tunnel that crosses a chunk border', () => {
    const group = new ChunkGroup(5);
    group.fill(0, 0, 0, 79, 10, 79, Block.STONE);
    group.fill(20, 11, 0, 79, 30, 79, Block.STONE);
    // The tunnel starts in the open at x = 20 and crosses the border at x = 32.
    group.fill(20, 11, 40, 45, 12, 40, Block.AIR);
    const world = groupWorld(group);
    const west = meshOf(world, 1, 2);
    const east = meshOf(world, 2, 2);
    expect(
      expectSharedEdgesAgree([
        { cx: 1, cz: 2, data: west },
        { cx: 2, cz: 2, data: east },
      ]),
    ).toBeGreaterThan(500);
    // The tunnel's floor gets darker from vertex to vertex, across the border as well.
    const floor = [...vertices(west.opaque, 1, 2), ...vertices(east.opaque, 2, 2)].filter(
      (v) => v.y === 11 && v.z === 40 && v.x >= 21 && v.x <= 36,
    );
    const byX = new Map<number, number>();
    for (const v of floor) {
      if (byX.has(v.x)) expect(v.sky).toBeCloseTo(byX.get(v.x) as number, 6);
      byX.set(v.x, v.sky);
    }
    for (let x = 22; x <= 34; x++) {
      expect(byX.get(x) as number).toBeLessThan(byX.get(x - 1) as number);
    }
    expect(byX.get(36)).toBe(0);
  });

  it('AC3.3: positions, texture coordinates and triangle counts are as without light', () => {
    const world = terrainWorld();
    let diagonals = 0;
    for (let cz = -1; cz <= 2; cz++) {
      for (let cx = -1; cx <= 2; cx++) {
        const plain = meshOf(world, cx, cz, false);
        const lit = meshOf(world, cx, cz);
        for (const pass of PASSES) {
          expect(lit[pass].positions).toEqual(plain[pass].positions);
          expect(lit[pass].uvs).toEqual(plain[pass].uvs);
          expect(lit[pass].indices.length).toBe(plain[pass].indices.length);
          for (let v = 0; v < plain[pass].colors.length / 3; v++) {
            // Shade × ambient occlusion is untouched; without light everything is open sky.
            expect(lit[pass].colors[v * 3]).toBe(plain[pass].colors[v * 3]);
            expect(plain[pass].colors[v * 3 + 1]).toBe(1);
            expect(plain[pass].colors[v * 3 + 2]).toBe(0);
          }
          for (let i = 0; i < plain[pass].indices.length; i++) {
            if (plain[pass].indices[i] !== lit[pass].indices[i]) diagonals++;
          }
        }
      }
    }
    // Where light falls off across a quad, its diagonal may be the other one.
    expect(diagonals).toBeGreaterThan(0);
  });
});
