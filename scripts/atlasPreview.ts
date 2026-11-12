// Dev tool: writes an enlarged atlas preview PNG for judging the textures by eye.
// Run: npx vite-node scripts/atlasPreview.ts <out.png>   (do not commit the image)
import { writeFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import { TILE_SIZE } from '../src/game/config';
import { paintAllTiles } from '../src/render/textures/tiles';

const out = process.argv[2];
if (!out) throw new Error('Usage: vite-node scripts/atlasPreview.ts <out.png>');

const SCALE = 5;
const COLUMNS = 5;
const GAP = 8;
const tiles = paintAllTiles();
const rows = Math.ceil(tiles.length / COLUMNS);
const cell = TILE_SIZE * 2 * SCALE + GAP;
const png = new PNG({ width: COLUMNS * cell + GAP, height: rows * cell + GAP });
png.data.fill(255);

tiles.forEach((tile, index) => {
  const ox = GAP + (index % COLUMNS) * cell;
  const oy = GAP + Math.floor(index / COLUMNS) * cell;
  // Each tile is drawn 2×2 so seams between repeats are visible.
  for (let y = 0; y < TILE_SIZE * 2 * SCALE; y++) {
    for (let x = 0; x < TILE_SIZE * 2 * SCALE; x++) {
      const tx = Math.floor(x / SCALE) % TILE_SIZE;
      const ty = Math.floor(y / SCALE) % TILE_SIZE;
      const i = (ty * TILE_SIZE + tx) * 4;
      const a = tile[i + 3] / 255;
      // Checkerboard behind transparent pixels.
      const check = (Math.floor(x / 10) + Math.floor(y / 10)) % 2 === 0 ? 235 : 190;
      const o = ((oy + y) * png.width + ox + x) * 4;
      png.data[o] = tile[i] * a + check * (1 - a);
      png.data[o + 1] = tile[i + 1] * a + check * (1 - a);
      png.data[o + 2] = tile[i + 2] * a + check * (1 - a);
      png.data[o + 3] = 255;
    }
  }
});
writeFileSync(out, PNG.sync.write(png));
console.log(`wrote ${out}`);
