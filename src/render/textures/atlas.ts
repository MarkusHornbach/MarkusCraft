// Atlas builder: packs the painted tiles into one RGBA image with per-tile mip levels.
import { ATLAS_TILES_PER_ROW, TILE_SIZE } from '../../game/config';
import { ATLAS_SIZE, tileCell } from '../../world/meshing/atlasLayout';
import { paintAllTiles } from './tiles';

export interface AtlasLevel {
  size: number;
  data: Uint8Array;
}

export interface Atlas {
  /** The painted tiles, row 0 = top of each image (used for the hotbar icons). */
  tiles: Uint8ClampedArray[];
  /**
   * Mip chain from full size down to one pixel per tile. Each level is filtered per
   * tile, so colours never bleed from one tile into its neighbour. Rows are bottom-up
   * (row 0 is v = 0), the layout WebGL expects for unflipped data textures.
   */
  levels: AtlasLevel[];
}

/** Halves a square RGBA image with a 2×2 box filter, weighting colour by alpha. */
export function downsample(source: Uint8Array, size: number): Uint8Array<ArrayBuffer> {
  const half = size / 2;
  const out = new Uint8Array(half * half * 4);
  for (let y = 0; y < half; y++) {
    for (let x = 0; x < half; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let k = 0; k < 4; k++) {
        const i = ((y * 2 + (k >> 1)) * size + x * 2 + (k & 1)) * 4;
        const alpha = source[i + 3];
        r += source[i] * alpha;
        g += source[i + 1] * alpha;
        b += source[i + 2] * alpha;
        a += alpha;
      }
      const o = (y * half + x) * 4;
      if (a > 0) {
        out[o] = Math.round(r / a);
        out[o + 1] = Math.round(g / a);
        out[o + 2] = Math.round(b / a);
      } else {
        // Fully transparent: keep the plain average so the colour stays meaningful.
        const i = (y * 2 * size + x * 2) * 4;
        out[o] = source[i];
        out[o + 1] = source[i + 1];
        out[o + 2] = source[i + 2];
      }
      out[o + 3] = Math.round(a / 4);
    }
  }
  return out;
}

export function buildAtlas(): Atlas {
  const tiles = paintAllTiles();
  const base = new Uint8Array(ATLAS_SIZE * ATLAS_SIZE * 4);
  tiles.forEach((pixels, tile) => {
    const { col, row } = tileCell(tile);
    for (let py = 0; py < TILE_SIZE; py++) {
      // Flip vertically: image row 0 (top) becomes the highest atlas row of the cell.
      const ay = row * TILE_SIZE + (TILE_SIZE - 1 - py);
      const start = (ay * ATLAS_SIZE + col * TILE_SIZE) * 4;
      base.set(pixels.subarray(py * TILE_SIZE * 4, (py + 1) * TILE_SIZE * 4), start);
    }
  });

  // Tiles are aligned to powers of two, so a plain 2×2 box filter never mixes two tiles
  // as long as we stop at one pixel per tile.
  const levels: AtlasLevel[] = [{ size: ATLAS_SIZE, data: base }];
  let size = ATLAS_SIZE;
  let data: Uint8Array = base;
  while (size > ATLAS_TILES_PER_ROW) {
    data = downsample(data, size);
    size /= 2;
    levels.push({ size, data });
  }
  return { tiles, levels };
}
