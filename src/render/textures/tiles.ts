// Procedural tile painters: pure functions from an RNG to 32×32 RGBA pixels. No canvas.
import { TEXTURE_SEED, TILE_SIZE } from '../../game/config';
import { type Rng, deriveSeed, mulberry32 } from '../../util/rng';
import { TILE_COUNT, Tile } from '../../world/blocks';

export type TilePainter = (rng: Rng) => Uint8ClampedArray;
type Rgb = readonly [number, number, number];

const S = TILE_SIZE;

function wrap(v: number): number {
  return ((v % S) + S) % S;
}

function createTile(): Uint8ClampedArray {
  return new Uint8ClampedArray(S * S * 4);
}

function setPixel(px: Uint8ClampedArray, x: number, y: number, c: Rgb, a = 255): void {
  const i = (wrap(y) * S + wrap(x)) * 4;
  px[i] = c[0];
  px[i + 1] = c[1];
  px[i + 2] = c[2];
  px[i + 3] = a;
}

/** Adds `amount` to the brightness of a pixel (negative darkens). */
function shadePixel(px: Uint8ClampedArray, x: number, y: number, amount: number): void {
  const i = (wrap(y) * S + wrap(x)) * 4;
  px[i] += amount;
  px[i + 1] += amount;
  px[i + 2] += amount;
}

function mix(a: Rgb, b: Rgb, t: number): Rgb {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/**
 * Tileable value noise: a coarse random grid, smoothly interpolated with wrap-around.
 * This gives the soft, painterly blotches underneath the fine detail. Values in [0, 1].
 */
function blotches(rng: Rng, cells: number): Float32Array {
  const grid = new Float32Array(cells * cells);
  for (let i = 0; i < grid.length; i++) grid[i] = rng();
  const out = new Float32Array(S * S);
  const scale = cells / S;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const gx = x * scale;
      const gy = y * scale;
      const x0 = Math.floor(gx);
      const y0 = Math.floor(gy);
      let tx = gx - x0;
      let ty = gy - y0;
      tx = tx * tx * (3 - 2 * tx);
      ty = ty * ty * (3 - 2 * ty);
      const x1 = (x0 + 1) % cells;
      const y1 = (y0 + 1) % cells;
      const a = grid[y0 * cells + x0];
      const b = grid[y0 * cells + x1];
      const c = grid[y1 * cells + x0];
      const d = grid[y1 * cells + x1];
      out[y * S + x] = a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
    }
  }
  return out;
}

/**
 * Base coat: blends between a dark and a light tone following two layers of blotches,
 * then adds per-pixel grain.
 */
function baseCoat(rng: Rng, dark: Rgb, light: Rgb, grain: number): Uint8ClampedArray {
  const px = createTile();
  const coarse = blotches(rng, 4);
  const fine = blotches(rng, 8);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const t = coarse[y * S + x] * 0.6 + fine[y * S + x] * 0.4;
      const c = mix(dark, light, t);
      const g = (rng() - 0.5) * grain;
      setPixel(px, x, y, [c[0] + g, c[1] + g, c[2] + g]);
    }
  }
  return px;
}

function speckle(px: Uint8ClampedArray, rng: Rng, count: number, amount: number): void {
  for (let i = 0; i < count; i++) {
    shadePixel(px, Math.floor(rng() * S), Math.floor(rng() * S), amount * (0.5 + rng() * 0.5));
  }
}

const GRASS_DARK: Rgb = [58, 124, 48];
const GRASS_LIGHT: Rgb = [112, 176, 70];
const DIRT_DARK: Rgb = [104, 72, 46];
const DIRT_LIGHT: Rgb = [146, 106, 70];

function paintGrassTop(rng: Rng): Uint8ClampedArray {
  const px = baseCoat(rng, GRASS_DARK, GRASS_LIGHT, 14);
  // Short blade strokes: a light pixel with a darker one below it.
  for (let i = 0; i < 46; i++) {
    const x = Math.floor(rng() * S);
    const y = Math.floor(rng() * S);
    shadePixel(px, x, y, 20);
    shadePixel(px, x, y + 1, -14);
    if (rng() < 0.4) shadePixel(px, x, y - 1, 12);
  }
  return px;
}

function paintDirt(rng: Rng): Uint8ClampedArray {
  const px = baseCoat(rng, DIRT_DARK, DIRT_LIGHT, 14);
  // Pebbles: small light spots with a shadow pixel underneath.
  for (let i = 0; i < 14; i++) {
    const x = Math.floor(rng() * S);
    const y = Math.floor(rng() * S);
    shadePixel(px, x, y, 26);
    shadePixel(px, x + 1, y, 16);
    shadePixel(px, x, y + 1, -22);
    shadePixel(px, x + 1, y + 1, -22);
  }
  speckle(px, rng, 40, -18);
  return px;
}

function paintGrassSide(rng: Rng): Uint8ClampedArray {
  const px = paintDirt(rng);
  const grass = baseCoat(rng, GRASS_DARK, GRASS_LIGHT, 14);
  const edge = blotches(rng, 8);
  for (let x = 0; x < S; x++) {
    // Irregular lower edge of the turf, 5 to 9 pixels deep, with hanging blades.
    const depth = 5 + Math.floor(edge[x] * 4) + (rng() < 0.25 ? 2 : 0);
    for (let y = 0; y < depth; y++) {
      const i = (y * S + x) * 4;
      const shade = y === depth - 1 ? -26 : y === 0 ? 10 : 0;
      setPixel(px, x, y, [grass[i] + shade, grass[i + 1] + shade, grass[i + 2] + shade]);
    }
    // Soft shadow the turf casts on the soil.
    shadePixel(px, x, depth, -16);
  }
  return px;
}

function paintStone(rng: Rng): Uint8ClampedArray {
  const px = baseCoat(rng, [104, 106, 110], [150, 150, 152], 12);
  // Cracks: dark random walks with a light rim on the lower side.
  for (let c = 0; c < 4; c++) {
    let x = Math.floor(rng() * S);
    let y = Math.floor(rng() * S);
    const horizontal = rng() < 0.6;
    const length = 7 + Math.floor(rng() * 9);
    for (let i = 0; i < length; i++) {
      shadePixel(px, x, y, -34);
      shadePixel(px, x, y + 1, 12);
      if (horizontal) {
        x += 1;
        y += rng() < 0.3 ? 1 : rng() < 0.3 ? -1 : 0;
      } else {
        y += 1;
        x += rng() < 0.3 ? 1 : rng() < 0.3 ? -1 : 0;
      }
    }
  }
  speckle(px, rng, 50, 14);
  speckle(px, rng, 50, -14);
  return px;
}

function paintSand(rng: Rng): Uint8ClampedArray {
  const px = baseCoat(rng, [208, 190, 134], [234, 220, 168], 10);
  // Gentle wind ripples: wavy light lines with a darker line below.
  for (let r = 0; r < 4; r++) {
    const y0 = r * 8 + Math.floor(rng() * 4);
    const phase = rng() * Math.PI * 2;
    for (let x = 0; x < S; x++) {
      // Two full waves per tile keep the ripple tileable.
      const y = y0 + Math.round(Math.sin((x / S) * Math.PI * 4 + phase) * 1.5);
      shadePixel(px, x, y, 9);
      shadePixel(px, x, y + 1, -9);
    }
  }
  speckle(px, rng, 60, -20);
  speckle(px, rng, 30, 14);
  return px;
}

const BARK_DARK: Rgb = [70, 50, 32];
const BARK_LIGHT: Rgb = [112, 84, 54];

function paintLogBark(rng: Rng): Uint8ClampedArray {
  const px = createTile();
  const drift = blotches(rng, 4);
  // Vertical furrows: each column has its own tone, drifting slowly along the height.
  const columnTone = new Float32Array(S);
  for (let x = 0; x < S; x++) columnTone[x] = rng();
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const shifted = wrap(x + Math.round((drift[y * S + x] - 0.5) * 3));
      const t = columnTone[shifted] * 0.7 + drift[y * S + x] * 0.3;
      const g = (rng() - 0.5) * 10;
      const c = mix(BARK_DARK, BARK_LIGHT, t);
      setPixel(px, x, y, [c[0] + g, c[1] + g, c[2] + g]);
    }
  }
  // Deep grooves and a few knots.
  for (let i = 0; i < 9; i++) {
    const x = Math.floor(rng() * S);
    const y = Math.floor(rng() * S);
    const length = 4 + Math.floor(rng() * 8);
    for (let k = 0; k < length; k++) shadePixel(px, x, y + k, -22);
  }
  return px;
}

function paintLogEnd(rng: Rng): Uint8ClampedArray {
  const px = paintLogBark(rng);
  const woodDark: Rgb = [150, 112, 66];
  const woodLight: Rgb = [198, 160, 104];
  const centre = (S - 1) / 2;
  const wobble = blotches(rng, 4);
  for (let y = 3; y < S - 3; y++) {
    for (let x = 3; x < S - 3; x++) {
      const d = Math.hypot(x - centre, y - centre) + (wobble[y * S + x] - 0.5) * 2.5;
      // Growth rings every three pixels.
      const ring = Math.abs((d % 3) - 1.5) / 1.5;
      const c = mix(woodDark, woodLight, ring * 0.8 + rng() * 0.2);
      setPixel(px, x, y, c);
    }
  }
  // Dark line between bark and wood, and a small core.
  for (let i = 3; i < S - 3; i++) {
    for (const [x, y] of [
      [i, 3],
      [i, S - 4],
      [3, i],
      [S - 4, i],
    ]) {
      shadePixel(px, x, y, -40);
    }
  }
  shadePixel(px, 15, 15, -30);
  shadePixel(px, 16, 15, -30);
  shadePixel(px, 15, 16, -30);
  shadePixel(px, 16, 16, -30);
  return px;
}

function paintLeaves(rng: Rng): Uint8ClampedArray {
  const px = baseCoat(rng, [38, 98, 36], [86, 152, 58], 16);
  // Leaf clumps: lighter blobs with a shadow, so the foliage reads as layered.
  for (let i = 0; i < 22; i++) {
    const x = Math.floor(rng() * S);
    const y = Math.floor(rng() * S);
    shadePixel(px, x, y, 22);
    shadePixel(px, x + 1, y, 16);
    shadePixel(px, x, y + 1, 10);
    shadePixel(px, x + 1, y + 1, -20);
    shadePixel(px, x + 2, y + 1, -20);
  }
  // Holes: small clusters of fully transparent pixels.
  const holes = blotches(rng, 8);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      if (holes[y * S + x] > 0.74 || rng() < 0.02) {
        setPixel(px, x, y, [44, 100, 40], 0);
      }
    }
  }
  // Dark rim above each hole gives the canopy depth.
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const below = (wrap(y + 1) * S + x) * 4 + 3;
      if (px[(y * S + x) * 4 + 3] === 255 && px[below] === 0) shadePixel(px, x, y, -24);
    }
  }
  return px;
}

function paintPlanks(rng: Rng): Uint8ClampedArray {
  const px = createTile();
  const dark: Rgb = [150, 112, 64];
  const light: Rgb = [196, 156, 98];
  const grain = blotches(rng, 8);
  const boardHeight = S / 4;
  for (let board = 0; board < 4; board++) {
    const tone = 0.25 + rng() * 0.5;
    // Each board has one butt joint at its own position.
    const joint = Math.floor(rng() * S);
    for (let y = board * boardHeight; y < (board + 1) * boardHeight; y++) {
      // Stretch the grain horizontally by sampling the blotches along a sheared row.
      const row = wrap(y * 5 + board * 11);
      for (let x = 0; x < S; x++) {
        const t = tone * 0.6 + grain[row * S + wrap(Math.floor(x / 3) + board * 7)] * 0.4;
        const g = (rng() - 0.5) * 8;
        const c = mix(dark, light, t);
        setPixel(px, x, y, [c[0] + g, c[1] + g, c[2] + g]);
      }
    }
    const top = board * boardHeight;
    for (let x = 0; x < S; x++) {
      // Seam between boards, with a highlight on the edge below it.
      shadePixel(px, x, top + boardHeight - 1, -44);
      shadePixel(px, x, top, 12);
    }
    for (let y = top; y < top + boardHeight - 1; y++) shadePixel(px, joint, y, -36);
    // Nail heads next to the joint.
    shadePixel(px, joint + 2, top + 2, -50);
    shadePixel(px, joint - 2, top + 5, -50);
  }
  return px;
}

function paintBricks(rng: Rng): Uint8ClampedArray {
  const px = createTile();
  const mortar: Rgb = [176, 170, 158];
  const brickDark: Rgb = [128, 52, 40];
  const brickLight: Rgb = [184, 88, 64];
  const rowHeight = 8;
  const brickWidth = 16;
  const tint = blotches(rng, 8);
  for (let row = 0; row < S / rowHeight; row++) {
    const offset = row % 2 === 0 ? 0 : brickWidth / 2;
    const tones = [rng(), rng()];
    for (let y = row * rowHeight; y < (row + 1) * rowHeight; y++) {
      for (let x = 0; x < S; x++) {
        const bx = wrap(x - offset);
        const inBrickX = bx % brickWidth;
        const inBrickY = y % rowHeight;
        if (inBrickY === rowHeight - 1 || inBrickX === brickWidth - 1) {
          const g = (rng() - 0.5) * 14;
          setPixel(px, x, y, [mortar[0] + g, mortar[1] + g, mortar[2] + g]);
          continue;
        }
        const tone = tones[Math.floor(bx / brickWidth)] * 0.6 + tint[y * S + x] * 0.4;
        const c = mix(brickDark, brickLight, tone);
        // Bevel: light top and left edge, dark bottom and right edge.
        let bevel = 0;
        if (inBrickY === 0 || inBrickX === 0) bevel = 16;
        if (inBrickY === rowHeight - 2 || inBrickX === brickWidth - 2) bevel = -20;
        const g = (rng() - 0.5) * 12 + bevel;
        setPixel(px, x, y, [c[0] + g, c[1] + g, c[2] + g]);
      }
    }
  }
  return px;
}

function paintGlass(rng: Rng): Uint8ClampedArray {
  const px = createTile();
  const frameLight: Rgb = [226, 240, 244];
  const frameDark: Rgb = [150, 184, 196];
  const glint: Rgb = [240, 250, 255];
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const edge = Math.min(x, y, S - 1 - x, S - 1 - y);
      if (edge >= 2) {
        // See-through centre. The colour is kept for the mip levels' colour average.
        setPixel(px, x, y, [200, 228, 236], 0);
      } else {
        const lit = x < 2 || y < 2;
        const c = edge === 0 ? (lit ? frameLight : frameDark) : mix(frameLight, frameDark, 0.5);
        const g = (rng() - 0.5) * 8;
        setPixel(px, x, y, [c[0] + g, c[1] + g, c[2] + g]);
      }
    }
  }
  // Diagonal glints, as if light caught the pane.
  const streaks: [number, number, number][] = [
    [6, 13, 7],
    [9, 13, 4],
    [19, 26, 6],
    [22, 26, 3],
  ];
  for (const [x0, y0, length] of streaks) {
    for (let k = 0; k < length; k++) setPixel(px, x0 + k, y0 - k, glint);
  }
  return px;
}

function paintWater(rng: Rng): Uint8ClampedArray {
  const px = createTile();
  const deep: Rgb = [36, 92, 186];
  const shallow: Rgb = [70, 136, 216];
  const coarse = blotches(rng, 4);
  const fine = blotches(rng, 8);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const t = coarse[y * S + x] * 0.6 + fine[y * S + x] * 0.4;
      // Alpha varies a little with the tone; it stays within 0.5..0.85 of 255.
      setPixel(px, x, y, mix(deep, shallow, t), 160 + Math.round(t * 24));
    }
  }
  // Ripple highlights: short wavy light strokes.
  for (let r = 0; r < 7; r++) {
    const x0 = Math.floor(rng() * S);
    const y0 = Math.floor(rng() * S);
    const length = 5 + Math.floor(rng() * 7);
    for (let k = 0; k < length; k++) {
      const y = y0 + Math.round(Math.sin(k * 0.9) * 0.8);
      shadePixel(px, x0 + k, y, 30);
      shadePixel(px, x0 + k, y + 1, -10);
    }
  }
  return px;
}

function paintBedrock(rng: Rng): Uint8ClampedArray {
  const px = baseCoat(rng, [34, 34, 38], [98, 98, 104], 18);
  // Hard, angular chips of light and dark.
  for (let i = 0; i < 26; i++) {
    const x = Math.floor(rng() * S);
    const y = Math.floor(rng() * S);
    const amount = rng() < 0.5 ? 30 : -30;
    shadePixel(px, x, y, amount);
    shadePixel(px, x + 1, y, amount);
    shadePixel(px, x + 1, y + 1, amount * 0.6);
  }
  return px;
}

/**
 * Ore: the stone tile with nuggets set into it. Each nugget is a small irregular blob
 * with a dark rim below and a highlight on top, so it reads from a distance.
 */
function paintOre(rng: Rng, dark: Rgb, light: Rgb, glint: Rgb): Uint8ClampedArray {
  const px = paintStone(rng);
  // One nugget per cell of a 3×3 grid keeps them spread out; some cells stay empty.
  const cell = S / 3;
  for (let gy = 0; gy < 3; gy++) {
    for (let gx = 0; gx < 3; gx++) {
      if (rng() < 0.2) continue;
      const cx = Math.floor(gx * cell + 2 + rng() * (cell - 5));
      const cy = Math.floor(gy * cell + 2 + rng() * (cell - 5));
      const rx = 2 + rng() * 1.5;
      const ry = 1.7 + rng() * 1.2;
      for (let dy = -4; dy <= 4; dy++) {
        for (let dx = -4; dx <= 4; dx++) {
          const d = (dx * dx) / (rx * rx) + (dy * dy) / (ry * ry) + (rng() - 0.5) * 0.5;
          if (d > 1.25) continue;
          if (d > 1) {
            // Shadow in the rock around the nugget.
            shadePixel(px, cx + dx, cy + dy, -30);
            continue;
          }
          const c = mix(dark, light, rng());
          setPixel(px, cx + dx, cy + dy, dy < 0 && dx <= 0 && d < 0.5 ? glint : c);
        }
      }
    }
  }
  return px;
}

function paintCoalOre(rng: Rng): Uint8ClampedArray {
  return paintOre(rng, [22, 22, 26], [48, 48, 54], [86, 88, 98]);
}

function paintIronOre(rng: Rng): Uint8ClampedArray {
  return paintOre(rng, [168, 104, 62], [214, 150, 98], [240, 200, 150]);
}

function paintClay(rng: Rng): Uint8ClampedArray {
  const px = baseCoat(rng, [136, 150, 172], [172, 184, 202], 8);
  // Smooth, layered sediment: faint horizontal bands that wander by a pixel.
  const wander = blotches(rng, 4);
  for (let band = 0; band < 5; band++) {
    const y0 = Math.floor((band * S) / 5 + rng() * 3);
    const amount = rng() < 0.5 ? -12 : 10;
    for (let x = 0; x < S; x++) {
      const y = y0 + Math.round((wander[y0 * S + x] - 0.5) * 3);
      shadePixel(px, x, y, amount);
    }
  }
  speckle(px, rng, 24, -12);
  return px;
}

/**
 * Workbench top: a framed work surface. Dark rails run around a lighter board that
 * carries a ruled measuring grid and a few cut marks.
 */
function paintWorkbenchTop(rng: Rng): Uint8ClampedArray {
  const px = baseCoat(rng, [150, 110, 62], [196, 152, 92], 10);
  const rail: Rgb = [92, 62, 36];
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const edge = Math.min(x, y, S - 1 - x, S - 1 - y);
      if (edge < 3) {
        const g = (rng() - 0.5) * 12 + (edge === 0 ? -14 : edge === 2 ? -24 : 8);
        setPixel(px, x, y, [rail[0] + g, rail[1] + g, rail[2] + g]);
      } else if (edge === 3) {
        shadePixel(px, x, y, -30);
      }
    }
  }
  // Measuring marks: a faint grid every 6 pixels inside the frame.
  for (let k = 9; k < S - 4; k += 6) {
    for (let t = 5; t < S - 5; t++) {
      shadePixel(px, k, t, -16);
      shadePixel(px, t, k, -16);
    }
  }
  // Cut marks left by a saw.
  for (let i = 0; i < 4; i++) {
    const x0 = 6 + Math.floor(rng() * 14);
    const y0 = 6 + Math.floor(rng() * 18);
    const length = 4 + Math.floor(rng() * 5);
    for (let k = 0; k < length; k++) shadePixel(px, x0 + k, y0 + (k >> 1), -42);
  }
  // Bolt heads in the corners of the frame.
  for (const [x, y] of [
    [1, 1],
    [S - 2, 1],
    [1, S - 2],
    [S - 2, S - 2],
  ]) {
    setPixel(px, x, y, [196, 198, 204]);
  }
  return px;
}

/**
 * Workbench side: the planks, a dark top rail, and two drawers with metal pulls between
 * two legs.
 */
function paintWorkbenchSide(rng: Rng): Uint8ClampedArray {
  const px = paintPlanks(rng);
  const dark: Rgb = [92, 62, 36];
  const drawerDark: Rgb = [138, 98, 54];
  const drawerLight: Rgb = [178, 134, 80];
  const tint = blotches(rng, 8);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const g = (rng() - 0.5) * 10;
      if (y < 5) {
        // The edge of the work surface with a shadow line under it.
        const shade = y === 0 ? 20 : y === 4 ? -26 : 0;
        setPixel(px, x, y, [dark[0] + g + shade, dark[1] + g + shade, dark[2] + g + shade]);
      } else if (x < 4 || x >= S - 4) {
        // Legs.
        const shade = x === 0 || x === S - 4 ? 14 : x === 3 || x === S - 1 ? -18 : 0;
        setPixel(px, x, y, [dark[0] + g + shade, dark[1] + g + shade, dark[2] + g + shade]);
      } else if (y >= 8 && y < 26) {
        // Two drawers, 11 pixels wide, with a bevel.
        const dx = (x - 5) % 11;
        const dy = y - 8;
        if (x >= 5 && x < 27) {
          const c = mix(drawerDark, drawerLight, tint[y * S + x]);
          let bevel = 0;
          if (dx === 0 || dy === 0) bevel = 22;
          if (dx === 10 || dy === 17) bevel = -34;
          setPixel(px, x, y, [c[0] + g + bevel, c[1] + g + bevel, c[2] + g + bevel]);
        }
      }
    }
  }
  // Drawer pulls: a short metal bar with a shadow.
  for (const cx of [10, 21]) {
    for (let k = -2; k <= 2; k++) {
      setPixel(px, cx + k, 16, [206, 208, 214]);
      setPixel(px, cx + k, 17, [70, 60, 52]);
    }
  }
  return px;
}

const STONE_BRICK_DARK: Rgb = [104, 106, 112];
const STONE_BRICK_LIGHT: Rgb = [152, 154, 160];

/**
 * Stone bricks: large dressed blocks, two courses of 16 pixels, the upper one shifted by
 * half a block. `joint` darkens the grooves between them.
 */
function paintStoneBricks(rng: Rng): Uint8ClampedArray {
  const px = createTile();
  const groove: Rgb = [62, 63, 68];
  const tint = blotches(rng, 8);
  const rowHeight = 16;
  const width = 16;
  for (let row = 0; row < S / rowHeight; row++) {
    const offset = row % 2 === 0 ? 0 : width / 2;
    const tones = [rng(), rng()];
    for (let y = row * rowHeight; y < (row + 1) * rowHeight; y++) {
      for (let x = 0; x < S; x++) {
        const bx = wrap(x - offset);
        const inX = bx % width;
        const inY = y % rowHeight;
        const g = (rng() - 0.5) * 14;
        if (inY === rowHeight - 1 || inX === width - 1) {
          setPixel(px, x, y, [groove[0] + g, groove[1] + g, groove[2] + g]);
          continue;
        }
        const tone = tones[Math.floor(bx / width)] * 0.45 + tint[y * S + x] * 0.55;
        const c = mix(STONE_BRICK_DARK, STONE_BRICK_LIGHT, tone);
        let bevel = 0;
        if (inY === 0 || inX === 0) bevel = 18;
        if (inY === rowHeight - 2 || inX === width - 2) bevel = -22;
        setPixel(px, x, y, [c[0] + g + bevel, c[1] + g + bevel, c[2] + g + bevel]);
      }
    }
  }
  // A few chips and hairline cracks.
  for (let i = 0; i < 10; i++) {
    const x = Math.floor(rng() * S);
    const y = Math.floor(rng() * S);
    shadePixel(px, x, y, -26);
    shadePixel(px, x + 1, y + 1, -20);
  }
  return px;
}

/** Furnace top: stone bricks seen from above with a round, sooty flue in the middle. */
function paintFurnaceTop(rng: Rng): Uint8ClampedArray {
  const px = paintStoneBricks(rng);
  const c0 = (S - 1) / 2;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const d = Math.hypot(x - c0, y - c0);
      if (d < 6) {
        const g = (rng() - 0.5) * 10;
        setPixel(px, x, y, [20 + g, 18 + g, 18 + g]);
      } else if (d < 8) {
        // An iron ring around the flue, lit from the upper left.
        const lit = x + y < S - 1 ? 26 : -12;
        const g = (rng() - 0.5) * 8 + lit;
        setPixel(px, x, y, [86 + g, 88 + g, 96 + g]);
      } else if (d < 11) {
        shadePixel(px, x, y, -24 + (d - 8) * 6);
      }
    }
  }
  return px;
}

/**
 * Furnace side: stone bricks with an arched fire opening. Embers glow at the bottom of
 * the opening and the stone above it is blackened by soot.
 */
function paintFurnaceSide(rng: Rng): Uint8ClampedArray {
  const px = paintStoneBricks(rng);
  const left = 8;
  const right = 23;
  const top = 12;
  const bottom = 27;
  const mid = (left + right) / 2;
  const half = (right - left) / 2;
  const inside = (x: number, y: number, grow: number): boolean => {
    if (x < left - grow || x > right + grow || y > bottom + grow) return false;
    const arch = top + half;
    if (y >= arch) return true;
    return Math.hypot(x - mid, y - arch) <= half + grow;
  };
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      if (inside(x, y, 0)) {
        // Dark inside, embers towards the bottom.
        const depth = (y - (bottom - 7)) / 7;
        const g = (rng() - 0.5) * 10;
        if (depth > 0 && rng() < 0.35 + depth * 0.6) {
          const hot = rng();
          setPixel(px, x, y, [222 + hot * 30, 96 + hot * 110 * depth, 22 + hot * 30]);
        } else {
          setPixel(px, x, y, [26 + g, 20 + g, 18 + g]);
        }
      } else if (inside(x, y, 2)) {
        // An iron frame around the opening.
        const lit = y < top + 4 ? 20 : 0;
        const g = (rng() - 0.5) * 8 + lit;
        setPixel(px, x, y, [70 + g, 72 + g, 80 + g]);
      } else if (y < top + 2 && Math.abs(x - mid) < half + 4) {
        // Soot above the opening, fading upwards.
        shadePixel(px, x, y, -34 * Math.max(0, (y + 2) / (top + 4)));
      }
    }
  }
  return px;
}

/** Iron block: a brushed plate with a bevelled rim and a rivet in every corner. */
function paintIronBlock(rng: Rng): Uint8ClampedArray {
  const px = baseCoat(rng, [176, 182, 192], [214, 220, 228], 6);
  // Brushed metal: faint horizontal streaks.
  for (let y = 0; y < S; y++) {
    const streak = (rng() - 0.5) * 14;
    for (let x = 0; x < S; x++) shadePixel(px, x, y, streak);
  }
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const edge = Math.min(x, y, S - 1 - x, S - 1 - y);
      if (edge === 0) shadePixel(px, x, y, x === 0 || y === 0 ? 26 : -50);
      else if (edge === 1) shadePixel(px, x, y, x === 1 || y === 1 ? 14 : -30);
      else if (edge === 4) shadePixel(px, x, y, x === 4 || y === 4 ? -22 : 16);
    }
  }
  for (const [cx, cy] of [
    [7, 7],
    [S - 9, 7],
    [7, S - 9],
    [S - 9, S - 9],
  ]) {
    setPixel(px, cx, cy, [236, 240, 246]);
    setPixel(px, cx + 1, cy, [150, 156, 168]);
    setPixel(px, cx, cy + 1, [150, 156, 168]);
    setPixel(px, cx + 1, cy + 1, [104, 110, 122]);
  }
  return px;
}

/** Painters indexed by tile id. */
export const TILE_PAINTERS: readonly TilePainter[] = (() => {
  const painters: TilePainter[] = [];
  painters[Tile.GRASS_TOP] = paintGrassTop;
  painters[Tile.GRASS_SIDE] = paintGrassSide;
  painters[Tile.DIRT] = paintDirt;
  painters[Tile.STONE] = paintStone;
  painters[Tile.SAND] = paintSand;
  painters[Tile.LOG_END] = paintLogEnd;
  painters[Tile.LOG_BARK] = paintLogBark;
  painters[Tile.LEAVES] = paintLeaves;
  painters[Tile.PLANKS] = paintPlanks;
  painters[Tile.BRICKS] = paintBricks;
  painters[Tile.GLASS] = paintGlass;
  painters[Tile.WATER] = paintWater;
  painters[Tile.BEDROCK] = paintBedrock;
  painters[Tile.COAL_ORE] = paintCoalOre;
  painters[Tile.IRON_ORE] = paintIronOre;
  painters[Tile.CLAY] = paintClay;
  painters[Tile.WORKBENCH_TOP] = paintWorkbenchTop;
  painters[Tile.WORKBENCH_SIDE] = paintWorkbenchSide;
  painters[Tile.FURNACE_SIDE] = paintFurnaceSide;
  painters[Tile.FURNACE_TOP] = paintFurnaceTop;
  painters[Tile.STONE_BRICKS] = paintStoneBricks;
  painters[Tile.IRON_BLOCK] = paintIronBlock;
  return painters;
})();

/** Paints one tile with its fixed seed. Row 0 of the result is the top of the image. */
export function paintTile(tile: number): Uint8ClampedArray {
  const painter = TILE_PAINTERS[tile];
  if (!painter) throw new Error(`No painter for tile ${tile}`);
  return painter(mulberry32(deriveSeed(TEXTURE_SEED, tile)));
}

/** All tiles, painted once per call. */
export function paintAllTiles(): Uint8ClampedArray[] {
  return Array.from({ length: TILE_COUNT }, (_, tile) => paintTile(tile));
}
