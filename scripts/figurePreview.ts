// Dev tool: writes an enlarged sheet of every look from the front and the back for judging
// them by eye. Run: npx vite-node scripts/figurePreview.ts <out.png>   (do not commit it)
import { writeFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import { LOOKS } from '../src/player/looks';
import {
  FIGURE_VIEW_H,
  FIGURE_VIEW_W,
  figureView,
  paintFigureAtlas,
} from '../src/render/textures/figureTexture';

const out = process.argv[2];
if (!out) throw new Error('Usage: vite-node scripts/figurePreview.ts <out.png>');

const SCALE = 4;
const GAP = 12;
const ACCENTS: [number, number, number][] = [
  [216, 85, 63],
  [63, 134, 216],
  [79, 174, 74],
  [232, 182, 48],
];
const atlas = paintFigureAtlas();
const cellW = FIGURE_VIEW_W * SCALE * 2 + GAP * 2;
const cellH = FIGURE_VIEW_H * SCALE + GAP;
const png = new PNG({ width: cellW * 4 + GAP, height: cellH * 2 + GAP });
for (let i = 0; i < png.data.length; i += 4) png.data.set([150, 170, 190, 255], i);
LOOKS.forEach((look, index) => {
  const cx = GAP + (index % 4) * cellW;
  const cy = GAP + Math.floor(index / 4) * cellH;
  (['front', 'back'] as const).forEach((side, s) => {
    const view = figureView(atlas, look.id, side, ACCENTS[index % 4]);
    const ox = cx + s * (FIGURE_VIEW_W * SCALE + GAP);
    for (let y = 0; y < FIGURE_VIEW_H * SCALE; y++) {
      for (let x = 0; x < FIGURE_VIEW_W * SCALE; x++) {
        const i = (Math.floor(y / SCALE) * FIGURE_VIEW_W + Math.floor(x / SCALE)) * 4;
        if (view[i + 3] === 0) continue;
        png.data.set([view[i], view[i + 1], view[i + 2], 255], ((cy + y) * png.width + ox + x) * 4);
      }
    }
  });
});
writeFileSync(out, PNG.sync.write(png));
console.log(`wrote ${out}`);
