// Block icons for the selector bar: a small isometric cube drawn from the tile pixels.
import { TILE_SIZE } from '../game/config';
import { getBlockDef } from '../world/blocks';

export const ICON_SIZE = 36;

function tileCanvas(pixels: Uint8ClampedArray): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = TILE_SIZE;
  canvas.height = TILE_SIZE;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('2D canvas is not available');
  const image = context.createImageData(TILE_SIZE, TILE_SIZE);
  image.data.set(pixels);
  context.putImageData(image, 0, 0);
  return canvas;
}

/**
 * Draws the block as a cube seen from above-front: top face plus two sides, shaded like
 * the faces in the world. `tiles` are the painted tile images indexed by tile id.
 */
export function createBlockIcon(blockId: number, tiles: Uint8ClampedArray[]): HTMLCanvasElement {
  const def = getBlockDef(blockId);
  const canvas = document.createElement('canvas');
  canvas.width = ICON_SIZE;
  canvas.height = ICON_SIZE;
  const context = canvas.getContext('2d');
  if (!context || !def.tiles) return canvas;
  context.imageSmoothingEnabled = false;

  const top = tileCanvas(tiles[def.tiles.top]);
  const side = tileCanvas(tiles[def.tiles.side]);
  const s = 1 / TILE_SIZE;
  // Each face maps the square tile onto a parallelogram: [a, b, c, d, e, f, darkening].
  const faces: [HTMLCanvasElement, number, number, number, number, number, number, number][] = [
    [top, 16 * s, 8 * s, -16 * s, 8 * s, 18, 1, 0],
    [side, 16 * s, 8 * s, 0, 18 * s, 2, 9, 0.2],
    [side, 16 * s, -8 * s, 0, 18 * s, 18, 17, 0.38],
  ];
  for (const [image, a, b, c, d, e, f, dark] of faces) {
    context.setTransform(a, b, c, d, e, f);
    context.globalCompositeOperation = 'source-over';
    context.drawImage(image, 0, 0);
    if (dark > 0) {
      // Darken only the pixels that were drawn, so transparent parts stay clear.
      context.globalCompositeOperation = 'source-atop';
      context.fillStyle = `rgba(0, 0, 0, ${dark})`;
      context.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
    }
  }
  context.setTransform(1, 0, 0, 1, 0, 0);
  return canvas;
}
