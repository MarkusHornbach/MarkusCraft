import { describe, expect, it } from 'vitest';
import { BREAK_TOLERANCE_MS, INVENTORY_SLOTS, STACK_SIZE } from '../game/config';
import { breakTimeMs } from '../items/hardness';
import { countItems } from '../items/inventory';
import { Item } from '../items/items';
import { mulberry32, randInt } from '../util/rng';
import { Block } from '../world/blocks';
import type { Action } from './actions';
import { type ActionContext, type ActionResult, applyAction } from './apply';
import { type ItemStack, type PlayerRecord, createPlayerRecord } from './playerRecord';
import { LocalSession } from './Session';

/** Cells of a small world; a dirt floor at y 9 with some other blocks in it. */
class Cells {
  readonly cells = new Map<string, number>();
  getBlock(x: number, y: number, z: number): number {
    if (y < 0) return Block.BEDROCK;
    return this.cells.get(`${x},${y},${z}`) ?? (y === 9 ? Block.DIRT : Block.AIR);
  }
  setBlock(x: number, y: number, z: number, id: number): boolean {
    this.cells.set(`${x},${y},${z}`, id);
    return true;
  }
}

const pose = { x: 0.5, y: 10, z: 0.5 };
const DIRT_MS = 600;

function context(slots: Record<number, ItemStack> = {}): { world: Cells; ctx: ActionContext } {
  const world = new Cells();
  world.setBlock(3, 9, 0, Block.COAL_ORE);
  world.setBlock(-3, 9, 0, Block.BEDROCK);
  world.setBlock(0, 9, 3, Block.STONE);
  const record = createPlayerRecord('gathering');
  const filled = [...record.slots];
  for (const [index, stack] of Object.entries(slots)) filled[Number(index)] = stack;
  return {
    world,
    ctx: { world, mode: 'gathering', pose, record: { ...record, slots: filled }, players: [pose] },
  };
}

function reasonOf(result: ActionResult): string {
  return result.ok ? 'ok' : result.reason;
}

function started(ctx: ActionContext, x: number, y: number, z: number, at: number): ActionContext {
  const result = applyAction(ctx, { kind: 'startBreak', x, y, z }, at);
  if (!result.ok || !result.player) throw new Error(`startBreak refused: ${reasonOf(result)}`);
  expect(result.blocks).toEqual([]);
  return { ...ctx, record: result.player };
}

describe('startBreak', () => {
  it('remembers the cell and the start time', () => {
    const { ctx } = context();
    const after = started(ctx, 2, 9, 0, 1234.5);
    expect(after.record.breaking).toEqual({ x: 2, y: 9, z: 0, startMs: 1234.5 });
    expect(after.record.slots).toEqual(ctx.record.slots);
    // Starting on another block replaces it.
    expect(started(after, 1, 9, 1, 2000).record.breaking).toEqual({
      x: 1,
      y: 9,
      z: 1,
      startMs: 2000,
    });
  });

  it('is refused in Creative, out of reach, outside the world and on unbreakable blocks', () => {
    const { ctx } = context();
    const at = (action: Action, c: ActionContext = ctx): string =>
      reasonOf(applyAction(c, action, 0));
    expect(at({ kind: 'startBreak', x: 2, y: 9, z: 0 }, { ...ctx, mode: 'creative' })).toBe('mode');
    expect(at({ kind: 'startBreak', x: 40, y: 9, z: 0 })).toBe('reach');
    expect(at({ kind: 'startBreak', x: 0, y: -1, z: 0 })).toBe('invalid');
    expect(at({ kind: 'startBreak', x: -3, y: 9, z: 0 })).toBe('unbreakable');
    expect(at({ kind: 'startBreak', x: 2, y: 11, z: 0 })).toBe('unbreakable');
  });
});

describe('break in Gathering (Phase 3 AC7.2)', () => {
  it('is refused as early before the time is up, minus the tolerance, and succeeds at the time', () => {
    const { ctx } = context();
    const running = started(ctx, 2, 9, 0, 1000);
    const at = (ms: number): string =>
      reasonOf(applyAction(running, { kind: 'break', x: 2, y: 9, z: 0 }, ms));
    expect(at(1000)).toBe('early');
    expect(at(1000 + DIRT_MS / 2)).toBe('early');
    expect(at(1000 + DIRT_MS - BREAK_TOLERANCE_MS - 1)).toBe('early');
    expect(at(1000 + DIRT_MS - BREAK_TOLERANCE_MS)).toBe('ok');
    expect(at(1000 + DIRT_MS)).toBe('ok');
    expect(at(1000 + DIRT_MS * 10)).toBe('ok');
    // A clock that ran backwards (another session) never finishes a break.
    expect(at(0)).toBe('early');
  });

  it('uses the break time of the block in the cell', () => {
    const { ctx } = context();
    const stone = started(ctx, 0, 9, 3, 0);
    const stoneMs = breakTimeMs(Block.STONE) ?? 0;
    expect(stoneMs).toBe(3000);
    expect(reasonOf(applyAction(stone, { kind: 'break', x: 0, y: 9, z: 3 }, DIRT_MS))).toBe(
      'early',
    );
    expect(reasonOf(applyAction(stone, { kind: 'break', x: 0, y: 9, z: 3 }, stoneMs))).toBe('ok');
  });

  it('is refused without a startBreak and for another cell than the started one', () => {
    const { ctx } = context();
    expect(reasonOf(applyAction(ctx, { kind: 'break', x: 2, y: 9, z: 0 }, 99_999))).toBe('early');
    const running = started(ctx, 2, 9, 0, 0);
    for (const [x, y, z] of [
      [1, 9, 0],
      [2, 9, 1],
      [1, 9, 1],
    ]) {
      expect(reasonOf(applyAction(running, { kind: 'break', x, y, z }, 99_999))).toBe('early');
    }
  });

  it('is refused after the slot changed or the items were rearranged', () => {
    const { ctx } = context({ 5: { item: Block.SAND, count: 3 } });
    const running = started(ctx, 2, 9, 0, 0);
    const actions: Action[] = [
      { kind: 'selectSlot', slot: 4 },
      // The same slot again counts as a change as well.
      { kind: 'selectSlot', slot: 0 },
      { kind: 'moveStack', from: 5, to: 6 },
      { kind: 'discard', slot: 5 },
      { kind: 'place', x: 1, y: 10, z: 1, slot: 5 },
    ];
    for (const action of actions) {
      const changed = applyAction(running, action, 100);
      expect(changed.ok && changed.player?.breaking).toBeNull();
      if (!changed.ok || !changed.player) continue;
      const after = { ...running, record: changed.player };
      expect(reasonOf(applyAction(after, { kind: 'break', x: 2, y: 9, z: 0 }, 5000))).toBe('early');
    }
  });

  it('removes the block, adds the drop, reports the pickup and ends the break', () => {
    const { ctx } = context();
    const running = started(ctx, 2, 9, 0, 0);
    const result = applyAction(running, { kind: 'break', x: 2, y: 9, z: 0 }, DIRT_MS);
    expect(result).toEqual({
      ok: true,
      blocks: [{ x: 2, y: 9, z: 0, id: Block.AIR }],
      player: {
        ...ctx.record,
        slots: [{ item: Block.DIRT, count: 1 }, ...ctx.record.slots.slice(1)],
        breaking: null,
      },
      notices: [{ item: Block.DIRT, count: 1 }],
    });
  });

  it('coal ore yields one coal when broken with a pickaxe', () => {
    const { ctx } = context({ 0: { item: Item.WOODEN_PICKAXE, count: 1 } });
    const running = started(ctx, 3, 9, 0, 0);
    // A wooden pickaxe halves the 3.5 seconds.
    const early = applyAction(running, { kind: 'break', x: 3, y: 9, z: 0 }, 1600);
    expect(reasonOf(early)).toBe('early');
    const result = applyAction(running, { kind: 'break', x: 3, y: 9, z: 0 }, 1750);
    expect(result.ok && result.notices).toEqual([{ item: Item.COAL, count: 1 }]);
    expect(result.ok && result.player?.slots[1]).toEqual({ item: Item.COAL, count: 1 });
  });

  it('keeps the water rule', () => {
    const { world, ctx } = context();
    world.setBlock(2, 9, 1, Block.WATER);
    const running = started(ctx, 2, 9, 0, 0);
    const result = applyAction(running, { kind: 'break', x: 2, y: 9, z: 0 }, DIRT_MS);
    expect(result.ok && result.blocks).toEqual([{ x: 2, y: 9, z: 0, id: Block.WATER }]);
  });

  it('Creative breaks at once, without a drop', () => {
    const { ctx } = context();
    const creative = { ...ctx, mode: 'creative' as const };
    expect(applyAction(creative, { kind: 'break', x: 2, y: 9, z: 0 }, 0)).toEqual({
      ok: true,
      blocks: [{ x: 2, y: 9, z: 0, id: Block.AIR }],
      player: null,
      notices: [],
    });
  });
});

describe('a full inventory (Phase 3 AC7.3)', () => {
  const full = (): Record<number, ItemStack> =>
    Object.fromEntries(
      Array.from({ length: INVENTORY_SLOTS }, (_, i) => [
        i,
        { item: Block.STONE, count: STACK_SIZE },
      ]),
    );

  it('refuses startBreak and break with full and changes nothing', () => {
    const { world, ctx } = context(full());
    const before = JSON.stringify(ctx.record);
    expect(reasonOf(applyAction(ctx, { kind: 'startBreak', x: 2, y: 9, z: 0 }, 0))).toBe('full');
    // Also when the break was started while there still was room.
    const record: PlayerRecord = { ...ctx.record, breaking: { x: 2, y: 9, z: 0, startMs: 0 } };
    const result = applyAction({ ...ctx, record }, { kind: 'break', x: 2, y: 9, z: 0 }, DIRT_MS);
    expect(reasonOf(result)).toBe('full');
    expect(JSON.stringify(ctx.record)).toBe(before);
    expect(world.getBlock(2, 9, 0)).toBe(Block.DIRT);
    // Stone does not fit either: every stack of it is full, and the pickaxe would yield it.
    const pick = { ...ctx.record.slots[0], item: Item.STONE_PICKAXE, count: 1 };
    const withPick = {
      ...ctx,
      record: { ...ctx.record, slots: [pick, ...ctx.record.slots.slice(1)] },
    };
    const stone: Action = { kind: 'startBreak', x: 0, y: 9, z: 3 };
    expect(reasonOf(applyAction(withPick, stone, 0))).toBe('full');
  });

  it('does not refuse a break that yields nothing (Phase 3 AC11.2)', () => {
    // By hand stone drops nothing, so there is nothing that would have to fit.
    const { world, ctx } = context(full());
    const running = started(ctx, 0, 9, 3, 0);
    expect(reasonOf(applyAction(running, { kind: 'break', x: 0, y: 9, z: 3 }, 2000))).toBe('early');
    const result = applyAction(running, { kind: 'break', x: 0, y: 9, z: 3 }, 3000);
    expect(result).toEqual({
      ok: true,
      blocks: [{ x: 0, y: 9, z: 3, id: Block.AIR }],
      player: { ...ctx.record, breaking: null },
      notices: [],
    });
    expect(world.getBlock(0, 9, 3)).toBe(Block.STONE);
  });

  it('accepts the drop into a partly filled stack of the same item', () => {
    const slots = full();
    slots[20] = { item: Block.DIRT, count: 98 };
    const { ctx } = context(slots);
    const running = started(ctx, 2, 9, 0, 0);
    const result = applyAction(running, { kind: 'break', x: 2, y: 9, z: 0 }, DIRT_MS);
    expect(result.ok && result.player?.slots[20]).toEqual({ item: Block.DIRT, count: 99 });
    // Now that stack is full too.
    if (!result.ok || !result.player) return;
    const after = { ...ctx, record: result.player };
    expect(reasonOf(applyAction(after, { kind: 'startBreak', x: 1, y: 9, z: 0 }, 0))).toBe('full');
    // Coal has no stack to go to, once a pickaxe would yield it.
    slots[0] = { item: Item.WOODEN_PICKAXE, count: 1 };
    const coal: Action = { kind: 'startBreak', x: 3, y: 9, z: 0 };
    expect(reasonOf(applyAction(context(slots).ctx, coal, 0))).toBe('full');
    expect(reasonOf(applyAction(ctx, coal, 0))).toBe('ok');
  });
});

describe('Gathering through a session', () => {
  it('never changes its inputs and keeps the item count honest over 2 000 random actions', () => {
    const { world, ctx } = context();
    let now = 0;
    let expected = 0;
    const session = new LocalSession(
      { world, mode: 'gathering', pose: () => pose, nowMs: () => now },
      ctx.record,
      {
        onBlocks: () => {},
        onPlayer: () => {},
        onResult: (action, result) => {
          if (!result.ok) return;
          // Stone and coal ore are broken by hand here and yield nothing.
          if (action.kind === 'break') expected += result.notices.length;
          if (action.kind === 'place') expected -= 1;
          if (action.kind === 'discard') expected -= discarded;
        },
      },
    );
    let discarded = 0;
    const rng = mulberry32(31);
    const coord = (): number => randInt(rng, 9) - 4;
    const outcomes = new Set<string>();
    for (let i = 0; i < 2000; i++) {
      now += randInt(rng, 700);
      const before = session.record;
      const frozen = JSON.stringify(before);
      const pick = randInt(rng, 7);
      const cell = { x: coord(), y: 8 + randInt(rng, 4), z: coord() };
      let action: Action;
      if (pick === 0) action = { kind: 'startBreak', ...cell };
      else if (pick === 1 || pick === 2) {
        // Mostly the started cell, so that breaks succeed.
        const b = before.breaking;
        action = { kind: 'break', ...(b && rng() < 0.8 ? { x: b.x, y: b.y, z: b.z } : cell) };
      } else if (pick === 3) action = { kind: 'place', ...cell, slot: randInt(rng, 9) };
      else if (pick === 4)
        action = { kind: 'moveStack', from: randInt(rng, 36), to: randInt(rng, 36) };
      else if (pick === 5) action = { kind: 'discard', slot: randInt(rng, 36) };
      else action = { kind: 'setBarSlot', slot: randInt(rng, 9), item: Block.STONE };
      discarded = action.kind === 'discard' ? (before.slots[action.slot]?.count ?? 0) : 0;
      const result = applyAction(
        { world, mode: 'gathering', pose, record: before, players: [pose] },
        action,
        now,
      );
      outcomes.add(`${action.kind}:${reasonOf(result)}`);
      session.submit(action);
      // The old record is never changed; a new one takes its place.
      expect(JSON.stringify(before)).toBe(frozen);
      expect(countItems(session.record.slots)).toBe(expected);
    }
    for (const outcome of [
      'startBreak:ok',
      'break:ok',
      'break:early',
      'place:ok',
      'place:missing',
      'moveStack:ok',
      'discard:ok',
      'setBarSlot:mode',
    ]) {
      expect(outcomes.has(outcome), outcome).toBe(true);
    }
  });
});

describe('tools and gating in the action layer (Phase 3 AC11.2)', () => {
  /** Breaks the block at a cell with `held` in the selected slot, after `ms`. */
  function breakWith(held: number | null, cell: [number, number, number], ms: number) {
    const { world, ctx } = context(held === null ? {} : { 0: { item: held, count: 1 } });
    world.setBlock(2, 9, 2, Block.IRON_ORE);
    const [x, y, z] = cell;
    const running = started(ctx, x, y, z, 0);
    return applyAction(running, { kind: 'break', x, y, z }, ms);
  }
  const STONE_CELL: [number, number, number] = [0, 9, 3];
  const COAL_CELL: [number, number, number] = [3, 9, 0];
  const IRON_CELL: [number, number, number] = [2, 9, 2];
  const got = (result: ActionResult): unknown => (result.ok ? result.notices : result.reason);

  it('stone and coal ore yield nothing by hand and their item with any pickaxe', () => {
    expect(got(breakWith(null, STONE_CELL, 3000))).toEqual([]);
    expect(got(breakWith(null, COAL_CELL, 3500))).toEqual([]);
    // Other items and tools of another class count as the hand.
    expect(got(breakWith(Block.DIRT, STONE_CELL, 3000))).toEqual([]);
    expect(got(breakWith(Item.IRON_AXE, STONE_CELL, 3000))).toEqual([]);
    expect(got(breakWith(Item.IRON_SHOVEL, COAL_CELL, 3500))).toEqual([]);
    for (const [pick, speed] of [
      [Item.WOODEN_PICKAXE, 2],
      [Item.STONE_PICKAXE, 4],
      [Item.IRON_PICKAXE, 8],
    ]) {
      expect(got(breakWith(pick, STONE_CELL, 3000 / speed))).toEqual([
        { item: Block.STONE, count: 1 },
      ]);
      expect(got(breakWith(pick, COAL_CELL, 3500 / speed))).toEqual([
        { item: Item.COAL, count: 1 },
      ]);
    }
  });

  it('iron ore yields nothing with a wooden pickaxe and its block with a stone or iron one', () => {
    expect(got(breakWith(null, IRON_CELL, 4500))).toEqual([]);
    expect(got(breakWith(Item.WOODEN_PICKAXE, IRON_CELL, 2250))).toEqual([]);
    const ore = [{ item: Block.IRON_ORE, count: 1 }];
    expect(got(breakWith(Item.STONE_PICKAXE, IRON_CELL, 1125))).toEqual(ore);
    expect(got(breakWith(Item.IRON_PICKAXE, IRON_CELL, 562.5))).toEqual(ore);
  });

  it('a break without a drop still removes the block and leaves the items alone', () => {
    const result = breakWith(null, STONE_CELL, 3000);
    expect(result.ok && result.blocks).toEqual([{ x: 0, y: 9, z: 3, id: Block.AIR }]);
    expect(result.ok && countItems(result.player?.slots ?? [])).toBe(0);
    expect(result.ok && result.player?.breaking).toBeNull();
  });

  it('the tool decides the time: too early by hand speed is in time with the tool', () => {
    expect(got(breakWith(null, STONE_CELL, 750))).toBe('early');
    expect(got(breakWith(Item.WOODEN_PICKAXE, STONE_CELL, 750))).toBe('early');
    expect(got(breakWith(Item.STONE_PICKAXE, STONE_CELL, 750))).toEqual([
      { item: Block.STONE, count: 1 },
    ]);
    // A shovel is no faster on stone, and a pickaxe no faster on dirt.
    expect(got(breakWith(Item.IRON_SHOVEL, STONE_CELL, 1500))).toBe('early');
    expect(got(breakWith(Item.IRON_PICKAXE, [2, 9, 0], 300))).toBe('early');
    expect(got(breakWith(Item.WOODEN_SHOVEL, [2, 9, 0], 300))).toEqual([
      { item: Block.DIRT, count: 1 },
    ]);
  });

  it('a tool cannot be placed', () => {
    const { ctx } = context({ 0: { item: Item.STONE_PICKAXE, count: 1 } });
    const result = applyAction(ctx, { kind: 'place', x: 1, y: 10, z: 1, slot: 0 }, 0);
    expect(result).toEqual({ ok: false, reason: 'invalid' });
  });
});
