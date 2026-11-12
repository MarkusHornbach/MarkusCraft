import { describe, expect, it } from 'vitest';
import { ATLAS_TILES_PER_ROW, TILE_SIZE } from '../../game/config';
import { mulberry32 } from '../../util/rng';
import { TILE_COUNT, TILE_NAMES, Tile } from '../../world/blocks';
import { ATLAS_SIZE, TILE_UVS, tileCell, tileRect, tileUv } from '../../world/meshing/atlasLayout';
import { buildAtlas, downsample } from './atlas';
import { TILE_PAINTERS, paintAllTiles, paintTile } from './tiles';

const PIXELS = TILE_SIZE * TILE_SIZE;
const CUTOUT_TILES: number[] = [Tile.LEAVES, Tile.GLASS];

function alphas(px: Uint8ClampedArray): number[] {
  return Array.from({ length: PIXELS }, (_, i) => px[i * 4 + 3]);
}

function mean(px: Uint8ClampedArray): { r: number; g: number; b: number } {
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  for (let i = 0; i < PIXELS; i++) {
    if (px[i * 4 + 3] === 0) continue;
    r += px[i * 4];
    g += px[i * 4 + 1];
    b += px[i * 4 + 2];
    n++;
  }
  return { r: r / n, g: g / n, b: b / n };
}

function distinctColors(px: Uint8ClampedArray): number {
  const set = new Set<number>();
  for (let i = 0; i < PIXELS; i++) {
    set.add(
      ((px[i * 4] << 24) | (px[i * 4 + 1] << 16) | (px[i * 4 + 2] << 8) | px[i * 4 + 3]) >>> 0,
    );
  }
  return set.size;
}

describe('tile painters', () => {
  const tiles = paintAllTiles();

  it('exist for every tile and return 32×32×4 bytes (AC5.1, AC3.3)', () => {
    expect(TILE_PAINTERS.length).toBe(TILE_COUNT);
    expect(tiles.length).toBe(TILE_COUNT);
    for (let tile = 0; tile < TILE_COUNT; tile++) {
      expect(typeof TILE_PAINTERS[tile]).toBe('function');
      expect(tiles[tile]).toBeInstanceOf(Uint8ClampedArray);
      expect(tiles[tile].length).toBe(PIXELS * 4);
    }
    expect(() => paintTile(TILE_COUNT)).toThrow();
  });

  it('are deterministic (AC5.1)', () => {
    for (let tile = 0; tile < TILE_COUNT; tile++) {
      expect(Buffer.from(paintTile(tile)).equals(Buffer.from(tiles[tile]))).toBe(true);
      const a = TILE_PAINTERS[tile](mulberry32(5));
      const b = TILE_PAINTERS[tile](mulberry32(5));
      expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true);
    }
  });

  it('have the specified transparency (AC5.2)', () => {
    for (let tile = 0; tile < TILE_COUNT; tile++) {
      const a = alphas(tiles[tile]);
      if (tile === Tile.WATER) {
        expect(Math.min(...a)).toBeGreaterThanOrEqual(0.5 * 255);
        expect(Math.max(...a)).toBeLessThanOrEqual(0.85 * 255);
      } else if (CUTOUT_TILES.includes(tile)) {
        expect(a.some((v) => v === 0)).toBe(true);
        expect(a.some((v) => v === 255)).toBe(true);
        // Cutout tiles are binary: nothing in between.
        expect(a.every((v) => v === 0 || v === 255)).toBe(true);
      } else {
        expect(
          a.every((v) => v === 255),
          TILE_NAMES[tile],
        ).toBe(true);
      }
    }
    // Leaves stay mostly solid; glass is mostly see-through.
    const leafHoles = alphas(tiles[Tile.LEAVES]).filter((v) => v === 0).length / PIXELS;
    expect(leafHoles).toBeGreaterThan(0.1);
    expect(leafHoles).toBeLessThan(0.45);
    const glassHoles = alphas(tiles[Tile.GLASS]).filter((v) => v === 0).length / PIXELS;
    expect(glassHoles).toBeGreaterThan(0.6);
  });

  it('have visible structure (AC5.3)', () => {
    for (let tile = 0; tile < TILE_COUNT; tile++) {
      const minimum = tile === Tile.GLASS ? 3 : 8;
      expect(distinctColors(tiles[tile]), TILE_NAMES[tile]).toBeGreaterThanOrEqual(minimum);
    }
  });

  it('have plausible mean colours (AC5.4)', () => {
    const grass = mean(tiles[Tile.GRASS_TOP]);
    expect(grass.g).toBeGreaterThan(grass.r + 20);
    expect(grass.g).toBeGreaterThan(grass.b + 20);

    const leaves = mean(tiles[Tile.LEAVES]);
    expect(leaves.g).toBeGreaterThan(leaves.r);
    expect(leaves.g).toBeGreaterThan(leaves.b);

    const water = mean(tiles[Tile.WATER]);
    expect(water.b).toBeGreaterThan(water.r + 40);
    expect(water.b).toBeGreaterThan(water.g + 20);

    const sand = mean(tiles[Tile.SAND]);
    expect((sand.r + sand.g + sand.b) / 3).toBeGreaterThan(170);
    expect(sand.r).toBeGreaterThan(sand.b + 30);
    expect(sand.g).toBeGreaterThan(sand.b + 20);

    const bricks = mean(tiles[Tile.BRICKS]);
    expect(bricks.r).toBeGreaterThan(bricks.g + 30);
    expect(bricks.r).toBeGreaterThan(bricks.b + 30);

    const stone = mean(tiles[Tile.STONE]);
    expect(Math.max(stone.r, stone.g, stone.b) - Math.min(stone.r, stone.g, stone.b)).toBeLessThan(
      12,
    );
    expect(stone.r).toBeGreaterThan(90);
    expect(stone.r).toBeLessThan(170);

    const dirt = mean(tiles[Tile.DIRT]);
    expect(dirt.r).toBeGreaterThan(dirt.g);
    expect(dirt.g).toBeGreaterThan(dirt.b);

    const bedrock = mean(tiles[Tile.BEDROCK]);
    expect(bedrock.r).toBeLessThan(stone.r - 30);

    // The grass side shows turf on top and soil below.
    const side = tiles[Tile.GRASS_SIDE];
    const topRow = { g: side[1], r: side[0] };
    expect(topRow.g).toBeGreaterThan(topRow.r);
    const bottom = (TILE_SIZE - 1) * TILE_SIZE * 4;
    expect(side[bottom]).toBeGreaterThan(side[bottom + 1]);
  });
});

describe('atlas layout (AC5.5)', () => {
  it('returns rectangles inside the atlas that do not overlap', () => {
    const rects = Array.from({ length: TILE_COUNT }, (_, tile) => tileRect(tile));
    rects.forEach((a, i) => {
      expect(a.u0).toBeGreaterThanOrEqual(0);
      expect(a.v0).toBeGreaterThanOrEqual(0);
      expect(a.u1).toBeLessThanOrEqual(1);
      expect(a.v1).toBeLessThanOrEqual(1);
      expect(a.u1 - a.u0).toBeCloseTo(TILE_SIZE / ATLAS_SIZE, 10);
      expect(a.v1 - a.v0).toBeCloseTo(TILE_SIZE / ATLAS_SIZE, 10);
      rects.forEach((b, j) => {
        if (i >= j) return;
        const overlap = a.u0 < b.u1 && b.u0 < a.u1 && a.v0 < b.v1 && b.v0 < a.v1;
        expect(overlap).toBe(false);
      });
    });
  });

  it('insets mesh UVs strictly inside the tile', () => {
    for (let tile = 0; tile < TILE_COUNT; tile++) {
      const full = tileRect(tile);
      const uv = tileUv(tile);
      expect(uv.u0).toBeGreaterThan(full.u0);
      expect(uv.v0).toBeGreaterThan(full.v0);
      expect(uv.u1).toBeLessThan(full.u1);
      expect(uv.v1).toBeLessThan(full.v1);
      expect(TILE_UVS[tile * 4]).toBeCloseTo(uv.u0, 6);
      expect(TILE_UVS[tile * 4 + 3]).toBeCloseTo(uv.v1, 6);
    }
    expect(() => tileCell(-1)).toThrow();
    expect(() => tileCell(ATLAS_TILES_PER_ROW * ATLAS_TILES_PER_ROW)).toThrow();
    expect(tileCell(9)).toEqual({ col: 1, row: 1 });
  });
});

describe('atlas builder', () => {
  const atlas = buildAtlas();

  it('packs every tile into its cell, flipped to bottom-up rows', () => {
    expect(atlas.levels[0].size).toBe(ATLAS_SIZE);
    expect(atlas.levels[0].data.length).toBe(ATLAS_SIZE * ATLAS_SIZE * 4);
    for (let tile = 0; tile < TILE_COUNT; tile++) {
      const { col, row } = tileCell(tile);
      // Top-left pixel of the image sits at the top row of the cell.
      const ax = col * TILE_SIZE;
      const ay = row * TILE_SIZE + TILE_SIZE - 1;
      const i = (ay * ATLAS_SIZE + ax) * 4;
      expect([...atlas.levels[0].data.subarray(i, i + 4)]).toEqual([
        ...atlas.tiles[tile].subarray(0, 4),
      ]);
    }
  });

  it('builds mip levels down to one pixel per tile without bleeding', () => {
    const sizes = atlas.levels.map((l) => l.size);
    expect(sizes).toEqual([256, 128, 64, 32, 16, 8]);
    const last = atlas.levels[atlas.levels.length - 1];
    // Unused cells stay fully transparent black: nothing leaked into them.
    for (let tile = TILE_COUNT; tile < ATLAS_TILES_PER_ROW * ATLAS_TILES_PER_ROW; tile++) {
      const { col, row } = tileCell(tile);
      const i = (row * last.size + col) * 4;
      expect([...last.data.subarray(i, i + 4)]).toEqual([0, 0, 0, 0]);
    }
    // The 1-pixel level equals the alpha-weighted mean colour of the tile.
    const { col, row } = tileCell(Tile.BRICKS);
    const i = (row * last.size + col) * 4;
    const bricks = mean(atlas.tiles[Tile.BRICKS]);
    expect(Math.abs(last.data[i] - bricks.r)).toBeLessThan(4);
    expect(last.data[i + 3]).toBe(255);
  });

  it('downsamples with alpha weighting', () => {
    // 2×2 image: one opaque red pixel, three transparent blue ones.
    const src = new Uint8Array([255, 0, 0, 255, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 255, 0]);
    expect([...downsample(src, 2)]).toEqual([255, 0, 0, 64]);
    const clear = new Uint8Array([9, 8, 7, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect([...downsample(clear, 2)]).toEqual([9, 8, 7, 0]);
  });
});
