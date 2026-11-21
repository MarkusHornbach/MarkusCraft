// The player figure's texture (Phase 6 part D): a pure painter that writes every look into
// one RGBA atlas, one texel per figure texel, in a layout of this game's own. No canvas.
import { FIGURE_ARM, FIGURE_BODY, FIGURE_HEAD, FIGURE_LEG, TEXTURE_SEED } from '../../game/config';
import { LOOKS, type Look, type Rgb, lookById } from '../../player/looks';
import { deriveSeed, mulberry32 } from '../../util/rng';

/** Width and height of the atlas in texels. */
export const FIGURE_ATLAS_SIZE = 128;
/** Each look takes a cell of this size; two cells per row. */
const CELL_W = 64;
const CELL_H = 32;

export type FigurePart = 'head' | 'body' | 'arm' | 'leg';
/** The faces of a part, in the order they lie side by side in the atlas. */
export type FaceName = 'front' | 'back' | 'right' | 'left' | 'top' | 'bottom';
export const FACE_NAMES: readonly FaceName[] = ['front', 'back', 'right', 'left', 'top', 'bottom'];

/** A face's rectangle in a look's cell, in texels: `u`, `v` from the cell's top left. */
export interface FaceRect {
  u: number;
  v: number;
  w: number;
  h: number;
}

/** Size (width × height × depth) of a part and where its row of faces starts in a cell. */
export const PART_LAYOUT: Readonly<
  Record<FigurePart, { size: readonly [number, number, number]; u: number; v: number }>
> = {
  head: { size: FIGURE_HEAD, u: 0, v: 0 },
  body: { size: FIGURE_BODY, u: 0, v: FIGURE_HEAD[1] },
  arm: { size: FIGURE_ARM, u: 0, v: FIGURE_HEAD[1] + FIGURE_BODY[1] },
  leg: {
    size: FIGURE_LEG,
    u: 4 * FIGURE_ARM[0] + 2 * FIGURE_ARM[2],
    v: FIGURE_HEAD[1] + FIGURE_BODY[1],
  },
};

/**
 * The six faces of a part side by side: front and back (width × height), right and left
 * (depth × height), top and bottom (width × depth). Each face is seen from outside, its
 * top row up (top and bottom: the front edge down).
 */
export function faceRect(part: FigurePart, face: FaceName): FaceRect {
  const { size, u, v } = PART_LAYOUT[part];
  const [w, h, d] = size;
  switch (face) {
    case 'front':
      return { u, v, w, h };
    case 'back':
      return { u: u + w, v, w, h };
    case 'right':
      return { u: u + 2 * w, v, w: d, h };
    case 'left':
      return { u: u + 2 * w + d, v, w: d, h };
    case 'top':
      return { u: u + 2 * w + 2 * d, v, w, h: d };
    case 'bottom':
      return { u: u + 3 * w + 2 * d, v, w, h: d };
  }
}

/** Top left of a look's cell in the atlas. */
export function lookOrigin(id: number): { u: number; v: number } {
  const index = Math.max(
    0,
    LOOKS.findIndex((l) => l.id === id),
  );
  return { u: (index % 2) * CELL_W, v: Math.floor(index / 2) * CELL_H };
}

export interface FigureAtlas {
  size: number;
  /** RGBA, row 0 at the top; every texel a part uses is opaque. */
  pixels: Uint8ClampedArray;
  /** 1 where the texel is accent (the belt): the slot colour tints it. */
  accent: Uint8Array;
}

/** What a face's texel is: a colour, and whether the slot colour tints it. */
type Paint = { color: Rgb; accent?: boolean; noise?: number };
type FacePainter = (face: FaceName, u: number, v: number, w: number, h: number) => Paint;

const EYE: Rgb = [38, 30, 34];
const BUCKLE: Rgb = [206, 190, 130];
/** The belt is painted grey; the shader multiplies it with the slot colour. */
const BELT: Rgb = [214, 214, 214];

function scale(c: Rgb, f: number): Rgb {
  return [c[0] * f, c[1] * f, c[2] * f];
}

/** Paints every look into a new atlas. Deterministic: the same texels every time. */
export function paintFigureAtlas(): FigureAtlas {
  const size = FIGURE_ATLAS_SIZE;
  const pixels = new Uint8ClampedArray(size * size * 4);
  const accent = new Uint8Array(size * size);
  for (const look of LOOKS) {
    const rng = mulberry32(deriveSeed(TEXTURE_SEED, 0x0f19 + look.id));
    const origin = lookOrigin(look.id);
    const parts: [FigurePart, FacePainter][] = [
      ['head', headPainter(look)],
      ['body', bodyPainter(look)],
      ['arm', armPainter(look)],
      ['leg', legPainter(look)],
    ];
    for (const [part, painter] of parts) {
      for (const face of FACE_NAMES) {
        const r = faceRect(part, face);
        for (let v = 0; v < r.h; v++) {
          for (let u = 0; u < r.w; u++) {
            const paint = painter(face, u, v, r.w, r.h);
            const x = origin.u + r.u + u;
            const y = origin.v + r.v + v;
            const i = y * size + x;
            const n = ((rng() * 2 - 1) * (paint.noise ?? 5)) | 0;
            pixels[i * 4] = paint.color[0] + n;
            pixels[i * 4 + 1] = paint.color[1] + n;
            pixels[i * 4 + 2] = paint.color[2] + n;
            pixels[i * 4 + 3] = 255;
            accent[i] = paint.accent ? 1 : 0;
          }
        }
      }
    }
  }
  return { size, pixels, accent };
}

/** Whether a texel of the head shows hair for this style. */
function isHair(look: Look, face: FaceName, u: number, v: number, w: number): boolean {
  const style = look.hairStyle;
  if (face === 'top') return true;
  if (face === 'bottom') return false;
  const last = w - 1;
  if (face === 'front') {
    if (v === 0) return true;
    if (style === 'crop') return false;
    if (v === 1) return u <= (style === 'short' ? 1 : 0) || u >= last - (style === 'short' ? 1 : 0);
    // Long hair falls past the face at both sides.
    return style === 'long' && (u === 0 || u === last);
  }
  if (face === 'back') {
    if (style === 'long') return true;
    return v <= (style === 'crop' ? 2 : 4);
  }
  // Sides: the back of the right face is its left edge, of the left face its right edge.
  const fromBack = face === 'right' ? u : last - u;
  if (style === 'crop') return v <= 1;
  if (style === 'long') return v <= 1 || fromBack <= 3;
  return v <= 2 || (style === 'short' && v <= 4 && fromBack <= 2);
}

function headPainter(look: Look): FacePainter {
  return (face, u, v, w) => {
    if (isHair(look, face, u, v, w)) {
      // A bun: a darker knot at the back of the head.
      const knot =
        look.hairStyle === 'bun' && face === 'back' && u >= 2 && u <= 4 && v >= 1 && v <= 3;
      return { color: knot ? scale(look.hair, 0.78) : look.hair, noise: 9 };
    }
    if (face === 'front') {
      if (v === 3 && (u === 2 || u === 4)) return { color: EYE, noise: 2 };
      if (v === 5 && u === 3) return { color: scale(look.skin, 0.66), noise: 2 };
      if (v === 5 && (u === 2 || u === 4)) return { color: scale(look.skin, 0.84), noise: 2 };
    }
    return { color: face === 'bottom' ? scale(look.skin, 0.9) : look.skin, noise: 3 };
  };
}

/** Rows of the body above the belt. */
const TOP_ROWS = FIGURE_BODY[1] - 2;

function bodyPainter(look: Look): FacePainter {
  return (face, u, v, w) => {
    if (face === 'top') return { color: look.top };
    if (face === 'bottom') return { color: look.legs };
    if (v >= TOP_ROWS) {
      if (face === 'front' && (u === w / 2 - 1 || u === w / 2)) return { color: BUCKLE, noise: 4 };
      return { color: BELT, accent: true, noise: 6 };
    }
    return { color: topColour(look, face, u, v, w) };
  };
}

function topColour(look: Look, face: FaceName, u: number, v: number, w: number): Rgb {
  switch (look.pattern) {
    case 'stripes':
      return v % 3 === 2 ? look.topDetail : look.top;
    case 'vest':
      return face === 'front' && (u === w / 2 - 1 || u === w / 2) ? look.topDetail : look.top;
    case 'collar':
      if (face === 'front' && v === 0 && u >= 2 && u <= w - 3) return look.topDetail;
      if (face === 'front' && v === 1 && u >= 3 && u <= w - 4) return look.topDetail;
      if (face === 'back' && v === 0) return look.topDetail;
      return look.top;
    case 'plain':
      return look.top;
  }
}

function armPainter(look: Look): FacePainter {
  const sleeve = look.longSleeves ? FIGURE_ARM[1] - 2 : 4;
  return (face, _u, v) => {
    if (face === 'top') return { color: look.top };
    if (face === 'bottom') return { color: scale(look.skin, 0.9), noise: 3 };
    if (v < sleeve) {
      const stripe = look.pattern === 'stripes' && v % 3 === 2;
      return { color: stripe ? look.topDetail : look.top };
    }
    return { color: look.skin, noise: 3 };
  };
}

function legPainter(look: Look): FacePainter {
  const shoeFrom = FIGURE_LEG[1] - 2;
  const clothTo = look.legStyle === 'skirt' ? 5 : shoeFrom;
  return (face, _u, v) => {
    if (face === 'top') return { color: look.legs };
    if (face === 'bottom') return { color: scale(look.shoes, 0.8), noise: 3 };
    if (v >= shoeFrom) return { color: look.shoes, noise: 4 };
    if (v < clothTo) return { color: look.legs };
    return { color: look.skin, noise: 3 };
  };
}

/** The front of a look's head (7 × 7 RGBA), for the picker and the player list. */
export function headIcon(atlas: FigureAtlas, id: number): Uint8ClampedArray {
  const r = faceRect('head', 'front');
  const o = lookOrigin(lookById(id).id);
  const out = new Uint8ClampedArray(r.w * r.h * 4);
  for (let v = 0; v < r.h; v++) {
    for (let u = 0; u < r.w; u++) {
      const from = ((o.v + r.v + v) * atlas.size + o.u + r.u + u) * 4;
      out.set(atlas.pixels.subarray(from, from + 4), (v * r.w + u) * 4);
    }
  }
  return out;
}

/** Width and height of `figureView` in pixels: two pixels per texel (the head is odd). */
export const FIGURE_VIEW_W = 2 * (FIGURE_BODY[0] + 2 * FIGURE_ARM[0]);
export const FIGURE_VIEW_H = 2 * (FIGURE_HEAD[1] + FIGURE_BODY[1] + FIGURE_LEG[1]);

/**
 * A look seen straight from the front or the back without perspective (RGBA,
 * `FIGURE_VIEW_W` × `FIGURE_VIEW_H`, transparent around the figure): the figure sheet.
 * The accent is shown in `accent`.
 */
export function figureView(
  atlas: FigureAtlas,
  id: number,
  side: 'front' | 'back',
  accentColor: Rgb,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(FIGURE_VIEW_W * FIGURE_VIEW_H * 4);
  const o = lookOrigin(lookById(id).id);
  const face: FaceName = side;
  const draw = (part: FigurePart, x: number, y: number): void => {
    const r = faceRect(part, face);
    for (let py = 0; py < r.h * 2; py++) {
      for (let px = 0; px < r.w * 2; px++) {
        const i = (o.v + r.v + (py >> 1)) * atlas.size + o.u + r.u + (px >> 1);
        const to = ((y + py) * FIGURE_VIEW_W + x + px) * 4;
        const tint = atlas.accent[i] === 1;
        for (let c = 0; c < 3; c++) {
          const v = atlas.pixels[i * 4 + c];
          out[to + c] = tint ? (v * accentColor[c]) / 255 : v;
        }
        out[to + 3] = 255;
      }
    }
  };
  const arm = 2 * FIGURE_ARM[0];
  const body = 2 * FIGURE_BODY[0];
  const headH = 2 * FIGURE_HEAD[1];
  const bodyH = 2 * FIGURE_BODY[1];
  draw('head', arm + (body - 2 * FIGURE_HEAD[0]) / 2, 0);
  draw('body', arm, headH);
  draw('arm', 0, headH);
  draw('arm', arm + body, headH);
  draw('leg', arm, headH + bodyH);
  draw('leg', arm + body / 2, headH + bodyH);
  return out;
}

/** FNV-1a over the texels and the accent mask: changes only with the looks or the painter. */
export function figureAtlasChecksum(atlas: FigureAtlas): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < atlas.pixels.length; i++) h = Math.imul(h ^ atlas.pixels[i], 0x01000193);
  for (let i = 0; i < atlas.accent.length; i++) h = Math.imul(h ^ atlas.accent[i], 0x01000193);
  return h >>> 0;
}
