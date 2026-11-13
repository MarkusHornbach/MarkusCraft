// Atlas layout: where each tile sits in the texture atlas, as pure arithmetic.
import { ATLAS_TILES_PER_ROW, TILE_SIZE } from '../../game/config';
import { TILE_COUNT } from '../blocks';

export const ATLAS_SIZE = ATLAS_TILES_PER_ROW * TILE_SIZE;

/**
 * UVs are pulled inwards by this fraction of a texel so that interpolation rounding at
 * quad edges can never sample the neighbouring tile.
 */
export const UV_INSET_TEXELS = 1 / 64;

export interface UvRect {
  u0: number;
  v0: number;
  u1: number;
  v1: number;
}

/** Grid cell of a tile; row 0 is the bottom row of the atlas (v = 0). */
export function tileCell(tile: number): { col: number; row: number } {
  if (!Number.isInteger(tile) || tile < 0 || tile >= ATLAS_TILES_PER_ROW * ATLAS_TILES_PER_ROW) {
    throw new Error(`Tile ${tile} does not fit into the atlas`);
  }
  return { col: tile % ATLAS_TILES_PER_ROW, row: Math.floor(tile / ATLAS_TILES_PER_ROW) };
}

/** Full rectangle of a tile in UV space, without inset. */
export function tileRect(tile: number): UvRect {
  const { col, row } = tileCell(tile);
  const step = 1 / ATLAS_TILES_PER_ROW;
  return { u0: col * step, v0: row * step, u1: (col + 1) * step, v1: (row + 1) * step };
}

/** Inset rectangle used for mesh UVs. */
export function tileUv(tile: number): UvRect {
  const rect = tileRect(tile);
  const inset = UV_INSET_TEXELS / ATLAS_SIZE;
  return {
    u0: rect.u0 + inset,
    v0: rect.v0 + inset,
    u1: rect.u1 - inset,
    v1: rect.v1 - inset,
  };
}

/** Flat lookup for the mesher: [u0, v0, u1, v1] per tile id. */
export const TILE_UVS = new Float32Array(TILE_COUNT * 4);
for (let tile = 0; tile < TILE_COUNT; tile++) {
  const uv = tileUv(tile);
  TILE_UVS.set([uv.u0, uv.v0, uv.u1, uv.v1], tile * 4);
}
