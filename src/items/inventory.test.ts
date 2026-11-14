import { describe, expect, it } from 'vitest';
import type { ItemStack } from '../actions/playerRecord';
import { HOTBAR_SLOTS, INVENTORY_SLOTS, STACK_SIZE } from '../game/config';
import { mulberry32, randInt } from '../util/rng';
import { Block } from '../world/blocks';
import {
  type Slots,
  addItems,
  countItems,
  emptySlot,
  fits,
  moveStack,
  removeItems,
  setSlot,
} from './inventory';
import { Item } from './items';

function empty(): Slots {
  return new Array<ItemStack | null>(INVENTORY_SLOTS).fill(null);
}

function withSlots(entries: Record<number, ItemStack>): Slots {
  const slots: (ItemStack | null)[] = [...empty()];
  for (const [index, stack] of Object.entries(entries)) slots[Number(index)] = stack;
  return slots;
}

describe('addItems (Phase 3 AC6.1)', () => {
  it('fills existing stacks first, then empty slots, bar first', () => {
    const start = withSlots({
      3: { item: Block.DIRT, count: 97 },
      20: { item: Block.DIRT, count: 98 },
      0: { item: Block.STONE, count: 5 },
    });
    const { slots, left } = addItems(start, Block.DIRT, 10);
    expect(left).toBe(0);
    expect(slots[3]).toEqual({ item: Block.DIRT, count: 99 });
    expect(slots[20]).toEqual({ item: Block.DIRT, count: 99 });
    // The remaining 7 go into the first empty slot, which is in the bar.
    expect(slots[1]).toEqual({ item: Block.DIRT, count: 7 });
    expect(slots[0]).toEqual({ item: Block.STONE, count: 5 });
    expect(1).toBeLessThan(HOTBAR_SLOTS);
  });

  it('never exceeds the stack size and reports what did not fit', () => {
    const big = addItems(empty(), Item.COAL, 250);
    expect(big.left).toBe(0);
    expect(big.slots.slice(0, 3)).toEqual([
      { item: Item.COAL, count: 99 },
      { item: Item.COAL, count: 99 },
      { item: Item.COAL, count: 52 },
    ]);
    const full: Slots = empty().map(() => ({ item: Block.STONE, count: STACK_SIZE }));
    expect(addItems(full, Block.STONE, 1)).toEqual({ slots: full, left: 1 });
    expect(addItems(full, Block.DIRT, 4).left).toBe(4);
    const nearly = setSlot(full, 35, { item: Block.DIRT, count: 97 });
    const result = addItems(nearly, Block.DIRT, 5);
    expect(result.left).toBe(3);
    expect(result.slots[35]).toEqual({ item: Block.DIRT, count: 99 });
  });

  it('does not change its input', () => {
    const start = withSlots({ 0: { item: Block.DIRT, count: 1 } });
    const copy = structuredClone(start);
    addItems(start, Block.DIRT, 500);
    expect(start).toEqual(copy);
  });

  it('fits() says whether everything would fit', () => {
    const full: Slots = empty().map(() => ({ item: Block.STONE, count: STACK_SIZE }));
    expect(fits(full, Block.STONE, 1)).toBe(false);
    expect(fits(setSlot(full, 7, { item: Block.DIRT, count: 98 }), Block.DIRT, 1)).toBe(true);
    expect(fits(setSlot(full, 7, { item: Block.DIRT, count: 98 }), Block.DIRT, 2)).toBe(false);
    expect(fits(setSlot(full, 7, null), Block.DIRT, 99)).toBe(true);
    expect(fits(empty(), Block.DIRT, INVENTORY_SLOTS * STACK_SIZE)).toBe(true);
    expect(fits(empty(), Block.DIRT, INVENTORY_SLOTS * STACK_SIZE + 1)).toBe(false);
  });

  it('keeps every count valid over 10 000 seeded random operations', () => {
    const rng = mulberry32(77);
    const items = [Block.DIRT, Block.STONE, Block.SAND, Item.COAL];
    let slots = empty();
    for (let i = 0; i < 10_000; i++) {
      const before = countItems(slots);
      const operation = randInt(rng, 5);
      let expected = before;
      if (operation === 0) {
        const count = 1 + randInt(rng, 150);
        const result = addItems(slots, items[randInt(rng, items.length)], count);
        expected = before + count - result.left;
        expect(result.left).toBeGreaterThanOrEqual(0);
        slots = result.slots;
      } else if (operation === 1) {
        const slot = randInt(rng, INVENTORY_SLOTS);
        const count = 1 + randInt(rng, 40);
        const result = removeItems(slots, slot, count);
        if (result) {
          expected = before - count;
          slots = result;
        } else {
          expect((slots[slot]?.count ?? 0) < count).toBe(true);
        }
      } else if (operation === 2) {
        slots = moveStack(slots, randInt(rng, INVENTORY_SLOTS), randInt(rng, INVENTORY_SLOTS));
      } else if (operation === 3) {
        slots = moveStack(
          slots,
          randInt(rng, INVENTORY_SLOTS),
          randInt(rng, INVENTORY_SLOTS),
          false,
        );
      } else {
        const slot = randInt(rng, INVENTORY_SLOTS);
        expected = before - (slots[slot]?.count ?? 0);
        slots = emptySlot(slots, slot);
      }
      expect(countItems(slots)).toBe(expected);
      expect(slots.length).toBe(INVENTORY_SLOTS);
      for (const stack of slots) {
        if (!stack) continue;
        expect(stack.count).toBeGreaterThanOrEqual(1);
        expect(stack.count).toBeLessThanOrEqual(STACK_SIZE);
        expect(Number.isInteger(stack.count)).toBe(true);
      }
    }
  });
});

describe('slot operations', () => {
  it('removeItems takes items and empties a slot with the last one', () => {
    const start = withSlots({ 2: { item: Block.SAND, count: 3 } });
    expect(removeItems(start, 2, 1)?.[2]).toEqual({ item: Block.SAND, count: 2 });
    expect(removeItems(start, 2, 3)?.[2]).toBeNull();
    expect(removeItems(start, 2, 4)).toBeNull();
    expect(removeItems(start, 5, 1)).toBeNull();
    expect(removeItems(start, 2, 0)).toBeNull();
    expect(start[2]).toEqual({ item: Block.SAND, count: 3 });
  });

  it('moveStack moves into an empty slot', () => {
    const start = withSlots({ 2: { item: Block.SAND, count: 3 } });
    const moved = moveStack(start, 2, 30);
    expect(moved[2]).toBeNull();
    expect(moved[30]).toEqual({ item: Block.SAND, count: 3 });
  });

  it('moveStack merges equal items and leaves the remainder behind', () => {
    const start = withSlots({
      2: { item: Block.SAND, count: 60 },
      4: { item: Block.SAND, count: 50 },
      5: { item: Block.SAND, count: 10 },
    });
    const merged = moveStack(start, 2, 4);
    expect(merged[4]).toEqual({ item: Block.SAND, count: 99 });
    expect(merged[2]).toEqual({ item: Block.SAND, count: 11 });
    const all = moveStack(start, 5, 4);
    expect(all[4]).toEqual({ item: Block.SAND, count: 60 });
    expect(all[5]).toBeNull();
    // Without merging (Creative) equal items swap.
    const swapped = moveStack(start, 2, 4, false);
    expect(swapped[2]?.count).toBe(50);
    expect(swapped[4]?.count).toBe(60);
  });

  it('moveStack swaps different items', () => {
    const start = withSlots({
      2: { item: Block.SAND, count: 60 },
      4: { item: Block.DIRT, count: 5 },
    });
    const swapped = moveStack(start, 2, 4);
    expect(swapped[2]).toEqual({ item: Block.DIRT, count: 5 });
    expect(swapped[4]).toEqual({ item: Block.SAND, count: 60 });
  });

  it('moveStack leaves the slots alone for an empty source, the same slot or a bad target', () => {
    const start = withSlots({ 2: { item: Block.SAND, count: 60 } });
    expect(moveStack(start, 3, 2)).toBe(start);
    expect(moveStack(start, 2, 2)).toBe(start);
    expect(moveStack(start, 2, 99)).toBe(start);
  });

  it('emptySlot, setSlot and countItems', () => {
    const start = withSlots({
      2: { item: Block.SAND, count: 60 },
      9: { item: Item.COAL, count: 7 },
    });
    expect(countItems(start)).toBe(67);
    expect(countItems(start, Item.COAL)).toBe(7);
    expect(countItems(emptySlot(start, 2))).toBe(7);
    expect(setSlot(start, 0, { item: Block.LOG, count: 1 })[0]).toEqual({
      item: Block.LOG,
      count: 1,
    });
    expect(start[0]).toBeNull();
  });
});
