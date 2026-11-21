// Phase 6 part D: the figure painter — deterministic, opaque, accent on every body, looks apart.
import { describe, expect, it } from 'vitest';
import { LOOKS } from '../../player/looks';
import {
  FACE_NAMES,
  type FigurePart,
  faceRect,
  figureAtlasChecksum,
  headIcon,
  lookOrigin,
  paintFigureAtlas,
} from './figureTexture';

/** Recorded once in Phase 6 part D; changes only with an intended change of the looks. */
const FIGURE_ATLAS_CHECKSUM = 256304708;

const PARTS: FigurePart[] = ['head', 'body', 'arm', 'leg'];
const atlas = paintFigureAtlas();

/** Atlas indices of every texel of a part of a look. */
function texels(look: number, part: FigurePart): number[] {
  const o = lookOrigin(look);
  const out: number[] = [];
  for (const face of FACE_NAMES) {
    const r = faceRect(part, face);
    for (let v = 0; v < r.h; v++) {
      for (let u = 0; u < r.w; u++) out.push((o.v + r.v + v) * atlas.size + o.u + r.u + u);
    }
  }
  return out;
}

describe('figure texture', () => {
  it('Phase 6 AC11.2: the painter is deterministic (recorded checksum)', () => {
    expect(figureAtlasChecksum(paintFigureAtlas())).toBe(figureAtlasChecksum(atlas));
    expect(figureAtlasChecksum(atlas)).toBe(FIGURE_ATLAS_CHECKSUM);
  });

  it('Phase 6 AC11.2: every texel a part uses is opaque; every body has accent texels', () => {
    for (const look of LOOKS) {
      for (const part of PARTS) {
        for (const i of texels(look.id, part)) expect(atlas.pixels[i * 4 + 3]).toBe(255);
      }
      const accent = texels(look.id, 'body').filter((i) => atlas.accent[i] === 1);
      expect(accent.length).toBeGreaterThan(20);
      for (const part of ['head', 'arm', 'leg'] as const) {
        expect(texels(look.id, part).some((i) => atlas.accent[i] === 1)).toBe(false);
      }
    }
  });

  it('Phase 6 AC11.2: head and body of any two looks differ in at least 20 % of texels', () => {
    const differ = (a: number, b: number): boolean => {
      let d = 0;
      for (let c = 0; c < 3; c++) d += Math.abs(atlas.pixels[a * 4 + c] - atlas.pixels[b * 4 + c]);
      return d > 30;
    };
    for (const a of LOOKS) {
      for (const b of LOOKS) {
        if (a.id >= b.id) continue;
        for (const part of ['head', 'body'] as const) {
          const ta = texels(a.id, part);
          const tb = texels(b.id, part);
          const share = ta.filter((t, k) => differ(t, tb[k])).length / ta.length;
          expect(share, `${a.name} / ${b.name}, ${part}`).toBeGreaterThanOrEqual(0.2);
        }
      }
    }
  });

  it('the faces of a look fit its cell and do not overlap', () => {
    const seen = new Set<number>();
    for (const part of PARTS) {
      for (const i of texels(1, part)) {
        expect(seen.has(i)).toBe(false);
        seen.add(i);
      }
    }
    const o = lookOrigin(8);
    expect(o.u + 42).toBeLessThanOrEqual(atlas.size);
    expect(o.v + 29).toBeLessThanOrEqual(atlas.size);
  });

  it('the head icon is the front of the head', () => {
    const icon = headIcon(atlas, 2);
    expect(icon.length).toBe(7 * 7 * 4);
    const o = lookOrigin(2);
    const at = (o.v * atlas.size + o.u) * 4;
    expect(Array.from(icon.subarray(0, 4))).toEqual(Array.from(atlas.pixels.subarray(at, at + 4)));
  });
});
