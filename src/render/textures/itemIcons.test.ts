import { describe, expect, it } from 'vitest';
import { ITEMS, Item, TOOL_CLASSES, TOOL_TIERS } from '../../items/items';
import { ICON_ITEMS, ITEM_ICON_SIZE, TOOL_HEAD_COLOURS, paintItemIcon } from './itemIcons';

const PIXELS = ITEM_ICON_SIZE * ITEM_ICON_SIZE;

function icon(item: number): Uint8ClampedArray {
  const px = paintItemIcon(item);
  if (!px) throw new Error(`item ${item} has no icon`);
  return px;
}

/** Number of pixels in which two icons differ. */
function difference(a: Uint8ClampedArray, b: Uint8ClampedArray): number {
  let count = 0;
  for (let i = 0; i < a.length; i += 4) {
    if (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2] || a[i + 3] !== b[i + 3]) {
      count++;
    }
  }
  return count;
}

function countColour(px: Uint8ClampedArray, c: readonly [number, number, number]): number {
  let count = 0;
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] === 255 && px[i] === c[0] && px[i + 1] === c[1] && px[i + 2] === c[2]) count++;
  }
  return count;
}

describe('item icons', () => {
  it('has a painted icon for every item that is not a block, and for no block', () => {
    for (const item of ITEMS) {
      expect(paintItemIcon(item.id) !== null, item.name).toBe(item.block === null);
    }
    expect([...ICON_ITEMS].sort()).toEqual(
      ITEMS.filter((item) => item.block === null).map((item) => item.id),
    );
    expect(paintItemIcon(99999)).toBeNull();
  });

  it('paints the same pixels every time: 32 × 32, opaque shape on a clear background', () => {
    for (const item of ICON_ITEMS) {
      const a = paintItemIcon(item);
      const b = paintItemIcon(item);
      expect(a).not.toBeNull();
      if (!a || !b) continue;
      expect(a.length).toBe(ITEM_ICON_SIZE * ITEM_ICON_SIZE * 4);
      expect([...a]).toEqual([...b]);
      let opaque = 0;
      for (let i = 3; i < a.length; i += 4) {
        expect(a[i] === 0 || a[i] === 255).toBe(true);
        if (a[i] === 255) opaque++;
      }
      const share = opaque / (ITEM_ICON_SIZE * ITEM_ICON_SIZE);
      expect(share).toBeGreaterThan(0.15);
      expect(share).toBeLessThan(0.8);
      // The corners stay clear: the icon is a shape, not a tile.
      expect(a[3]).toBe(0);
      expect(a[a.length - 1]).toBe(0);
    }
  });

  it('every icon differs from every other in at least 10 % of its pixels (Phase 3 AC10.4)', () => {
    expect(ICON_ITEMS.length).toBe(12);
    for (const a of ICON_ITEMS) {
      for (const b of ICON_ITEMS) {
        if (a >= b) continue;
        expect(difference(icon(a), icon(b)) / PIXELS, `${a} against ${b}`).toBeGreaterThanOrEqual(
          0.1,
        );
      }
    }
  });

  it('the three tiers of a tool differ in the colour of their head (Phase 3 AC10.4)', () => {
    for (const cls of TOOL_CLASSES) {
      const tools = ITEMS.filter((item) => item.tool?.class === cls);
      expect(tools.map((item) => item.tool?.tier)).toEqual([...TOOL_TIERS]);
      for (const item of tools) {
        if (!item.tool) continue;
        const px = icon(item.id);
        for (const tier of TOOL_TIERS) {
          const mid = countColour(px, TOOL_HEAD_COLOURS[tier][1]);
          // The head is painted in the tones of its own tier only.
          if (tier === item.tool.tier) expect(mid, item.name).toBeGreaterThan(40);
          else expect(mid, item.name).toBe(0);
        }
      }
      // The shaft is the same wood in all three.
      const [wood, stone, iron] = tools.map((item) => icon(item.id));
      let same = 0;
      for (let i = 0; i < wood.length; i += 4) {
        if (
          wood[i + 3] === 255 &&
          difference(wood.subarray(i, i + 4), stone.subarray(i, i + 4)) === 0
        )
          same++;
      }
      expect(same).toBeGreaterThan(60);
      expect(difference(stone, iron)).toBeGreaterThan(100);
    }
    // Brighter from wood to iron, and wood is the only warm one.
    const mid = TOOL_TIERS.map((tier) => TOOL_HEAD_COLOURS[tier][1]);
    expect(mid[0][0] - mid[0][2]).toBeGreaterThan(60);
    expect(Math.abs(mid[1][0] - mid[1][2])).toBeLessThan(20);
    expect(mid[2][0]).toBeGreaterThan(mid[1][0] + 50);
  });

  it('paints coal dark with a few bright glints', () => {
    const px = paintItemIcon(Item.COAL);
    expect(px).not.toBeNull();
    if (!px) return;
    let dark = 0;
    let bright = 0;
    let opaque = 0;
    for (let i = 0; i < px.length; i += 4) {
      if (px[i + 3] === 0) continue;
      opaque++;
      const lum = (px[i] + px[i + 1] + px[i + 2]) / 3;
      if (lum < 60) dark++;
      if (lum > 110) bright++;
    }
    expect(dark / opaque).toBeGreaterThan(0.5);
    expect(bright).toBeGreaterThan(0);
    expect(bright / opaque).toBeLessThan(0.1);
  });
});
