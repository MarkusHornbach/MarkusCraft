import { describe, expect, it } from 'vitest';
import { HOTBAR_SLOTS, INVENTORY_SLOTS } from '../game/config';
import { countItems } from '../items/inventory';
import { BLOCK_ITEMS, Item } from '../items/items';
import { Block } from '../world/blocks';
import { type ActionContext, type ActionResult, applyAction } from './apply';
import {
  type GameMode,
  type ItemStack,
  type PlayerRecord,
  createPlayerRecord,
} from './playerRecord';

const world = {
  getBlock: (_x: number, y: number, _z: number) => (y <= 9 ? Block.STONE : Block.AIR),
};
const pose = { x: 0.5, y: 10, z: 0.5 };

function context(mode: GameMode, slots: Record<number, ItemStack> = {}): ActionContext {
  const record = createPlayerRecord(mode);
  const filled = [...record.slots];
  for (const [index, stack] of Object.entries(slots)) filled[Number(index)] = stack;
  return { world, mode, pose, record: { ...record, slots: filled }, players: [pose] };
}

function reasonOf(result: ActionResult): string {
  return result.ok ? 'ok' : result.reason;
}

function playerOf(result: ActionResult): PlayerRecord {
  if (!result.ok || !result.player) throw new Error(`no record: ${reasonOf(result)}`);
  return result.player;
}

describe('moveStack, discard and setBarSlot (Phase 3 AC6.2)', () => {
  it('moveStack moves a stack into an empty slot', () => {
    const ctx = context('gathering', { 2: { item: Block.DIRT, count: 40 } });
    const result = applyAction(ctx, { kind: 'moveStack', from: 2, to: 20 }, 0);
    expect(result.ok && result.blocks).toEqual([]);
    const player = playerOf(result);
    expect(player.slots[2]).toBeNull();
    expect(player.slots[20]).toEqual({ item: Block.DIRT, count: 40 });
  });

  it('moveStack merges equal items; the remainder stays behind', () => {
    const ctx = context('gathering', {
      2: { item: Block.DIRT, count: 40 },
      20: { item: Block.DIRT, count: 70 },
    });
    const player = playerOf(applyAction(ctx, { kind: 'moveStack', from: 2, to: 20 }, 0));
    expect(player.slots[20]).toEqual({ item: Block.DIRT, count: 99 });
    expect(player.slots[2]).toEqual({ item: Block.DIRT, count: 11 });
    expect(countItems(player.slots)).toBe(110);
  });

  it('moveStack swaps different items', () => {
    const ctx = context('gathering', {
      2: { item: Block.DIRT, count: 40 },
      20: { item: Item.COAL, count: 3 },
    });
    const player = playerOf(applyAction(ctx, { kind: 'moveStack', from: 2, to: 20 }, 0));
    expect(player.slots[2]).toEqual({ item: Item.COAL, count: 3 });
    expect(player.slots[20]).toEqual({ item: Block.DIRT, count: 40 });
  });

  it('moveStack is refused for an empty source and for the same slot', () => {
    const ctx = context('gathering', { 2: { item: Block.DIRT, count: 40 } });
    expect(reasonOf(applyAction(ctx, { kind: 'moveStack', from: 3, to: 2 }, 0))).toBe('missing');
    expect(reasonOf(applyAction(ctx, { kind: 'moveStack', from: 2, to: 2 }, 0))).toBe('invalid');
  });

  it('moveStack in Creative swaps equal blocks instead of adding them up', () => {
    const ctx = context('creative');
    const slots = [...ctx.record.slots];
    slots[1] = slots[0];
    const record = { ...ctx.record, slots };
    const player = playerOf(
      applyAction({ ...ctx, record }, { kind: 'moveStack', from: 0, to: 1 }, 0),
    );
    expect(player.slots[0]).toEqual({ item: Block.GRASS, count: 1 });
    expect(player.slots[1]).toEqual({ item: Block.GRASS, count: 1 });
  });

  it('discard empties a slot and is refused for an empty one', () => {
    const ctx = context('gathering', { 30: { item: Block.SAND, count: 12 } });
    const player = playerOf(applyAction(ctx, { kind: 'discard', slot: 30 }, 0));
    expect(player.slots.every((slot) => slot === null)).toBe(true);
    expect(reasonOf(applyAction(ctx, { kind: 'discard', slot: 29 }, 0))).toBe('missing');
    // Creative: a bar slot can be emptied as well.
    const creative = playerOf(applyAction(context('creative'), { kind: 'discard', slot: 4 }, 0));
    expect(creative.slots[4]).toBeNull();
  });

  it('setBarSlot is refused in Gathering with the reason mode', () => {
    const ctx = context('gathering');
    expect(reasonOf(applyAction(ctx, { kind: 'setBarSlot', slot: 0, item: Block.STONE }, 0))).toBe(
      'mode',
    );
  });

  it('setBarSlot accepts exactly the placeable blocks in Creative', () => {
    const ctx = context('creative');
    for (const item of BLOCK_ITEMS) {
      const player = playerOf(applyAction(ctx, { kind: 'setBarSlot', slot: 8, item }, 0));
      expect(player.slots[8]).toEqual({ item, count: 1 });
      expect(player.slots.slice(0, 8)).toEqual(ctx.record.slots.slice(0, 8));
    }
    for (const item of [Block.WATER, Block.BEDROCK, 10, 11, 200, Item.COAL, 9999]) {
      expect(
        reasonOf(applyAction(ctx, { kind: 'setBarSlot', slot: 8, item }, 0)),
        String(item),
      ).toBe('invalid');
    }
  });

  it('rearranging items cancels a running break and keeps the selected slot', () => {
    const base = context('gathering', { 2: { item: Block.DIRT, count: 40 } });
    const record: PlayerRecord = {
      ...base.record,
      selectedSlot: 5,
      breaking: { x: 1, y: 9, z: 0, startMs: 0 },
    };
    const ctx = { ...base, record };
    for (const action of [
      { kind: 'moveStack', from: 2, to: 3 } as const,
      { kind: 'discard', slot: 2 } as const,
    ]) {
      const player = playerOf(applyAction(ctx, action, 50));
      expect(player.breaking).toBeNull();
      expect(player.selectedSlot).toBe(5);
    }
  });
});

describe('place and the inventory (Phase 3 AC6.3)', () => {
  it('place in Gathering takes one item; the last one empties the slot', () => {
    const ctx = context('gathering', { 4: { item: Block.PLANKS, count: 2 } });
    const first = applyAction(ctx, { kind: 'place', x: 2, y: 10, z: 0, slot: 4 }, 0);
    expect(first.ok && first.blocks).toEqual([{ x: 2, y: 10, z: 0, id: Block.PLANKS }]);
    const afterFirst = playerOf(first);
    expect(afterFirst.slots[4]).toEqual({ item: Block.PLANKS, count: 1 });
    const second = applyAction(
      { ...ctx, record: afterFirst },
      { kind: 'place', x: 3, y: 10, z: 0, slot: 4 },
      0,
    );
    expect(playerOf(second).slots[4]).toBeNull();
    // The input record is untouched.
    expect(ctx.record.slots[4]).toEqual({ item: Block.PLANKS, count: 2 });
  });

  it('place in Gathering is refused with an empty slot and for an item that is no block', () => {
    const ctx = context('gathering', { 1: { item: Item.COAL, count: 5 } });
    expect(reasonOf(applyAction(ctx, { kind: 'place', x: 2, y: 10, z: 0, slot: 0 }, 0))).toBe(
      'missing',
    );
    expect(reasonOf(applyAction(ctx, { kind: 'place', x: 2, y: 10, z: 0, slot: 1 }, 0))).toBe(
      'invalid',
    );
  });

  it('a refused place takes nothing', () => {
    const ctx = context('gathering', { 4: { item: Block.PLANKS, count: 2 } });
    // Occupied cell, own body, out of reach.
    for (const [x, y, z] of [
      [2, 9, 0],
      [0, 10, 0],
      [40, 10, 0],
    ]) {
      const result = applyAction(ctx, { kind: 'place', x, y, z, slot: 4 }, 0);
      expect(result.ok).toBe(false);
    }
  });

  it('place in Creative never changes a count', () => {
    let ctx = context('creative');
    for (let i = 0; i < 50; i++) {
      const slot = i % HOTBAR_SLOTS;
      const result = applyAction(ctx, { kind: 'place', x: 2 + (i % 3), y: 10, z: 1, slot }, 0);
      expect(result.ok && result.player).toBeNull();
      if (result.ok && result.player) ctx = { ...ctx, record: result.player };
    }
    expect(ctx.record.slots.slice(0, HOTBAR_SLOTS).every((slot) => slot?.count === 1)).toBe(true);
    expect(ctx.record.slots.length).toBe(INVENTORY_SLOTS);
  });
});
