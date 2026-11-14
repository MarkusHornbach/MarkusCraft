import { describe, expect, it } from 'vitest';
import { ITEMS, Item } from '../../items/items';
import { ICON_ITEMS, ITEM_ICON_SIZE, paintItemIcon } from './itemIcons';

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
      expect(share).toBeGreaterThan(0.2);
      expect(share).toBeLessThan(0.8);
      // The corners stay clear: the icon is a shape, not a tile.
      expect(a[3]).toBe(0);
      expect(a[a.length - 1]).toBe(0);
    }
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
