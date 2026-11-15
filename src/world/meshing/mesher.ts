// Chunk mesher: block data in, typed arrays out. Pure, no Three.js, no allocations per block.
import {
  AO_LEVELS,
  CHUNK_SIZE,
  FACE_SHADE_BOTTOM,
  FACE_SHADE_EAST_WEST,
  FACE_SHADE_NORTH_SOUTH,
  FACE_SHADE_TOP,
  LIGHT_MAX,
  WATER_SURFACE_DROP,
  WORLD_HEIGHT,
} from '../../game/config';
import {
  BLOCK_CASTS_AO,
  BLOCK_MERGES_FACES,
  BLOCK_OPACITY,
  BLOCK_RENDER,
  BLOCK_SHAPE,
  BLOCK_TILE_BOTTOM,
  BLOCK_TILE_SIDE,
  BLOCK_TILE_TOP,
  Block,
  RENDER_CUTOUT,
  RENDER_NONE,
  RENDER_OPAQUE,
  RENDER_TRANSLUCENT,
  SHAPE_CUBE,
  SHAPE_TORCH,
} from '../blocks';
import { LIGHT_OPEN_SKY } from '../light/lightRules';
import { TILE_UVS } from './atlasLayout';

export interface MeshBuffers {
  /** xyz per vertex, in chunk-local block units. */
  positions: Float32Array;
  /** uv per vertex, in atlas space. */
  uvs: Float32Array;
  /**
   * rgb per vertex. Red: face shade × ambient occlusion. Green: sky light, blue: block
   * light, both as level ÷ 15 and averaged over the cells that touch the vertex.
   */
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
/** Light of the same cells (see `packLight`). */
const paddedLight = new Uint8Array(PAD_LAYER * PAD_Y);
/** 1 ÷ (cells × 15) for the average of one to four light levels. */
const LIGHT_SCALE = [
  0,
  1 / LIGHT_MAX,
  1 / (2 * LIGHT_MAX),
  1 / (3 * LIGHT_MAX),
  1 / (4 * LIGHT_MAX),
];

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

/**
 * The torch: a stick with a flame on top, as boxes in sixteenths of a block. Each box
 * lists its faces with the part of the tile they show (u0, v0, u1, v1 as fractions of the
 * tile, v from its bottom). The stick's top lies under the flame and its bottom on the
 * block below, so neither is drawn: ten quads.
 */
const TORCH_BOXES: readonly {
  min: readonly [number, number, number];
  max: readonly [number, number, number];
  faces: readonly (readonly [number, number, number, number] | null)[];
}[] = (() => {
  const stickSide = [7 / 16, 0, 9 / 16, 10 / 16] as const;
  const flameSide = [6 / 16, 10 / 16, 10 / 16, 14 / 16] as const;
  const flameTop = [6 / 16, 12 / 16, 10 / 16, 1] as const;
  return [
    {
      min: [7, 0, 7],
      max: [9, 10, 9],
      faces: [stickSide, stickSide, null, null, stickSide, stickSide],
    },
    {
      min: [6, 10, 6],
      max: [10, 14, 10],
      faces: [flameSide, flameSide, flameTop, flameSide, flameSide, flameSide],
    },
  ];
})();

/** Quads of the torch: per quad 4 corners × xyz (block units), 4 × uv (tile fractions), face. */
const TORCH_QUADS: { positions: Float32Array; uvs: Float32Array; face: number }[] = [];
for (const box of TORCH_BOXES) {
  for (let f = 0; f < 6; f++) {
    const uv = box.faces[f];
    if (!uv) continue;
    const positions = new Float32Array(12);
    const uvs = new Float32Array(8);
    for (let k = 0; k < 4; k++) {
      for (let axis = 0; axis < 3; axis++) {
        const t = CORNER_POS[(f * 4 + k) * 3 + axis];
        positions[k * 3 + axis] = (box.min[axis] + t * (box.max[axis] - box.min[axis])) / 16;
      }
      uvs[k * 2] = CORNER_U[k] === 1 ? uv[2] : uv[0];
      uvs[k * 2 + 1] = CORNER_V[k] === 1 ? uv[3] : uv[1];
    }
    TORCH_QUADS.push({ positions, uvs, face: f });
  }
}

/**
 * Emits the torch in cell (x, y, z). It casts and receives no ambient occlusion, and all
 * its vertices carry the light of its own cell: it is too thin to show a gradient.
 */
function emitTorch(
  builder: MeshBuilder,
  tile: number,
  x: number,
  y: number,
  z: number,
  packed: number,
): void {
  const u0 = TILE_UVS[tile * 4];
  const v0 = TILE_UVS[tile * 4 + 1];
  const du = TILE_UVS[tile * 4 + 2] - u0;
  const dv = TILE_UVS[tile * 4 + 3] - v0;
  const sky = (packed >> 4) / LIGHT_MAX;
  const glow = (packed & 15) / LIGHT_MAX;
  for (const quad of TORCH_QUADS) {
    builder.reserveQuad();
    const base = builder.vertexCount;
    const shade = FACE_SHADES[quad.face];
    for (let k = 0; k < 4; k++) {
      const vi = base + k;
      builder.positions[vi * 3] = x + quad.positions[k * 3];
      builder.positions[vi * 3 + 1] = y + quad.positions[k * 3 + 1];
      builder.positions[vi * 3 + 2] = z + quad.positions[k * 3 + 2];
      builder.uvs[vi * 2] = u0 + quad.uvs[k * 2] * du;
      builder.uvs[vi * 2 + 1] = v0 + quad.uvs[k * 2 + 1] * dv;
      builder.colors[vi * 3] = shade;
      builder.colors[vi * 3 + 1] = sky;
      builder.colors[vi * 3 + 2] = glow;
    }
    const ii = builder.indexCount;
    builder.indices[ii] = base;
    builder.indices[ii + 1] = base + 1;
    builder.indices[ii + 2] = base + 2;
    builder.indices[ii + 3] = base;
    builder.indices[ii + 4] = base + 2;
    builder.indices[ii + 5] = base + 3;
    builder.vertexCount += 4;
    builder.indexCount += 6;
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

const OPEN_SKY = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE * WORLD_HEIGHT).fill(LIGHT_OPEN_SKY);
/**
 * Keeps ambient occlusion in the choice of a quad's diagonal where there is no light at
 * all; small enough for the light to decide wherever there is some.
 */
const LIGHT_FLOOR = 1 / 16;

const builders = [new MeshBuilder(), new MeshBuilder(), new MeshBuilder()];
const cornerBrightness = new Float32Array(4);

/** Copies a chunk and the touching strips of its eight neighbours into a padded volume. */
function fillPadded(
  target: Uint8Array,
  center: Uint8Array,
  neighbour: NeighbourLookup,
  below: number,
  missing: number,
): void {
  target.fill(below, 0, PAD_LAYER);
  target.fill(missing, PAD_LAYER);
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
            target.set(source.subarray(from, from + CHUNK_SIZE), to);
          } else {
            target[to] = source[from];
          }
        }
      }
    }
  }
}

/** The highest layer of a chunk that is not all air: it bounds the meshing loop. */
function topLayer(center: Uint8Array): number {
  for (let i = center.length - 1; i >= 0; i--) {
    if (center[i] !== Block.AIR) return Math.floor(i / (CHUNK_SIZE * CHUNK_SIZE));
  }
  return 0;
}

/**
 * Builds the three render passes of a chunk. Only faces next to a non-occluding block
 * are emitted; vertex colours carry face shade × ambient occlusion and the light.
 *
 * `light` gives the light of the same chunks (the centre chunk's for 0, 0). Without it
 * everything counts as lit by the open sky: that is the mesher as it was before light,
 * kept for tests and dev tools that compare with it.
 */
export function meshChunk(
  center: Uint8Array,
  neighbour: NeighbourLookup,
  light?: NeighbourLookup,
): ChunkMeshData {
  // Below the world lies bedrock (no bottom faces at y = 0); above it is air.
  fillPadded(padded, center, neighbour, Block.BEDROCK, Block.AIR);
  const lit = light !== undefined;
  if (light) fillPadded(paddedLight, light(0, 0) ?? OPEN_SKY, light, 0, LIGHT_OPEN_SKY);
  const maxY = topLayer(center);
  for (const builder of builders) builder.reset();

  for (let y = 0; y <= maxY; y++) {
    for (let z = 0; z < CHUNK_SIZE; z++) {
      let p = 1 + (z + 1) * PAD_X + (y + 1) * PAD_LAYER;
      for (let x = 0; x < CHUNK_SIZE; x++, p++) {
        const id = padded[p];
        const kind = BLOCK_RENDER[id];
        if (kind === RENDER_NONE) continue;
        const builder = builders[kind - 1];
        if (BLOCK_SHAPE[id] === SHAPE_TORCH) {
          emitTorch(builder, BLOCK_TILE_SIDE[id], x, y, z, lit ? paddedLight[p] : LIGHT_OPEN_SKY);
          continue;
        }
        // Water that has no water above it gets a lowered surface.
        const topDrop =
          kind === RENDER_TRANSLUCENT && padded[p + PAD_LAYER] !== id ? WATER_SURFACE_DROP : 0;

        for (let f = 0; f < 6; f++) {
          const front = p + FACE_DELTA[f];
          const other = padded[front];
          if (kind === RENDER_TRANSLUCENT) {
            // Water shows towards air, and towards a torch standing in it: the torch's
            // cell holds no water, and without these faces it would be a dark hole.
            if (other !== Block.AIR && BLOCK_SHAPE[other] === SHAPE_CUBE) continue;
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
          const frontLight = lit ? paddedLight[front] : 0;
          const frontSky = frontLight >> 4;
          const frontGlow = frontLight & 15;
          for (let k = 0; k < 4; k++) {
            const t = (f * 4 + k) * 3;
            // The three cells next to the corner, in front of the face: read once, used
            // for ambient occlusion and for light.
            const i1 = p + AO_DELTA[t];
            const i2 = p + AO_DELTA[t + 1];
            const i3 = p + AO_DELTA[t + 2];
            const b1 = padded[i1];
            const b2 = padded[i2];
            const b3 = padded[i3];
            const side1 = BLOCK_CASTS_AO[b1];
            const side2 = BLOCK_CASTS_AO[b2];
            const diagonal = BLOCK_CASTS_AO[b3];
            // Two occluding sides hide the diagonal: darkest level.
            const level = side1 === 1 && side2 === 1 ? 3 : side1 + side2 + diagonal;
            const brightness = shade * AO_LEVELS[level];
            let sky = 1;
            let glow = 0;
            if (lit) {
              // Smooth light: the average over the cells in front of the face that touch
              // the vertex. Opaque cells hold no light and are left out, and so is the
              // diagonal cell when both side cells are opaque: nothing connects it.
              let skySum = frontSky;
              let glowSum = frontGlow;
              let cells = 1;
              const open1 = BLOCK_OPACITY[b1] !== LIGHT_MAX;
              const open2 = BLOCK_OPACITY[b2] !== LIGHT_MAX;
              if (open1) {
                const packed = paddedLight[i1];
                skySum += packed >> 4;
                glowSum += packed & 15;
                cells++;
              }
              if (open2) {
                const packed = paddedLight[i2];
                skySum += packed >> 4;
                glowSum += packed & 15;
                cells++;
              }
              if ((open1 || open2) && BLOCK_OPACITY[b3] !== LIGHT_MAX) {
                const packed = paddedLight[i3];
                skySum += packed >> 4;
                glowSum += packed & 15;
                cells++;
              }
              sky = skySum * LIGHT_SCALE[cells];
              glow = glowSum * LIGHT_SCALE[cells];
            }
            // What decides the diagonal below: how bright the corner will look, roughly.
            cornerBrightness[k] = brightness * (LIGHT_FLOOR + (sky > glow ? sky : glow));

            const vi = base + k;
            const cy = CORNER_POS[t + 1];
            builder.positions[vi * 3] = x + CORNER_POS[t];
            builder.positions[vi * 3 + 1] = y + cy - (cy === 1 ? topDrop : 0);
            builder.positions[vi * 3 + 2] = z + CORNER_POS[t + 2];
            builder.uvs[vi * 2] = CORNER_U[k] === 1 ? u1 : u0;
            builder.uvs[vi * 2 + 1] = CORNER_V[k] === 1 ? v1 : v0;
            builder.colors[vi * 3] = brightness;
            builder.colors[vi * 3 + 1] = sky;
            builder.colors[vi * 3 + 2] = glow;
          }

          // Split along the brighter diagonal; otherwise interpolation makes ambient
          // occlusion and light lopsided.
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
