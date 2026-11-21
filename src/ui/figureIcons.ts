// Pictures of the looks for menus (Phase 6 part D): the head icon of a look and the sheet
// of every look from the front and the back, drawn from the figure atlas on 2D canvases.
import { LOOKS, lookById } from '../player/looks';
import { figureAtlas, PLAYER_COLORS } from '../render/figureModel';
import {
  FIGURE_VIEW_H,
  FIGURE_VIEW_W,
  figureView,
  headIcon,
} from '../render/textures/figureTexture';

/** Texels of the head's front. */
const HEAD_TEXELS = 7;

function rgbOf(hex: number): [number, number, number] {
  return [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
}

/** Draws RGBA texels enlarged without smoothing into a new canvas of `scale` px per texel. */
function pixelCanvas(
  pixels: Uint8ClampedArray,
  w: number,
  h: number,
  scale: number,
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = w * scale;
  canvas.height = h * scale;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  const image = ctx.createImageData(w * scale, h * scale);
  for (let y = 0; y < h * scale; y++) {
    for (let x = 0; x < w * scale; x++) {
      const from = (Math.floor(y / scale) * w + Math.floor(x / scale)) * 4;
      image.data.set(pixels.subarray(from, from + 4), (y * w * scale + x) * 4);
    }
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}

/** The front of a look's head as a canvas (`scale` px per texel). */
export function headIconCanvas(look: number, scale = 4): HTMLCanvasElement {
  const canvas = pixelCanvas(headIcon(figureAtlas(), look), HEAD_TEXELS, HEAD_TEXELS, scale);
  canvas.className = 'head-icon';
  canvas.dataset.look = String(lookById(look).id);
  return canvas;
}

/** Every look from the front and the back with its name (the reference `figure-sheet`). */
export function figureSheet(): HTMLElement {
  const sheet = document.createElement('div');
  sheet.className = 'figure-sheet';
  LOOKS.forEach((look, index) => {
    const cell = document.createElement('div');
    cell.className = 'figure-sheet-cell';
    const accent = rgbOf(PLAYER_COLORS[index % PLAYER_COLORS.length]);
    for (const side of ['front', 'back'] as const) {
      const view = figureView(figureAtlas(), look.id, side, accent);
      cell.appendChild(pixelCanvas(view, FIGURE_VIEW_W, FIGURE_VIEW_H, 3));
    }
    const name = document.createElement('span');
    name.textContent = look.name;
    cell.appendChild(name);
    sheet.appendChild(cell);
  });
  return sheet;
}
