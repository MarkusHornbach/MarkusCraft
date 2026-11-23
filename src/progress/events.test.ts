// eventsOf: the progress events of real action results (Phase 8 AC2.1, AC2.4).
import { describe, expect, it } from 'vitest';
import type { Action } from '../actions/actions';
import { type ActionContext, applyAction } from '../actions/apply';
import { type ItemStack, createPlayerRecord } from '../actions/playerRecord';
import { breakTimeMs } from '../items/hardness';
import { Item } from '../items/items';
import { Block } from '../world/blocks';
import { eventsOf } from './events';

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
    record: { ...record, slots },
    players: [pose],
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
