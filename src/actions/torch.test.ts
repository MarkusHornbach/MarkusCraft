import { describe, expect, it } from 'vitest';
import { HOTBAR_SLOTS, INVENTORY_SLOTS, STACK_SIZE } from '../game/config';
import { countItems } from '../items/inventory';
import { Item } from '../items/items';
import { getRecipe } from '../items/recipes';
import { mulberry32, randInt } from '../util/rng';
import { BLOCKS, Block, isSupport } from '../world/blocks';
import { type Action, decodeAction } from './actions';
import { completeProgress, maxLevelXp } from '../progress/progress';
import { type ActionContext, type ActionResult, applyAction } from './apply';
import { type ItemStack, createPlayerRecord } from './playerRecord';

/** A small world: a dirt floor at y 9, air above. */
class Cells {
  readonly cells = new Map<string, number>();
  getBlock(x: number, y: number, z: number): number {
    if (y < 0) return Block.BEDROCK;
    return this.cells.get(`${x},${y},${z}`) ?? (y === 9 ? Block.DIRT : Block.AIR);
  }
  set(x: number, y: number, z: number, id: number): void {
    this.cells.set(`${x},${y},${z}`, id);
  }
}

const pose = { x: 0.5, y: 10, z: 0.5 };

function context(
  mode: 'gathering' | 'creative',
  slots: Record<number, ItemStack> = {},
): { world: Cells; ctx: ActionContext } {
  const world = new Cells();
  const record = createPlayerRecord(mode);
  const filled = [...record.slots];
  for (const [index, stack] of Object.entries(slots)) filled[Number(index)] = stack;
  return {
    world,
    ctx: {
      world,
      mode,
      pose,
      record: { ...record, slots: filled, xp: maxLevelXp() },
      players: [pose],
      progress: completeProgress(),
    },
  };
}

function reasonOf(result: ActionResult): string {
  return result.ok ? 'ok' : result.reason;
}

const TORCHES = { 0: { item: Block.TORCH, count: 5 } };

function place(ctx: ActionContext, x: number, y: number, z: number): ActionResult {
  return applyAction(ctx, { kind: 'place', x, y, z, slot: 0 }, 0);
}

describe('placing a torch (Phase 4 AC6.3)', () => {
  it('is refused with support over air, water and a torch', () => {
    const { world, ctx } = context('gathering', TORCHES);
    // Air below.
    expect(reasonOf(place(ctx, 2, 12, 0))).toBe('support');
    world.set(2, 10, 1, Block.WATER);
    expect(reasonOf(place(ctx, 2, 11, 1))).toBe('support');
    world.set(2, 10, 2, Block.TORCH);
    expect(reasonOf(place(ctx, 2, 11, 2))).toBe('support');
  });

  it('is accepted over every solid cube', () => {
    for (const def of BLOCKS) {
      if (!isSupport(def.id)) continue;
      const { world, ctx } = context('gathering', TORCHES);
      world.set(2, 9, 0, def.id);
      const result = place(ctx, 2, 10, 0);
      expect(reasonOf(result), def.name).toBe('ok');
      expect(result.ok && result.blocks).toEqual([{ x: 2, y: 10, z: 0, id: Block.TORCH }]);
    }
  });

  it('is accepted into the cell the player stands in, and into water', () => {
    const { world, ctx } = context('gathering', TORCHES);
    // The player's feet are in cell (0, 10, 0).
    const own = place(ctx, 0, 10, 0);
    expect(reasonOf(own)).toBe('ok');
    expect(own.ok && own.player && countItems(own.player.slots, Block.TORCH)).toBe(4);
    world.set(1, 10, 0, Block.WATER);
    expect(reasonOf(place(ctx, 1, 10, 0))).toBe('ok');
  });

  it("is refused as occupied into a torch's cell; solid blocks still stay out of players", () => {
    const { world, ctx } = context('gathering', {
      0: { item: Block.TORCH, count: 5 },
      1: { item: Block.STONE, count: 5 },
    });
    world.set(2, 10, 0, Block.TORCH);
    expect(reasonOf(place(ctx, 2, 10, 0))).toBe('occupied');
    expect(reasonOf(applyAction(ctx, { kind: 'place', x: 0, y: 10, z: 0, slot: 1 }, 0))).toBe(
      'occupied',
    );
    expect(reasonOf(applyAction(ctx, { kind: 'place', x: 0, y: 11, z: 0, slot: 1 }, 0))).toBe(
      'occupied',
    );
  });

  it('places from the palette in Creative without using anything up', () => {
    const { ctx } = context('creative');
    const bar = applyAction(ctx, { kind: 'setBarSlot', slot: 0, item: Block.TORCH }, 0);
    if (!bar.ok || !bar.player) throw new Error('setBarSlot refused');
    const result = place({ ...ctx, record: bar.player }, 2, 10, 0);
    expect(reasonOf(result)).toBe('ok');
    expect(result.ok && result.player).toBeNull();
  });
});

describe('breaking a torch (Phase 4 AC6.4)', () => {
  it('is accepted in the same millisecond as its startBreak and yields one torch', () => {
    const { world, ctx } = context('gathering');
    world.set(2, 10, 0, Block.TORCH);
    const start = applyAction(ctx, { kind: 'startBreak', x: 2, y: 10, z: 0 }, 500);
    if (!start.ok || !start.player) throw new Error('startBreak refused');
    const done = applyAction(
      { ...ctx, record: start.player },
      { kind: 'break', x: 2, y: 10, z: 0 },
      500,
    );
    expect(reasonOf(done)).toBe('ok');
    if (!done.ok || !done.player) throw new Error('break refused');
    expect(done.blocks).toEqual([{ x: 2, y: 10, z: 0, id: Block.AIR }]);
    expect(countItems(done.player.slots, Block.TORCH)).toBe(1);
    expect(done.notices).toEqual([{ item: Block.TORCH, count: 1 }]);
  });

  it('answers full to startBreak when no torch fits', () => {
    const slots: Record<number, ItemStack> = {};
    for (let i = 0; i < INVENTORY_SLOTS; i++) slots[i] = { item: Block.STONE, count: STACK_SIZE };
    const { world, ctx } = context('gathering', slots);
    world.set(2, 10, 0, Block.TORCH);
    expect(reasonOf(applyAction(ctx, { kind: 'startBreak', x: 2, y: 10, z: 0 }, 0))).toBe('full');
  });
});

/** Breaks (x, y, z) in Gathering with the given slots; a torch stands on top of it. */
function breakUnder(
  slots: Record<number, ItemStack>,
  setup?: (world: Cells) => void,
): ActionResult {
  const { world, ctx } = context('gathering', slots);
  world.set(2, 10, 0, Block.TORCH);
  setup?.(world);
  const start = applyAction(ctx, { kind: 'startBreak', x: 2, y: 9, z: 0 }, 0);
  if (!start.ok || !start.player) throw new Error(`startBreak refused: ${reasonOf(start)}`);
  return applyAction({ ...ctx, record: start.player }, { kind: 'break', x: 2, y: 9, z: 0 }, 600);
}

describe('the block under a torch (Phase 4 AC6.5)', () => {
  it('takes the torch along: two changes, the broken cell first, both items picked up', () => {
    const result = breakUnder({});
    if (!result.ok || !result.player) throw new Error('break refused');
    expect(result.blocks).toEqual([
      { x: 2, y: 9, z: 0, id: Block.AIR },
      { x: 2, y: 10, z: 0, id: Block.AIR },
    ]);
    expect(countItems(result.player.slots, Block.DIRT)).toBe(1);
    expect(countItems(result.player.slots, Block.TORCH)).toBe(1);
    expect(result.notices).toEqual([
      { item: Block.DIRT, count: 1 },
      { item: Block.TORCH, count: 1 },
    ]);
  });

  it('still breaks when the torch has no room; the torch is lost', () => {
    const slots: Record<number, ItemStack> = {};
    for (let i = 0; i < INVENTORY_SLOTS; i++) slots[i] = { item: Block.STONE, count: STACK_SIZE };
    // One dirt short of a full stack: the dirt fits, the torch does not.
    slots[0] = { item: Block.DIRT, count: STACK_SIZE - 1 };
    const result = breakUnder(slots);
    if (!result.ok || !result.player) throw new Error('break refused');
    expect(result.blocks.length).toBe(2);
    expect(countItems(result.player.slots, Block.TORCH)).toBe(0);
    expect(countItems(result.player.slots, Block.DIRT)).toBe(STACK_SIZE);
    expect(result.notices).toEqual([{ item: Block.DIRT, count: 1 }]);
  });

  it("turns the torch's cell into water next to water", () => {
    const result = breakUnder({}, (world) => world.set(3, 10, 0, Block.WATER));
    expect(result.ok && result.blocks[1]).toEqual({ x: 2, y: 10, z: 0, id: Block.WATER });
  });

  it('puts nothing into the inventory in Creative', () => {
    const { world, ctx } = context('creative');
    world.set(2, 10, 0, Block.TORCH);
    const result = applyAction(ctx, { kind: 'break', x: 2, y: 9, z: 0 }, 0);
    expect(result.ok && result.blocks.length).toBe(2);
    expect(result.ok && result.player).toBeNull();
    expect(result.ok && result.notices).toEqual([]);
  });

  it('takes only the torch directly above, never a block beside or two up', () => {
    const { world, ctx } = context('creative');
    world.set(3, 10, 0, Block.TORCH);
    world.set(2, 10, 0, Block.STONE);
    world.set(2, 11, 0, Block.TORCH);
    const result = applyAction(ctx, { kind: 'break', x: 2, y: 9, z: 0 }, 0);
    expect(result.ok && result.blocks).toEqual([{ x: 2, y: 9, z: 0, id: Block.AIR }]);
  });
});

describe('the torch recipe (Phase 4 AC6.6)', () => {
  const recipe = getRecipe(20);

  it('takes one stick and one coal and gives four torches, without a station', () => {
    expect(recipe?.name).toBe('torch');
    expect(recipe?.station).toBeNull();
    const { ctx } = context('gathering', {
      0: { item: Item.STICK, count: 1 },
      1: { item: Item.COAL, count: 1 },
    });
    const result = applyAction(ctx, { kind: 'craft', recipe: 20 }, 0);
    if (!result.ok || !result.player) throw new Error('craft refused');
    expect(countItems(result.player.slots, Block.TORCH)).toBe(4);
    expect(countItems(result.player.slots, Item.STICK)).toBe(0);
    expect(countItems(result.player.slots, Item.COAL)).toBe(0);
  });

  it('answers missing without coal and full without room', () => {
    const { ctx } = context('gathering', { 0: { item: Item.STICK, count: 1 } });
    expect(reasonOf(applyAction(ctx, { kind: 'craft', recipe: 20 }, 0))).toBe('missing');
    const slots: Record<number, ItemStack> = {};
    for (let i = 0; i < INVENTORY_SLOTS; i++) slots[i] = { item: Block.STONE, count: STACK_SIZE };
    slots[0] = { item: Item.STICK, count: 2 };
    slots[1] = { item: Item.COAL, count: 2 };
    const full = context('gathering', slots).ctx;
    expect(reasonOf(applyAction(full, { kind: 'craft', recipe: 20 }, 0))).toBe('full');
  });
});

function randomAction(rng: () => number): Action {
  const coord = (): number => randInt(rng, 8) - 4;
  const y = (): number => randInt(rng, 4) + 8;
  switch (randInt(rng, 6)) {
    case 0:
      return { kind: 'selectSlot', slot: randInt(rng, HOTBAR_SLOTS) };
    case 1:
      return { kind: 'break', x: coord(), y: y(), z: coord() };
    case 2:
      return { kind: 'startBreak', x: coord(), y: y(), z: coord() };
    case 3:
      return { kind: 'craft', recipe: 20 };
    default:
      return { kind: 'place', x: coord(), y: y(), z: coord(), slot: randInt(rng, 2) };
  }
}

describe('purity with torches (Phase 4 AC6.7)', () => {
  it('never changes its inputs over 1 000 seeded random actions; all survive JSON', () => {
    const outcomes = new Set<string>();
    for (const mode of ['gathering', 'creative'] as const) {
      const { world, ctx } = context(mode, {
        0: { item: Block.TORCH, count: 20 },
        1: { item: Block.STONE, count: 20 },
        2: { item: Item.STICK, count: 3 },
        3: { item: Item.COAL, count: 3 },
      });
      for (let x = -4; x < 4; x++) world.set(x, 10, -2, Block.TORCH);
      world.set(1, 10, 1, Block.WATER);
      const frozen = JSON.stringify([...world.cells]);
      const record = JSON.stringify(ctx.record);
      const rng = mulberry32(mode === 'gathering' ? 19 : 20);
      for (let i = 0; i < 500; i++) {
        const action = randomAction(rng);
        const copy = JSON.stringify(action);
        const decoded = decodeAction(JSON.parse(copy));
        expect(decoded).toEqual({ ok: true, action });
        // In Gathering, half of the breaks come after their start.
        const start =
          action.kind === 'break' && mode === 'gathering' && rng() < 0.5
            ? applyAction(ctx, { ...action, kind: 'startBreak' }, i)
            : null;
        const c = start && start.ok && start.player ? { ...ctx, record: start.player } : ctx;
        const result = applyAction(c, action, i + 1000);
        outcomes.add(`${action.kind} ${reasonOf(result)}`);
        expect(JSON.stringify(action)).toBe(copy);
      }
      expect(JSON.stringify([...world.cells])).toBe(frozen);
      expect(JSON.stringify(ctx.record)).toBe(record);
    }
    for (const expected of ['place ok', 'place support', 'break ok', 'craft ok', 'startBreak ok']) {
      expect(outcomes.has(expected), expected).toBe(true);
    }
  });
});
