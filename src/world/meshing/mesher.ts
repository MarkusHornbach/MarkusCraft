// Chunk mesher: block data in, typed arrays out. Pure, no Three.js, no allocations per block.
import {
  AO_LEVELS,
  CHUNK_SIZE,
  FACE_SHADE_BOTTOM,
  FACE_SHADE_EAST_WEST,
  FACE_SHADE_NORTH_SOUTH,
  FACE_SHADE_TOP,
  WATER_SURFACE_DROP,
  WORLD_HEIGHT,
} from '../../game/config';
import {
  BLOCK_CASTS_AO,
  BLOCK_MERGES_FACES,
  BLOCK_RENDER,
  BLOCK_TILE_BOTTOM,
  BLOCK_TILE_SIDE,
  BLOCK_TILE_TOP,
  Block,
  RENDER_CUTOUT,
  RENDER_NONE,
  RENDER_OPAQUE,
  RENDER_TRANSLUCENT,
} from '../blocks';
import { TILE_UVS } from './atlasLayout';

export interface MeshBuffers {
  /** xyz per vertex, in chunk-local block units. */
  positions: Float32Array;
  /** uv per vertex, in atlas space. */
  uvs: Float32Array;
  /** rgb per vertex: face shade × ambient occlusion. */
  colors: Float32Array;
  indices: Uint32Array;
}

export interface ChunkMeshData {
  opaque: MeshBuffers;
  cutout: MeshBuffers;
  translucent: MeshBuffers;
}

/** Block data of the chunk at offset (dx, dz) ∈ {-1, 0, 1}², or null if unavailable (air). */
export type NeighbourLookup = (dx: number, dz: number) => Uint8Array | null;

// Face order: +X (east), -X (west), +Y (top), -Y (bottom), +Z (south), -Z (north).
export const FACE_EAST = 0;
export const FACE_WEST = 1;
export const FACE_TOP = 2;
export const FACE_BOTTOM = 3;
export const FACE_SOUTH = 4;
export const FACE_NORTH = 5;

/** Outward normal of each face. */
export const FACE_NORMALS: readonly (readonly [number, number, number])[] = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
];

// Tangent axes per face with U × V = normal, so corners (0,0) (1,0) (1,1) (0,1) run
// counter-clockwise seen from outside. V is +Y on side faces so tiles stay upright.
const FACE_U: readonly (readonly [number, number, number])[] = [
  [0, 0, -1],
  [0, 0, 1],
  [1, 0, 0],
  [1, 0, 0],
  [1, 0, 0],
  [-1, 0, 0],
];
const FACE_V: readonly (readonly [number, number, number])[] = [
  [0, 1, 0],
  [0, 1, 0],
  [0, 0, -1],
  [0, 0, 1],
  [0, 1, 0],
  [0, 1, 0],
];
const CORNER_U = [0, 1, 1, 0];
const CORNER_V = [0, 0, 1, 1];

const FACE_SHADES = [
  FACE_SHADE_EAST_WEST,
  FACE_SHADE_EAST_WEST,
  FACE_SHADE_TOP,
  FACE_SHADE_BOTTOM,
  FACE_SHADE_NORTH_SOUTH,
  FACE_SHADE_NORTH_SOUTH,
];

// The chunk is copied into a padded volume (one cell of border on every side) so all
// neighbour reads are plain index offsets.
const PAD_X = CHUNK_SIZE + 2;
const PAD_Y = WORLD_HEIGHT + 2;
const PAD_LAYER = PAD_X * PAD_X;
const padded = new Uint8Array(PAD_LAYER * PAD_Y);

function padDelta(d: readonly [number, number, number]): number {
  return d[0] + d[2] * PAD_X + d[1] * PAD_LAYER;
}

/** Padded-index offset to the neighbour across each face. */
const FACE_DELTA = new Int32Array(6);
/** Corner positions: [face][corner] → x, y, z ∈ {0, 1}. */
const CORNER_POS = new Uint8Array(6 * 4 * 3);
/** AO sample offsets: [face][corner] → side 1, side 2, diagonal (padded-index deltas). */
const AO_DELTA = new Int32Array(6 * 4 * 3);

for (let f = 0; f < 6; f++) {
  const n = FACE_NORMALS[f];
  const u = FACE_U[f];
  const v = FACE_V[f];
  FACE_DELTA[f] = padDelta(n);
  for (let k = 0; k < 4; k++) {
    const cu = CORNER_U[k];
    const cv = CORNER_V[k];
    for (let axis = 0; axis < 3; axis++) {
      // Along the normal the face sits at 1 for positive normals; along a tangent the
      // corner coordinate runs 0→1 for positive axes and 1→0 for negative ones.
      let p = n[axis] > 0 ? 1 : 0;
      if (u[axis] !== 0) p = u[axis] > 0 ? cu : 1 - cu;
      if (v[axis] !== 0) p = v[axis] > 0 ? cv : 1 - cv;
      CORNER_POS[(f * 4 + k) * 3 + axis] = p;
    }
    const su = cu === 1 ? 1 : -1;
    const sv = cv === 1 ? 1 : -1;
    const side1: [number, number, number] = [n[0] + su * u[0], n[1] + su * u[1], n[2] + su * u[2]];
    const side2: [number, number, number] = [n[0] + sv * v[0], n[1] + sv * v[1], n[2] + sv * v[2]];
    const diagonal: [number, number, number] = [
      side1[0] + sv * v[0],
      side1[1] + sv * v[1],
      side1[2] + sv * v[2],
    ];
    AO_DELTA[(f * 4 + k) * 3] = padDelta(side1);
    AO_DELTA[(f * 4 + k) * 3 + 1] = padDelta(side2);
    AO_DELTA[(f * 4 + k) * 3 + 2] = padDelta(diagonal);
  }
}

/** Growable vertex/index storage, reused between calls to avoid garbage. */
class MeshBuilder {
  positions = new Float32Array(4096 * 3);
  uvs = new Float32Array(4096 * 2);
  colors = new Float32Array(4096 * 3);
  indices = new Uint32Array(6144);
  vertexCount = 0;
  indexCount = 0;

  reset(): void {
    this.vertexCount = 0;
    this.indexCount = 0;
  }

  /** Makes room for one more quad. */
  reserveQuad(): void {
    if (this.vertexCount + 4 > this.positions.length / 3) {
      const capacity = (this.positions.length / 3) * 2;
      this.positions = grow(this.positions, capacity * 3);
      this.uvs = grow(this.uvs, capacity * 2);
      this.colors = grow(this.colors, capacity * 3);
    }
    if (this.indexCount + 6 > this.indices.length) {
      const bigger = new Uint32Array(this.indices.length * 2);
      bigger.set(this.indices);
      this.indices = bigger;
    }
  }

  finish(): MeshBuffers {
    return {
      positions: this.positions.slice(0, this.vertexCount * 3),
      uvs: this.uvs.slice(0, this.vertexCount * 2),
      colors: this.colors.slice(0, this.vertexCount * 3),
      indices: this.indices.slice(0, this.indexCount),
    };
  }
}

function grow(source: Float32Array, length: number): Float32Array<ArrayBuffer> {
  const bigger = new Float32Array(length);
  bigger.set(source);
  return bigger;
}

const builders = [new MeshBuilder(), new MeshBuilder(), new MeshBuilder()];
const cornerBrightness = new Float32Array(4);

/** Fills the padded volume from the chunk and its eight neighbours. Returns the top used y. */
function fillPadded(center: Uint8Array, neighbour: NeighbourLookup): number {
  // Below the world lies bedrock (no bottom faces at y = 0); above it is air.
  padded.fill(Block.BEDROCK, 0, PAD_LAYER);
  padded.fill(Block.AIR, PAD_LAYER);
  let maxY = 0;
  for (let dz = -1; dz <= 1; dz++) {
    for (let dx = -1; dx <= 1; dx++) {
      const source = dx === 0 && dz === 0 ? center : neighbour(dx, dz);
      if (!source) continue;
      // Only the strip of the neighbour that touches the centre chunk is needed.
      const x0 = dx < 0 ? CHUNK_SIZE - 1 : 0;
      const z0 = dz < 0 ? CHUNK_SIZE - 1 : 0;
      const zEnd = dz === 0 ? CHUNK_SIZE : z0 + 1;
      const px = dx * CHUNK_SIZE + x0 + 1;
      for (let y = 0; y < WORLD_HEIGHT; y++) {
        for (let z = z0; z < zEnd; z++) {
          const from = x0 + z * CHUNK_SIZE + y * CHUNK_SIZE * CHUNK_SIZE;
          const pz = dz * CHUNK_SIZE + z + 1;
          const to = px + pz * PAD_X + (y + 1) * PAD_LAYER;
          if (dx === 0) {
            padded.set(source.subarray(from, from + CHUNK_SIZE), to);
          } else {
            padded[to] = source[from];
          }
        }
      }
    }
  }
  // Highest non-air layer of the centre chunk bounds the meshing loop.
  for (let i = center.length - 1; i >= 0; i--) {
    if (center[i] !== Block.AIR) {
      maxY = Math.floor(i / (CHUNK_SIZE * CHUNK_SIZE));
      break;
    }
  }
  return maxY;
}

/**
 * Builds the three render passes of a chunk. Only faces next to a non-occluding block
 * are emitted; vertex colours carry face shade × ambient occlusion.
 */
export function meshChunk(center: Uint8Array, neighbour: NeighbourLookup): ChunkMeshData {
  const maxY = fillPadded(center, neighbour);
  for (const builder of builders) builder.reset();

  for (let y = 0; y <= maxY; y++) {
    for (let z = 0; z < CHUNK_SIZE; z++) {
      let p = 1 + (z + 1) * PAD_X + (y + 1) * PAD_LAYER;
      for (let x = 0; x < CHUNK_SIZE; x++, p++) {
        const id = padded[p];
        const kind = BLOCK_RENDER[id];
        if (kind === RENDER_NONE) continue;
        const builder = builders[kind - 1];
        // Water that has no water above it gets a lowered surface.
        const topDrop =
          kind === RENDER_TRANSLUCENT && padded[p + PAD_LAYER] !== id ? WATER_SURFACE_DROP : 0;

        for (let f = 0; f < 6; f++) {
          const other = padded[p + FACE_DELTA[f]];
          if (kind === RENDER_TRANSLUCENT) {
            if (other !== Block.AIR) continue;
          } else {
            if (BLOCK_RENDER[other] === RENDER_OPAQUE) continue;
            // Leaves keep their inner faces (denser canopy); glass panes merge.
            if (other === id && BLOCK_MERGES_FACES[id] === 1) continue;
          }

          const tile =
            f === FACE_TOP
              ? BLOCK_TILE_TOP[id]
              : f === FACE_BOTTOM
                ? BLOCK_TILE_BOTTOM[id]
                : BLOCK_TILE_SIDE[id];
          const u0 = TILE_UVS[tile * 4];
          const v0 = TILE_UVS[tile * 4 + 1];
          const u1 = TILE_UVS[tile * 4 + 2];
          const v1 = TILE_UVS[tile * 4 + 3];

          builder.reserveQuad();
          const base = builder.vertexCount;
          const shade = FACE_SHADES[f];
          for (let k = 0; k < 4; k++) {
            const t = (f * 4 + k) * 3;
            const side1 = BLOCK_CASTS_AO[padded[p + AO_DELTA[t]]];
            const side2 = BLOCK_CASTS_AO[padded[p + AO_DELTA[t + 1]]];
            const diagonal = BLOCK_CASTS_AO[padded[p + AO_DELTA[t + 2]]];
            // Two occluding sides hide the diagonal: darkest level.
            const level = side1 === 1 && side2 === 1 ? 3 : side1 + side2 + diagonal;
            const brightness = shade * AO_LEVELS[level];
            cornerBrightness[k] = brightness;

            const vi = base + k;
            const cy = CORNER_POS[t + 1];
            builder.positions[vi * 3] = x + CORNER_POS[t];
            builder.positions[vi * 3 + 1] = y + cy - (cy === 1 ? topDrop : 0);
            builder.positions[vi * 3 + 2] = z + CORNER_POS[t + 2];
            builder.uvs[vi * 2] = CORNER_U[k] === 1 ? u1 : u0;
            builder.uvs[vi * 2 + 1] = CORNER_V[k] === 1 ? v1 : v0;
            builder.colors[vi * 3] = brightness;
            builder.colors[vi * 3 + 1] = brightness;
            builder.colors[vi * 3 + 2] = brightness;
          }

          // Split along the brighter diagonal; otherwise interpolation makes AO lopsided.
          const ii = builder.indexCount;
          const indices = builder.indices;
          if (
            cornerBrightness[1] + cornerBrightness[3] >
            cornerBrightness[0] + cornerBrightness[2]
          ) {
            indices[ii] = base + 1;
            indices[ii + 1] = base + 2;
            indices[ii + 2] = base + 3;
            indices[ii + 3] = base + 1;
            indices[ii + 4] = base + 3;
            indices[ii + 5] = base;
          } else {
            indices[ii] = base;
            indices[ii + 1] = base + 1;
            indices[ii + 2] = base + 2;
            indices[ii + 3] = base;
            indices[ii + 4] = base + 2;
            indices[ii + 5] = base + 3;
          }
          builder.vertexCount += 4;
          builder.indexCount += 6;
        }
      }
    }
  }

  return {
    opaque: builders[RENDER_OPAQUE - 1].finish(),
    cutout: builders[RENDER_CUTOUT - 1].finish(),
    translucent: builders[RENDER_TRANSLUCENT - 1].finish(),
  };
}
