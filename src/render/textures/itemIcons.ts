// Icon painters for items that are not blocks: pure functions from an RNG to RGBA pixels.
import { TEXTURE_SEED } from '../../game/config';
import { Item } from '../../items/items';
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

/** Painters by item id. Part C appends the other items. */
const ICON_PAINTERS = new Map<number, IconPainter>([[Item.COAL, paintCoal]]);

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
