// Icon painters for items that are not blocks: pure functions from an RNG to RGBA pixels.
import { TEXTURE_SEED } from '../../game/config';
import { ITEMS, Item, type ToolClass, type ToolTier } from '../../items/items';
import { type Rng, deriveSeed, mulberry32 } from '../../util/rng';

/** Icons are square, this many pixels wide, with a transparent background. */
export const ITEM_ICON_SIZE = 32;

export type IconPainter = (rng: Rng) => Uint8ClampedArray;
type Rgb = readonly [number, number, number];

const S = ITEM_ICON_SIZE;

function setPixel(px: Uint8ClampedArray, x: number, y: number, c: Rgb): void {
  if (x < 0 || y < 0 || x >= S || y >= S) return;
  const i = (y * S + x) * 4;
  px[i] = c[0];
  px[i + 1] = c[1];
  px[i + 2] = c[2];
  px[i + 3] = 255;
}

function isSet(px: Uint8ClampedArray, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < S && y < S && px[(y * S + x) * 4 + 3] !== 0;
}

/** Draws a dark rim around everything painted so far, so the icon reads on any slot. */
function outline(px: Uint8ClampedArray, colour: Rgb): void {
  const rim: [number, number][] = [];
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      if (isSet(px, x, y)) continue;
      if (isSet(px, x - 1, y) || isSet(px, x + 1, y) || isSet(px, x, y - 1) || isSet(px, x, y + 1))
        rim.push([x, y]);
    }
  }
  for (const [x, y] of rim) setPixel(px, x, y, colour);
}

/**
 * Coal: a lump with an uneven edge, lit from the upper left. Flat facets with a few
 * bright glints make it read as a hard, shiny mineral rather than a dark ball.
 */
function paintCoal(rng: Rng): Uint8ClampedArray {
  const px = new Uint8ClampedArray(S * S * 4);
  const cx = 15.5;
  const cy = 16.5;
  // The radius changes from corner to corner: an angular outline.
  const corners = 9;
  const radii: number[] = [];
  for (let i = 0; i < corners; i++) radii.push(9.5 + rng() * 3.5);
  const dark: Rgb = [24, 24, 30];
  const mid: Rgb = [46, 47, 56];
  const light: Rgb = [84, 86, 100];
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const dx = x - cx;
      const dy = (y - cy) * 1.18;
      const angle = (Math.atan2(dy, dx) / (Math.PI * 2) + 1) % 1;
      const at = angle * corners;
      const i0 = Math.floor(at) % corners;
      const t = at - Math.floor(at);
      const radius = radii[i0] + (radii[(i0 + 1) % corners] - radii[i0]) * t;
      const d = Math.hypot(dx, dy);
      if (d > radius) continue;
      // Facets: bands across the lump, brighter towards the upper left.
      const facet = Math.floor((dx * 0.8 + dy * 1.3 + 40) / 5);
      const lit = -dx - dy * 1.2 > 4 ? 1 : 0;
      const tone = facet % 2 === 0 ? (lit ? light : mid) : lit ? mid : dark;
      setPixel(px, x, y, tone);
    }
  }
  // Glints on the lit side.
  for (let i = 0; i < 5; i++) {
    const x = Math.floor(cx - 7 + rng() * 9);
    const y = Math.floor(cy - 7 + rng() * 8);
    if (!isSet(px, x, y)) continue;
    setPixel(px, x, y, [168, 172, 190]);
    if (isSet(px, x + 1, y)) setPixel(px, x + 1, y, [120, 124, 142]);
  }
  outline(px, [8, 8, 10]);
  return px;
}

/** Fills every pixel whose centre satisfies `inside`, with the colour `tone` gives it. */
function fill(
  px: Uint8ClampedArray,
  inside: (x: number, y: number) => boolean,
  tone: (x: number, y: number) => Rgb,
): void {
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      if (inside(x, y)) setPixel(px, x, y, tone(x, y));
    }
  }
}

const WOOD_DARK: Rgb = [84, 56, 32];
const WOOD_MID: Rgb = [124, 88, 52];
const WOOD_LIGHT: Rgb = [164, 122, 76];
const RIM: Rgb = [20, 14, 10];

/**
 * A wooden shaft from the lower left to the upper right, `width` pixels thick. Positions
 * along it run from 0 (lower end) to 1; the upper-left edge is lit.
 */
function shaft(
  px: Uint8ClampedArray,
  rng: Rng,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  width: number,
): void {
  const length = Math.hypot(x1 - x0, y1 - y0);
  const ux = (x1 - x0) / length;
  const uy = (y1 - y0) / length;
  // One tone per two pixels along the shaft: the grain of the wood.
  const grain: number[] = [];
  for (let i = 0; i < length / 2 + 2; i++) grain.push(rng());
  fill(
    px,
    (x, y) => {
      const a = (x - x0) * ux + (y - y0) * uy;
      const b = (x - x0) * -uy + (y - y0) * ux;
      return a >= 0 && a <= length && Math.abs(b) <= width / 2;
    },
    (x, y) => {
      const a = (x - x0) * ux + (y - y0) * uy;
      const b = (x - x0) * -uy + (y - y0) * ux;
      if (b < -width / 2 + 1) return WOOD_LIGHT;
      if (b > width / 2 - 1) return WOOD_DARK;
      return grain[Math.floor(a / 2)] < 0.3 ? WOOD_DARK : WOOD_MID;
    },
  );
}

/** A stick: a thick twig with a stub where a side branch was cut off. */
function paintStick(rng: Rng): Uint8ClampedArray {
  const px = new Uint8ClampedArray(S * S * 4);
  shaft(px, rng, 5.5, 26.5, 26.5, 5.5, 5);
  shaft(px, rng, 15.5, 16.5, 19.5, 20.5, 3);
  outline(px, RIM);
  return px;
}

/** An ingot: a flat bar with slanted ends, seen from above the front edge. */
function paintIronIngot(rng: Rng): Uint8ClampedArray {
  const px = new Uint8ClampedArray(S * S * 4);
  const top: Rgb = [226, 232, 240];
  const front: Rgb = [164, 172, 186];
  const side: Rgb = [116, 124, 140];
  fill(
    px,
    (x, y) => {
      // The top face is a parallelogram leaning right; the front face hangs below it.
      if (y >= 9 && y <= 16) return x >= 6 + (16 - y) * 0.7 && x <= 21 + (16 - y) * 0.7 + 4;
      if (y > 16 && y <= 23) return x >= 6 - (y - 16) * 0.3 && x <= 25 + (y - 16) * 0.3;
      return false;
    },
    (x, y) => {
      const g = Math.round((rng() - 0.5) * 10);
      if (y <= 16) {
        // A bright streak across the top face.
        const streak = Math.abs(x - y * 0.9 - 4) < 1.2 ? 14 : 0;
        return [top[0] + g + streak, top[1] + g + streak, top[2] + g + streak];
      }
      const c = x > 21 + (y - 16) * 0.3 ? side : front;
      const shade = y === 17 ? 20 : y === 23 ? -24 : 0;
      return [c[0] + g + shade, c[1] + g + shade, c[2] + g + shade];
    },
  );
  outline(px, [34, 38, 48]);
  return px;
}

/** Dark, middle and light tone of a tool head, by tier (1 wood, 2 stone, 3 iron). */
export const TOOL_HEAD_COLOURS: Readonly<Record<ToolTier, readonly [Rgb, Rgb, Rgb]>> = {
  1: [
    [132, 94, 50],
    [182, 138, 78],
    [220, 180, 116],
  ],
  2: [
    [88, 90, 96],
    [128, 130, 138],
    [172, 174, 182],
  ],
  3: [
    [170, 180, 196],
    [212, 222, 234],
    [248, 251, 255],
  ],
};

// Tool heads are described along the shaft: `a` runs up the shaft from the head's
// centre, `b` to the upper-left side of it.
const U: readonly [number, number] = [Math.SQRT1_2, -Math.SQRT1_2];
const V: readonly [number, number] = [-Math.SQRT1_2, -Math.SQRT1_2];

type HeadShape = (a: number, b: number) => boolean;

/** The head of each tool class and where its centre sits on the icon. */
const HEADS: Readonly<Record<ToolClass, { cx: number; cy: number; shape: HeadShape }>> = {
  // A curved bar across the end of the shaft, thick in the middle, pointed at both ends.
  pickaxe: {
    cx: 21.5,
    cy: 10.5,
    shape: (a, b) => {
      // An arc around a point far down the shaft.
      const r = Math.hypot(a + 19, b);
      const along = Math.atan2(b, a + 19) / 0.72;
      return Math.abs(along) <= 1 && Math.abs(r - 19) <= 3.1 - 2 * Math.abs(along);
    },
  },
  // A blade on one side of the shaft that flares towards a curved edge.
  axe: {
    cx: 20.5,
    cy: 11.5,
    shape: (a, b) =>
      b >= -3 && Math.abs(a) <= 3.2 + Math.max(0, b) * 0.5 && b <= 10.5 - (a * a) / 26,
  },
  // A flat blade in line with the shaft: straight shoulders, rounded tip.
  shovel: {
    cx: 21.5,
    cy: 10.5,
    shape: (a, b) => {
      if (a < -5.5 || Math.abs(b) > 5.6) return false;
      if (a <= 1.5) return true;
      const t = (a - 1.5) / 6;
      return t <= 1 && Math.abs(b) <= 5.6 * Math.sqrt(1 - t * t);
    },
  },
};

/** A tool: a wooden shaft with the head of its class in the colour of its tier. */
function toolPainter(cls: ToolClass, tier: ToolTier): IconPainter {
  return (rng) => {
    const px = new Uint8ClampedArray(S * S * 4);
    const head = HEADS[cls];
    const [dark, mid, light] = TOOL_HEAD_COLOURS[tier];
    shaft(px, rng, 4.5, 27.5, head.cx + 0.5, head.cy - 0.5, 3);
    const local = (x: number, y: number): [number, number] => {
      const dx = x - head.cx;
      const dy = y - head.cy;
      return [dx * U[0] + dy * U[1], dx * V[0] + dy * V[1]];
    };
    fill(
      px,
      (x, y) => head.shape(...local(x, y)),
      (x, y) => {
        // Lit from the upper left; a pixel is light if the head ends just above it.
        const above = head.shape(...local(x - 1, y - 1));
        const below = head.shape(...local(x + 1, y + 1));
        if (!above) return light;
        if (!below) return dark;
        return rng() < 0.12 ? dark : mid;
      },
    );
    outline(px, RIM);
    return px;
  };
}

/** Painters by item id. */
const ICON_PAINTERS = new Map<number, IconPainter>([
  [Item.COAL, paintCoal],
  [Item.STICK, paintStick],
  [Item.IRON_INGOT, paintIronIngot],
]);
for (const item of ITEMS) {
  if (item.tool) ICON_PAINTERS.set(item.id, toolPainter(item.tool.class, item.tool.tier));
}

/** Ids of the items that have a painted icon. */
export const ICON_ITEMS: readonly number[] = [...ICON_PAINTERS.keys()];

/**
 * Paints the icon of an item with its fixed seed, or returns null if the item has none
 * (blocks are drawn as cubes from their tiles). Row 0 of the result is the top.
 */
export function paintItemIcon(item: number): Uint8ClampedArray | null {
  const painter = ICON_PAINTERS.get(item);
  return painter ? painter(mulberry32(deriveSeed(TEXTURE_SEED, 1000 + item))) : null;
}
