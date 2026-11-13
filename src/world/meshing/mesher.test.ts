import { describe, expect, it } from 'vitest';
import { CHUNK_SIZE, CHUNK_VOLUME, WORLD_HEIGHT } from '../../game/config';
import { expectFasterThan } from '../../testing/timing';
import { BLOCKS, Block, Tile } from '../blocks';
import { blockIndex } from '../chunk';
import { generateChunk } from '../generation/terrain';
import { tileRect } from './atlasLayout';
import { FACE_NORMALS, type ChunkMeshData, type MeshBuffers, meshChunk } from './mesher';

type Cell = [number, number, number, number];

function chunkOf(cells: Cell[]): Uint8Array {
  const blocks = new Uint8Array(CHUNK_VOLUME);
  for (const [x, y, z, id] of cells) blocks[blockIndex(x, y, z)] = id;
  return blocks;
}

function mesh(cells: Cell[], neighbours: Record<string, Uint8Array> = {}): ChunkMeshData {
  return meshChunk(chunkOf(cells), (dx, dz) => neighbours[`${dx},${dz}`] ?? null);
}

function faces(buffers: MeshBuffers): number {
  return buffers.indices.length / 6;
}

function totalFaces(data: ChunkMeshData): number {
  return faces(data.opaque) + faces(data.cutout) + faces(data.translucent);
}

interface Quad {
  normal: [number, number, number];
  corners: { pos: [number, number, number]; brightness: number; uv: [number, number] }[];
}

/** Reconstructs quads (4 vertices each) and derives the normal from the triangle winding. */
function quads(buffers: MeshBuffers): Quad[] {
  const result: Quad[] = [];
  for (let q = 0; q < buffers.positions.length / 12; q++) {
    const corners = [0, 1, 2, 3].map((k) => {
      const v = q * 4 + k;
      return {
        pos: [...buffers.positions.subarray(v * 3, v * 3 + 3)] as [number, number, number],
        brightness: buffers.colors[v * 3],
        uv: [...buffers.uvs.subarray(v * 2, v * 2 + 2)] as [number, number],
      };
    });
    const [a, b, c] = [0, 1, 2].map((k) => {
      const v = buffers.indices[q * 6 + k];
      return buffers.positions.subarray(v * 3, v * 3 + 3);
    });
    const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const n = [
      e1[1] * e2[2] - e1[2] * e2[1],
      e1[2] * e2[0] - e1[0] * e2[2],
      e1[0] * e2[1] - e1[1] * e2[0],
    ];
    const length = Math.hypot(n[0], n[1], n[2]);
    result.push({
      normal: [Math.round(n[0] / length), Math.round(n[1] / length), Math.round(n[2] / length)],
      corners,
    });
  }
  return result;
}

function quadWithNormal(list: Quad[], normal: readonly number[]): Quad[] {
  return list.filter((q) => q.normal.every((v, i) => v === normal[i]));
}

describe('meshChunk geometry', () => {
  it('gives a single block 6 faces, 24 vertices, 36 indices (AC6.1)', () => {
    const data = mesh([[5, 60, 5, Block.STONE]]);
    expect(faces(data.opaque)).toBe(6);
    expect(data.opaque.positions.length / 3).toBe(24);
    expect(data.opaque.uvs.length / 2).toBe(24);
    expect(data.opaque.colors.length / 3).toBe(24);
    expect(data.opaque.indices.length).toBe(36);
    expect(faces(data.cutout)).toBe(0);
    expect(faces(data.translucent)).toBe(0);
  });

  it('gives two adjacent opaque blocks 10 faces (AC6.2)', () => {
    for (const second of [
      [6, 60, 5],
      [5, 61, 5],
      [5, 60, 6],
    ]) {
      const data = mesh([
        [5, 60, 5, Block.STONE],
        [second[0], second[1], second[2], Block.DIRT],
      ]);
      expect(faces(data.opaque)).toBe(10);
    }
  });

  it('emits nothing inside solid volumes (AC6.2)', () => {
    const solid = new Uint8Array(CHUNK_VOLUME).fill(Block.STONE);
    const neighbours: Record<string, Uint8Array> = {};
    for (let dz = -1; dz <= 1; dz++)
      for (let dx = -1; dx <= 1; dx++) neighbours[`${dx},${dz}`] = solid;
    const data = meshChunk(solid, (dx, dz) => neighbours[`${dx},${dz}`]);
    // Only the top of the world is open (air above); bedrock below hides the bottom.
    expect(totalFaces(data)).toBe(CHUNK_SIZE * CHUNK_SIZE);
    for (let v = 0; v < data.opaque.positions.length / 3; v++) {
      expect(data.opaque.positions[v * 3 + 1]).toBe(WORLD_HEIGHT);
    }
    // A solid 16³ region buried in the middle adds no faces at all.
    const air = new Uint8Array(CHUNK_VOLUME);
    const buried = new Uint8Array(CHUNK_VOLUME);
    for (let y = 40; y < 56; y++) buried.fill(Block.STONE, y * 256, (y + 1) * 256);
    const data2 = meshChunk(buried, (dx, dz) => (dx === 0 && dz === 0 ? air : buried));
    expect(totalFaces(data2)).toBe(2 * CHUNK_SIZE * CHUNK_SIZE);
  });

  it('has no bottom face on the bedrock layer', () => {
    const data = mesh([[5, 0, 5, Block.BEDROCK]]);
    expect(faces(data.opaque)).toBe(5);
  });

  it('culls border faces using the neighbour chunk data (AC6.3)', () => {
    const cell: Cell[] = [[15, 60, 8, Block.STONE]];
    expect(faces(mesh(cell).opaque)).toBe(6);
    const east = chunkOf([[0, 60, 8, Block.STONE]]);
    expect(faces(mesh(cell, { '1,0': east }).opaque)).toBe(5);
    // The same block in a different neighbour does not cull anything.
    expect(faces(mesh(cell, { '-1,0': east }).opaque)).toBe(6);
    expect(faces(mesh(cell, { '0,1': east }).opaque)).toBe(6);

    const corner: Cell[] = [[0, 60, 0, Block.STONE]];
    const west = chunkOf([[15, 60, 0, Block.STONE]]);
    const north = chunkOf([[0, 60, 15, Block.STONE]]);
    expect(faces(mesh(corner, { '-1,0': west, '0,-1': north }).opaque)).toBe(4);
    const south = chunkOf([[4, 60, 0, Block.STONE]]);
    expect(faces(mesh([[4, 60, 15, Block.STONE]], { '0,1': south }).opaque)).toBe(5);
  });
});

describe('meshChunk pass routing (AC6.4)', () => {
  it('routes blocks into their passes', () => {
    const data = mesh([
      [2, 60, 2, Block.STONE],
      [5, 60, 5, Block.LEAVES],
      [8, 60, 8, Block.GLASS],
      [11, 60, 11, Block.WATER],
    ]);
    expect(faces(data.opaque)).toBe(6);
    expect(faces(data.cutout)).toBe(12);
    expect(faces(data.translucent)).toBe(6);
  });

  it('emits no water face against water or stone, but stone against water', () => {
    const waterPair = mesh([
      [5, 60, 5, Block.WATER],
      [6, 60, 5, Block.WATER],
    ]);
    expect(faces(waterPair.translucent)).toBe(10);

    const waterStone = mesh([
      [5, 60, 5, Block.WATER],
      [6, 60, 5, Block.STONE],
    ]);
    expect(faces(waterStone.translucent)).toBe(5);
    expect(faces(waterStone.opaque)).toBe(6);
  });

  it('does not let cutout blocks occlude, and merges only glass neighbours', () => {
    const stoneLeaves = mesh([
      [5, 60, 5, Block.STONE],
      [6, 60, 5, Block.LEAVES],
    ]);
    expect(faces(stoneLeaves.opaque)).toBe(6);
    expect(faces(stoneLeaves.cutout)).toBe(5);

    const glassPair = mesh([
      [5, 60, 5, Block.GLASS],
      [6, 60, 5, Block.GLASS],
    ]);
    expect(faces(glassPair.cutout)).toBe(10);

    const leafPair = mesh([
      [5, 60, 5, Block.LEAVES],
      [6, 60, 5, Block.LEAVES],
    ]);
    expect(faces(leafPair.cutout)).toBe(12);

    const glassLeaves = mesh([
      [5, 60, 5, Block.GLASS],
      [6, 60, 5, Block.LEAVES],
    ]);
    expect(faces(glassLeaves.cutout)).toBe(12);
  });

  it('lowers the water surface only when there is no water above', () => {
    const data = mesh([
      [5, 60, 5, Block.WATER],
      [5, 61, 5, Block.WATER],
    ]);
    const ys = new Set<number>();
    for (let v = 0; v < data.translucent.positions.length / 3; v++) {
      ys.add(data.translucent.positions[v * 3 + 1]);
    }
    expect([...ys].sort()).toEqual([60, 61, 61.875]);
  });
});

describe('meshChunk shading (AC6.5)', () => {
  it('applies the face shades to an isolated block without AO', () => {
    const list = quads(mesh([[5, 60, 5, Block.STONE]]).opaque);
    const expected: [readonly number[], number][] = [
      [[0, 1, 0], 1.0],
      [[0, -1, 0], 0.5],
      [[1, 0, 0], 0.65],
      [[-1, 0, 0], 0.65],
      [[0, 0, 1], 0.8],
      [[0, 0, -1], 0.8],
    ];
    for (const [normal, shade] of expected) {
      const found = quadWithNormal(list, normal);
      expect(found.length).toBe(1);
      for (const corner of found[0].corners) expect(corner.brightness).toBeCloseTo(shade, 5);
    }
  });

  it('winds every face outward', () => {
    const list = quads(mesh([[5, 60, 5, Block.STONE]]).opaque);
    for (const normal of FACE_NORMALS) {
      const [quad] = quadWithNormal(list, normal);
      expect(quad).toBeDefined();
      // The quad lies on the side of the block its normal points to.
      const axis = normal.findIndex((v) => v !== 0);
      const base = [5, 60, 5][axis];
      for (const corner of quad.corners) {
        expect(corner.pos[axis]).toBe(normal[axis] > 0 ? base + 1 : base);
      }
    }
  });

  it('darkens floor vertices around the base of a block', () => {
    const cells: Cell[] = [];
    for (let z = 3; z <= 7; z++) for (let x = 3; x <= 7; x++) cells.push([x, 60, z, Block.STONE]);
    cells.push([5, 61, 5, Block.STONE]);
    const tops = quadWithNormal(quads(mesh(cells).opaque), [0, 1, 0]).filter((q) =>
      q.corners.every((c) => c.pos[1] === 61),
    );
    expect(tops.length).toBe(24);
    const brightnessAt = (qx: number, qz: number, vx: number, vz: number): number => {
      const quad = tops.find(
        (q) =>
          Math.min(...q.corners.map((c) => c.pos[0])) === qx &&
          Math.min(...q.corners.map((c) => c.pos[2])) === qz,
      );
      const corner = quad?.corners.find((c) => c.pos[0] === vx && c.pos[2] === vz);
      if (!corner) throw new Error('corner not found');
      return corner.brightness;
    };
    // Floor quad directly east of the block (x = 6, z = 5): the two vertices touching
    // the block have one occluding side (level 1), the far ones none.
    expect(brightnessAt(6, 5, 6, 5)).toBeCloseTo(0.8, 5);
    expect(brightnessAt(6, 5, 6, 6)).toBeCloseTo(0.8, 5);
    expect(brightnessAt(6, 5, 7, 5)).toBeCloseTo(1.0, 5);
    expect(brightnessAt(6, 5, 7, 6)).toBeCloseTo(1.0, 5);
    // Diagonal floor quad (x = 6, z = 6): only the shared corner is darkened (level 1).
    expect(brightnessAt(6, 6, 6, 6)).toBeCloseTo(0.8, 5);
    expect(brightnessAt(6, 6, 7, 7)).toBeCloseTo(1.0, 5);
    // Far away from the block nothing is darkened.
    expect(brightnessAt(3, 3, 3, 3)).toBeCloseTo(1.0, 5);
  });

  it('uses the darkest level in an inner corner and flips the diagonal', () => {
    // Floor with an L-shaped wall: the floor vertex in the inner corner has two sides.
    const cells: Cell[] = [];
    for (let z = 4; z <= 6; z++) for (let x = 4; x <= 6; x++) cells.push([x, 60, z, Block.STONE]);
    cells.push([4, 61, 5, Block.STONE], [5, 61, 4, Block.STONE]);
    const data = mesh(cells).opaque;
    const list = quads(data);
    const index = list.findIndex(
      (q) =>
        q.normal[1] === 1 &&
        q.corners.every((c) => c.pos[1] === 61) &&
        Math.min(...q.corners.map((c) => c.pos[0])) === 5 &&
        Math.min(...q.corners.map((c) => c.pos[2])) === 5,
    );
    const quad = list[index];
    const inner = quad.corners.findIndex((c) => c.pos[0] === 5 && c.pos[2] === 5);
    expect(quad.corners[inner].brightness).toBeCloseTo(0.5, 5);
    // The diagonal must not start at the dark corner: it connects the brighter pair.
    const tri = [...data.indices.subarray(index * 6, index * 6 + 6)].map((i) => i - index * 4);
    const shared = tri.slice(0, 3).filter((i) => tri.slice(3).includes(i));
    expect(shared).not.toContain(inner);
    expect(shared).not.toContain((inner + 2) % 4);
  });

  it('lets leaves cast AO but not glass or water', () => {
    const floor: Cell[] = [];
    for (let z = 4; z <= 6; z++) for (let x = 4; x <= 6; x++) floor.push([x, 60, z, Block.STONE]);
    const minBrightness = (id: number): number => {
      const tops = quadWithNormal(quads(mesh([...floor, [5, 61, 5, id]]).opaque), [0, 1, 0]);
      return Math.min(...tops.flatMap((q) => q.corners.map((c) => c.brightness)));
    };
    expect(minBrightness(Block.LEAVES)).toBeCloseTo(0.8, 5);
    expect(minBrightness(Block.GLASS)).toBeCloseTo(1.0, 5);
    expect(minBrightness(Block.WATER)).toBeCloseTo(1.0, 5);
  });
});

describe('meshChunk UVs (AC6.6)', () => {
  it('keeps all UVs inside the tile assigned to the face', () => {
    for (const def of BLOCKS) {
      if (!def.tiles) continue;
      const data = mesh([[5, 60, 5, def.id]]);
      const buffers = [data.opaque, data.cutout, data.translucent].find((b) => faces(b) > 0);
      if (!buffers) throw new Error(`no mesh for ${def.name}`);
      for (const quad of quads(buffers)) {
        const tile =
          quad.normal[1] === 1
            ? def.tiles.top
            : quad.normal[1] === -1
              ? def.tiles.bottom
              : def.tiles.side;
        const rect = tileRect(tile);
        const us = quad.corners.map((c) => c.uv[0]);
        const vs = quad.corners.map((c) => c.uv[1]);
        for (const u of us) {
          expect(u).toBeGreaterThan(rect.u0);
          expect(u).toBeLessThan(rect.u1);
        }
        for (const v of vs) {
          expect(v).toBeGreaterThan(rect.v0);
          expect(v).toBeLessThan(rect.v1);
        }
        // The quad shows (nearly) the whole tile.
        expect(Math.max(...us) - Math.min(...us)).toBeGreaterThan((rect.u1 - rect.u0) * 0.99);
        expect(Math.max(...vs) - Math.min(...vs)).toBeGreaterThan((rect.v1 - rect.v0) * 0.99);
      }
    }
  });

  it('keeps side tiles upright: v grows with height', () => {
    const list = quads(mesh([[5, 60, 5, Block.GRASS]]).opaque);
    for (const quad of list) {
      if (quad.normal[1] !== 0) continue;
      const low = quad.corners.filter((c) => c.pos[1] === 60);
      const high = quad.corners.filter((c) => c.pos[1] === 61);
      expect(Math.max(...low.map((c) => c.uv[1]))).toBeLessThan(
        Math.min(...high.map((c) => c.uv[1])),
      );
      const rect = tileRect(Tile.GRASS_SIDE);
      expect(quad.corners[0].uv[0]).toBeGreaterThan(rect.u0);
    }
  });
});

describe('meshChunk performance (AC6.7)', () => {
  it('meshes a generated terrain chunk in under 20 ms on average', () => {
    const seed = 1337;
    const cache = new Map<string, Uint8Array>();
    const get = (cx: number, cz: number): Uint8Array => {
      const key = `${cx},${cz}`;
      let blocks = cache.get(key);
      if (!blocks) {
        blocks = generateChunk(seed, cx, cz);
        cache.set(key, blocks);
      }
      return blocks;
    };
    for (let cz = -1; cz <= 4; cz++) for (let cx = -1; cx <= 4; cx++) get(cx, cz);
    meshChunk(get(0, 0), (dx, dz) => get(dx, dz)); // warm-up
    // Best of several rounds: other test files run in parallel and disturb single timings.
    let average = Infinity;
    let triangles = 0;
    for (let round = 0; round < 5; round++) {
      const start = performance.now();
      let count = 0;
      for (let cz = 0; cz <= 3; cz++) {
        for (let cx = 0; cx <= 3; cx++) {
          const data = meshChunk(get(cx, cz), (dx, dz) => get(cx + dx, cz + dz));
          triangles += (data.opaque.indices.length + data.translucent.indices.length) / 3;
          count++;
        }
      }
      average = Math.min(average, (performance.now() - start) / count);
    }
    expect(triangles).toBeGreaterThan(0);
    expectFasterThan(average, 20);
  });

  it('produces no seams between generated neighbours', () => {
    // A face on a chunk border exists exactly when the neighbour cell does not occlude.
    const a = generateChunk(1337, 0, 0);
    const b = generateChunk(1337, 1, 0);
    const data = meshChunk(a, (dx, dz) => (dx === 1 && dz === 0 ? b : null));
    const eastFaces = quads(data.opaque).filter(
      (q) => q.normal[0] === 1 && q.corners.every((c) => c.pos[0] === CHUNK_SIZE),
    ).length;
    let expected = 0;
    for (let y = 0; y < WORLD_HEIGHT; y++) {
      for (let z = 0; z < CHUNK_SIZE; z++) {
        const own = BLOCKS[a[blockIndex(15, y, z)]];
        const other = BLOCKS[b[blockIndex(0, y, z)]];
        if (own.render === 'opaque' && other.render !== 'opaque') expected++;
      }
    }
    expect(eastFaces).toBe(expected);
  });
});
