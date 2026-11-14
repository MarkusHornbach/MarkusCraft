// Dev tool: writes an enlarged sheet of all item icons for judging them by eye.
// Run: npx vite-node scripts/iconPreview.ts <out.png>   (do not commit the image)
import { writeFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import { ICON_ITEMS, ITEM_ICON_SIZE, paintItemIcon } from '../src/render/textures/itemIcons';

const out = process.argv[2];
if (!out) throw new Error('Usage: vite-node scripts/iconPreview.ts <out.png>');

const SCALE = 6;
const COLUMNS = 6;
const GAP = 8;
const cell = ITEM_ICON_SIZE * SCALE + GAP;
const rows = Math.ceil(ICON_ITEMS.length / COLUMNS);
// Below the enlarged icons, the same icons at their real size on a dark slot colour.
const png = new PNG({ width: COLUMNS * cell + GAP, height: rows * cell + GAP + 48 });
for (let i = 0; i < png.data.length; i += 4) png.data.set([70, 80, 96, 255], i);

function blit(pixels: Uint8ClampedArray, ox: number, oy: number, scale: number): void {
  const size = ITEM_ICON_SIZE * scale;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (Math.floor(y / scale) * ITEM_ICON_SIZE + Math.floor(x / scale)) * 4;
      if (pixels[i + 3] === 0) continue;
      png.data.set(
        [pixels[i], pixels[i + 1], pixels[i + 2], 255],
        ((oy + y) * png.width + ox + x) * 4,
      );
    }
  }
}

ICON_ITEMS.forEach((item, index) => {
  const pixels = paintItemIcon(item);
  if (!pixels) return;
  blit(pixels, GAP + (index % COLUMNS) * cell, GAP + Math.floor(index / COLUMNS) * cell, SCALE);
  blit(pixels, GAP + index * (ITEM_ICON_SIZE + 6), rows * cell + GAP, 1);
});
writeFileSync(out, PNG.sync.write(png));
console.log(`wrote ${out}`);
