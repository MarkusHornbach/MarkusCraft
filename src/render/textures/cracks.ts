// Crack painter: the overlay on a block that is being broken, in stages. Pure, no canvas.
import { TEXTURE_SEED } from '../../game/config';
import { deriveSeed, mulberry32 } from '../../util/rng';

/** Stages of the crack overlay; stage 0 is the first hairline, the last is shattered. */
export const CRACK_STAGES = 5;
export const CRACK_SIZE = 32;

const S = CRACK_SIZE;
const MAIN_CRACKS = 5;
const CRACK_ALPHA = 215;
const EDGE_ALPHA = 80;

/** One crack: the pixels it runs through, from its start outwards. */
type Stroke = number[];

/** A wandering line from (x, y) in direction `angle` until it leaves the tile. */
function stroke(rng: () => number, x: number, y: number, angle: number, steps: number): Stroke {
  const cells: Stroke = [];
  for (let i = 0; i < steps; i++) {
    const cx = Math.floor(x);
    const cy = Math.floor(y);
    if (cx < 0 || cy < 0 || cx >= S || cy >= S) break;
    const index = cy * S + cx;
    if (cells[cells.length - 1] !== index) cells.push(index);
    angle += (rng() - 0.5) * 0.9;
    x += Math.cos(angle);
    y += Math.sin(angle);
  }
  return cells;
}

/** All cracks, generated once: main cracks from the middle, then branches off them. */
function buildStrokes(): { main: Stroke[]; branches: Stroke[] } {
  const rng = mulberry32(deriveSeed(TEXTURE_SEED, 2000));
  const main: Stroke[] = [];
  const branches: Stroke[] = [];
  const cx = S / 2 + (rng() - 0.5) * 4;
  const cy = S / 2 + (rng() - 0.5) * 4;
  for (let i = 0; i < MAIN_CRACKS; i++) {
    const angle = ((i + rng() * 0.6) / MAIN_CRACKS) * Math.PI * 2;
    const cells = stroke(rng, cx, cy, angle, 30);
    main.push(cells);
    // Two branches leave each main crack sideways, part of the way out.
    for (const at of [0.35, 0.65]) {
      const from = cells[Math.floor(cells.length * at)];
      const side = rng() < 0.5 ? 1 : -1;
      branches.push(stroke(rng, from % S, Math.floor(from / S), angle + side * (0.7 + rng()), 14));
    }
  }
  return { main, branches };
}

const STROKES = buildStrokes();

/**
 * Paints the cracks of one stage (0 … CRACK_STAGES − 1) as RGBA pixels on a clear
 * background. Each stage contains the one before: main cracks grow outwards first, then
 * the branches, and the last stage thickens them. A faint light edge next to the dark
 * line keeps the cracks visible on dark blocks.
 */
export function paintCracks(stage: number): Uint8ClampedArray {
  const px = new Uint8ClampedArray(S * S * 4);
  const s = Math.max(0, Math.min(CRACK_STAGES - 1, Math.floor(stage)));
  const dark = new Set<number>();
  const mainShare = Math.min(1, (s + 1) / 4);
  const branchShare = Math.max(0, Math.min(1, (s - 1) / 3));
  for (const cells of STROKES.main) {
    for (let i = 0; i < Math.ceil(cells.length * mainShare); i++) dark.add(cells[i]);
  }
  for (const cells of STROKES.branches) {
    for (let i = 0; i < Math.ceil(cells.length * branchShare); i++) dark.add(cells[i]);
  }
  if (s === CRACK_STAGES - 1) {
    // Shattered: the main cracks are two pixels wide.
    for (const cells of STROKES.main) {
      for (const index of cells) if (index % S < S - 1) dark.add(index + 1);
    }
  }
  for (const index of dark) {
    px[index * 4 + 3] = CRACK_ALPHA;
    const below = index + S;
    if (below < S * S && !dark.has(below)) {
      px[below * 4] = 255;
      px[below * 4 + 1] = 255;
      px[below * 4 + 2] = 255;
      px[below * 4 + 3] = EDGE_ALPHA;
    }
  }
  return px;
}

/** Number of dark crack pixels of a painted stage (for tests and tuning). */
export function crackPixels(px: Uint8ClampedArray): number {
  let count = 0;
  for (let i = 0; i < px.length; i += 4) if (px[i + 3] === CRACK_ALPHA) count++;
  return count;
}
