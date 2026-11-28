// eventsOf: the progress events of real action results (Phase 8 AC2.1, AC2.4).
import { describe, expect, it } from 'vitest';
import type { Action } from '../actions/actions';
import { type ActionContext, applyAction } from '../actions/apply';
import { type ItemStack, createPlayerRecord } from '../actions/playerRecord';
import { STACK_SIZE } from '../game/config';
import { breakTimeMs } from '../items/hardness';
import { Item } from '../items/items';
import { Block } from '../world/blocks';
import { eventsOf } from './events';
import { completeProgress } from './progress';

class Cells {
  readonly cells = new Map<string, number>();
  getBlock(x: number, y: number, z: number): number {
    return this.cells.get(`${x},${y},${z}`) ?? (y === 9 ? Block.DIRT : Block.AIR);
  }
  setBlock(x: number, y: number, z: number, id: number): void {
    this.cells.set(`${x},${y},${z}`, id);
  }
}

const pose = { x: 0.5, y: 10, z: 0.5 };

function context(held: ItemStack | null = null): ActionContext {
  const world = new Cells();
  world.setBlock(2, 9, 0, Block.COAL_ORE);
  world.setBlock(0, 9, 2, Block.LOG);
  world.setBlock(0, 10, 2, Block.TORCH);
  world.setBlock(-2, 9, 0, Block.WORKBENCH);
  const record = createPlayerRecord('gathering');
  const slots = [...record.slots];
  slots[0] = held;
  slots[1] = { item: Block.PLANKS, count: 10 };
  slots[2] = { item: Block.TORCH, count: 3 };
  return {
    world,
    mode: 'gathering',
    pose,
    record: { ...record, slots, xp: 1000 },
    players: [pose],
    progress: completeProgress(),
  };
}

/** startBreak, then break once its time is up; the events of the break. */
function breakAt(ctx: ActionContext, x: number, y: number, z: number): unknown[] {
  const start = applyAction(ctx, { kind: 'startBreak', x, y, z }, 0);
  if (!start.ok || !start.player) throw new Error('startBreak refused');
  const after = { ...ctx, record: start.player };
  const ms = breakTimeMs(ctx.world.getBlock(x, y, z), ctx.record.slots[0]?.item ?? null) ?? 0;
  const action: Action = { kind: 'break', x, y, z };
  const result = applyAction(after, action, ms);
  return [...eventsOf(action, result, Object.freeze(after))];
}

describe('eventsOf (Phase 8 AC2.1)', () => {
  it('a break gives the drop of the broken block', () => {
    const events = breakAt(context({ item: Item.WOODEN_PICKAXE, count: 1 }), 2, 9, 0);
    expect(events).toEqual([{ kind: 'mine', block: Block.COAL_ORE, item: Item.COAL, count: 1 }]);
  });

  it('coal ore by hand yields nothing and counts nothing', () => {
    expect(breakAt(context(), 2, 9, 0)).toEqual([]);
  });

  it('a carried torch does not count as mined', () => {
    expect(breakAt(context(), 0, 9, 2)).toEqual([
      { kind: 'mine', block: Block.LOG, item: Block.LOG, count: 1 },
    ]);
  });

  it('craft gives the result; place gives the block; refusals give nothing', () => {
    const ctx = context();
    const craft: Action = { kind: 'craft', recipe: 2 };
    expect(eventsOf(craft, applyAction(ctx, craft, 0), ctx)).toEqual([
      { kind: 'craft', recipe: 2, item: Item.STICK, count: 4 },
    ]);
    const place: Action = { kind: 'place', x: 1, y: 10, z: 0, slot: 2 };
    expect(eventsOf(place, applyAction(ctx, place, 0), ctx)).toEqual([
      { kind: 'place', block: Block.TORCH },
    ]);
    const refused: Action = { kind: 'craft', recipe: 10 };
    expect(eventsOf(refused, applyAction(ctx, refused, 0), ctx)).toEqual([]);
    const select: Action = { kind: 'selectSlot', slot: 3 };
    expect(eventsOf(select, applyAction(ctx, select, 0), ctx)).toEqual([]);
    const early: Action = { kind: 'break', x: 2, y: 9, z: 0 };
    expect(eventsOf(early, applyAction(ctx, early, 0), ctx)).toEqual([]);
  });

  it('a Creative break counts nothing', () => {
    const ctx = { ...context(), mode: 'creative' as const };
    const action: Action = { kind: 'break', x: 0, y: 9, z: 2 };
    expect(eventsOf(action, applyAction(ctx, action, 0), ctx)).toEqual([]);
  });
});

describe('store events (Phase 8B3a AC6.2)', () => {
  const at = { x: 2, y: 10, z: 0 };

  /** A context with a chest at `at` holding `chest`, the player holding `held` in slot 9. */
  function chestContext(
    chest: (ItemStack | null)[],
    held: ItemStack | null,
    mode: 'gathering' | 'creative' = 'gathering',
  ): ActionContext {
    const ctx = context();
    (ctx.world as Cells).setBlock(at.x, at.y, at.z, Block.CHEST);
    const slots = [...ctx.record.slots];
    slots[9] = held;
    const state = {
      kind: 'chest' as const,
      slots: Array.from({ length: 27 }, (_, i) => chest[i] ?? null),
    };
    return {
      ...ctx,
      mode,
      record: { ...ctx.record, slots },
      states: { getState: (x, y, z) => (x === at.x && y === at.y && z === at.z ? state : null) },
    };
  }

  function eventsFor(ctx: ActionContext, action: Action): unknown[] {
    return [...eventsOf(action, applyAction(ctx, action, 0), ctx)];
  }

  const stone = (count: number): ItemStack => ({ item: Block.STONE, count });

  it('a move or quick move from the player into the chest counts what the chest gained', () => {
    const ctx = chestContext([stone(STACK_SIZE - 4)], stone(10));
    const into: Action = {
      kind: 'chestMove',
      ...at,
      from: 9,
      fromChest: false,
      to: 0,
      toChest: true,
      item: Block.STONE,
    };
    // Four fit onto the chest's stack, six stay with the player.
    expect(eventsFor(ctx, into)).toEqual([{ kind: 'store', item: Block.STONE, count: 4 }]);
    const quick: Action = {
      kind: 'quickMove',
      ...at,
      slot: 9,
      fromChest: false,
      item: Block.STONE,
    };
    expect(eventsFor(ctx, quick)).toEqual([{ kind: 'store', item: Block.STONE, count: 10 }]);
  });

  it('taking out, moves inside the chest, take all, Creative and refusals give none', () => {
    const ctx = chestContext([stone(5)], stone(10));
    const out: Action[] = [
      { kind: 'chestMove', ...at, from: 0, fromChest: true, to: 12, toChest: false, item: 1 },
      { kind: 'chestMove', ...at, from: 0, fromChest: true, to: 3, toChest: true, item: 1 },
      { kind: 'quickMove', ...at, slot: 0, fromChest: true, item: Block.STONE },
      { kind: 'takeAll', ...at },
      // Refused: the slot holds stone, not planks.
      { kind: 'quickMove', ...at, slot: 9, fromChest: false, item: Block.PLANKS },
    ];
    for (const action of out) {
      const fixed =
        action.kind === 'chestMove' ? { ...action, item: Block.STONE } : (action as Action);
      expect(eventsFor(ctx, fixed), JSON.stringify(fixed)).toEqual([]);
    }
    const creative = chestContext([], stone(10), 'creative');
    const slots = [...creative.record.slots];
    slots[0] = stone(10);
    const bar = { ...creative, record: { ...creative.record, slots } };
    expect(
      eventsFor(bar, { kind: 'quickMove', ...at, slot: 0, fromChest: false, item: Block.STONE }),
    ).toEqual([]);
  });

  it('a swap into the chest counts the stack that went in', () => {
    const ctx = chestContext([{ item: Block.PLANKS, count: 3 }], stone(10));
    const swap: Action = {
      kind: 'chestMove',
      ...at,
      from: 9,
      fromChest: false,
      to: 0,
      toChest: true,
      item: Block.STONE,
    };
    expect(eventsFor(ctx, swap)).toEqual([{ kind: 'store', item: Block.STONE, count: 10 }]);
  });
});
