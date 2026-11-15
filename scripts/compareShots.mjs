// Dev tool: sheets with an old reference screenshot next to the new one, for judging
// regenerated references by eye (docs/phase-4-plan.md, section 6.5).
// Usage: node scripts/compareShots.mjs <oldDir> <outDir> [newDir = e2e/screenshots]
// The sheets are not committed; write them outside the repository.
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PNG } from 'pngjs';

const [, , oldDir, outDir, newDir = 'e2e/screenshots'] = process.argv;
if (!oldDir || !outDir) {
  console.error('Usage: node scripts/compareShots.mjs <oldDir> <outDir> [newDir]');
  process.exit(1);
}
mkdirSync(outDir, { recursive: true });
const GAP = 8;

/** Mean brightness (0..255) of the lower half of a picture, where the ground is. */
function lowerHalf(png) {
  let sum = 0;
  let count = 0;
  for (let y = Math.floor(png.height / 2); y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      const i = (y * png.width + x) * 4;
      sum += 0.2126 * png.data[i] + 0.7152 * png.data[i + 1] + 0.0722 * png.data[i + 2];
      count++;
    }
  }
  return sum / count;
}

for (const name of readdirSync(newDir)
  .filter((file) => file.endsWith('.png'))
  .sort()) {
  const fresh = PNG.sync.read(readFileSync(join(newDir, name)));
  let old;
  try {
    old = PNG.sync.read(readFileSync(join(oldDir, name)));
  } catch {
    console.log(`${name}: new (lower half ${lowerHalf(fresh).toFixed(1)})`);
    continue;
  }
  const sheet = new PNG({
    width: old.width + GAP + fresh.width,
    height: Math.max(old.height, fresh.height),
  });
  sheet.data.fill(255);
  PNG.bitblt(old, sheet, 0, 0, old.width, old.height, 0, 0);
  PNG.bitblt(fresh, sheet, 0, 0, fresh.width, fresh.height, old.width + GAP, 0);
  writeFileSync(join(outDir, name), PNG.sync.write(sheet));
  let changed = 0;
  if (old.width === fresh.width && old.height === fresh.height) {
    for (let i = 0; i < old.data.length; i += 4) {
      const d =
        Math.abs(old.data[i] - fresh.data[i]) +
        Math.abs(old.data[i + 1] - fresh.data[i + 1]) +
        Math.abs(old.data[i + 2] - fresh.data[i + 2]);
      if (d > 24) changed++;
    }
  }
  const share = ((changed / (old.width * old.height)) * 100).toFixed(1);
  console.log(
    `${name}: ${share} % of pixels changed, lower half ${lowerHalf(old).toFixed(1)} → ` +
      `${lowerHalf(fresh).toFixed(1)}`,
  );
}
