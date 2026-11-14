import { describe, expect, it } from 'vitest';
import { INVENTORY_SLOTS } from '../game/config';
import { countItems } from '../items/inventory';
import { Item } from '../items/items';
import { RECIPES, type Recipe } from '../items/recipes';
import { Block } from '../world/blocks';
import { type ActionContext, type ActionResult, applyAction } from './apply';
import { type ItemStack, type PlayerRecord, createPlayerRecord } from './playerRecord';
import { LocalSession } from './Session';

class Cells {
  readonly cells = new Map<string, number>();
  getBlock(x: number, y: number, z: number): number {
    return this.cells.get(`${x},${y},${z}`) ?? (y === 9 ? Block.DIRT : Block.AIR);
  }
  setBlock(x: number, y: number, z: number, id: number): boolean {
    this.cells.set(`${x},${y},${z}`, id);
    return true;
  }
}

// The eye is at (0.5, 11.62, 0.5).
const pose = { x: 0.5, y: 10, z: 0.5 };

function recordWith(...stacks: [number, number][]): PlayerRecord {
  const record = createPlayerRecord('gathering');
  const slots: (ItemStack | null)[] = [...record.slots];
  stacks.forEach(([item, count], index) => {
    slots[index] = { item, count };
  });
  return { ...record, slots };
}

function context(record: PlayerRecord, mode: 'gathering' | 'creative' = 'gathering') {
  const world = new Cells();
  const ctx: ActionContext = { world, mode, pose, record, players: [pose] };
  return { world, ctx };
}

function recipe(name: string): Recipe {
  const found = RECIPES.find((r) => r.name === name);
  if (!found) throw new Error(`no recipe ${name}`);
  return found;
}

function craft(ctx: ActionContext, name: string): ActionResult {
  return applyAction(ctx, { kind: 'craft', recipe: recipe(name).id }, 0);
}

function reasonOf(result: ActionResult): string {
  return result.ok ? 'ok' : result.reason;
}

describe('craft (Phase 3 AC10.2)', () => {
  it('removes exactly the ingredients and adds the result', () => {
    const { ctx } = context(recordWith([Block.LOG, 3], [Block.DIRT, 7]));
    const result = craft(ctx, 'planks');
    expect(result.ok).toBe(true);
    if (!result.ok || !result.player) return;
    expect(result.blocks).toEqual([]);
    expect(result.notices).toEqual([]);
    const slots = result.player.slots;
    expect(countItems(slots, Block.LOG)).toBe(2);
    expect(countItems(slots, Block.PLANKS)).toBe(4);
    expect(countItems(slots, Block.DIRT)).toBe(7);
    expect(countItems(slots)).toBe(13);
    // The planks go into the first empty slot of the bar.
    expect(slots[2]).toEqual({ item: Block.PLANKS, count: 4 });
    // Nothing of the input was changed.
    expect(ctx.record.slots[0]).toEqual({ item: Block.LOG, count: 3 });
  });

  it('every recipe turns exactly its ingredients into its result', () => {
    for (const r of RECIPES) {
      const given = r.ingredients.map((i): [number, number] => [i.item, i.count + 2]);
      const { world, ctx } = context(recordWith(...given, [Block.LEAVES, 5]));
      world.setBlock(2, 10, 0, Block.WORKBENCH);
      world.setBlock(-2, 10, 0, Block.FURNACE);
      const result = applyAction(ctx, { kind: 'craft', recipe: r.id }, 0);
      expect(reasonOf(result), r.name).toBe('ok');
      if (!result.ok || !result.player) continue;
      const slots = result.player.slots;
      for (const i of r.ingredients) expect(countItems(slots, i.item), r.name).toBe(2);
      expect(countItems(slots, r.result.item), r.name).toBe(r.result.count);
      expect(countItems(slots, Block.LEAVES)).toBe(5);
      expect(slots.length).toBe(INVENTORY_SLOTS);
    }
  });

  it('takes ingredients from several slots, the last slots first', () => {
    const record = recordWith([Block.PLANKS, 3], [Item.STICK, 2], [Block.PLANKS, 2]);
    const { world, ctx } = context(record);
    world.setBlock(1, 10, 0, Block.WORKBENCH);
    const result = craft(ctx, 'wooden_pickaxe');
    expect(result.ok).toBe(true);
    if (!result.ok || !result.player) return;
    expect(result.player.slots.slice(0, 4)).toEqual([
      { item: Block.PLANKS, count: 2 },
      { item: Item.WOODEN_PICKAXE, count: 1 },
      null,
      null,
    ]);
  });

  it('is refused with "missing" when an ingredient is short, and changes nothing', () => {
    const { world, ctx } = context(recordWith([Block.PLANKS, 3], [Item.STICK, 1]));
    world.setBlock(1, 10, 0, Block.WORKBENCH);
    expect(craft(ctx, 'wooden_pickaxe')).toEqual({ ok: false, reason: 'missing' });
    expect(craft(context(recordWith()).ctx, 'planks')).toEqual({ ok: false, reason: 'missing' });
  });

  it('is refused with "station" without the station within 5 blocks of the eye', () => {
    const record = recordWith([Block.PLANKS, 3], [Item.STICK, 2]);
    const far = context(record);
    expect(craft(far.ctx, 'wooden_pickaxe')).toEqual({ ok: false, reason: 'station' });
    far.world.setBlock(7, 11, 0, Block.WORKBENCH);
    expect(craft(far.ctx, 'wooden_pickaxe')).toEqual({ ok: false, reason: 'station' });
    // A furnace is not a workbench.
    far.world.setBlock(1, 10, 0, Block.FURNACE);
    expect(craft(far.ctx, 'wooden_pickaxe')).toEqual({ ok: false, reason: 'station' });
    far.world.setBlock(4, 11, 0, Block.WORKBENCH);
    expect(reasonOf(craft(far.ctx, 'wooden_pickaxe'))).toBe('ok');

    const smelt = context(recordWith([Block.IRON_ORE, 1], [Item.COAL, 1]));
    expect(craft(smelt.ctx, 'iron_ingot')).toEqual({ ok: false, reason: 'station' });
    smelt.world.setBlock(0, 10, -7, Block.FURNACE);
    expect(craft(smelt.ctx, 'iron_ingot')).toEqual({ ok: false, reason: 'station' });
    smelt.world.setBlock(0, 10, -4, Block.FURNACE);
    expect(reasonOf(craft(smelt.ctx, 'iron_ingot'))).toBe('ok');
  });

  it('is refused with "full" when the result has no room, and changes nothing', () => {
    const stacks: [number, number][] = [[Block.LOG, 2]];
    for (let i = 1; i < INVENTORY_SLOTS; i++) stacks.push([Block.DIRT, 99]);
    const { ctx } = context(recordWith(...stacks));
    expect(craft(ctx, 'planks')).toEqual({ ok: false, reason: 'full' });
    // A stack of planks with room for four accepts them.
    stacks[1] = [Block.PLANKS, 95];
    const fits = craft(context(recordWith(...stacks)).ctx, 'planks');
    expect(fits.ok && fits.player?.slots[1]).toEqual({ item: Block.PLANKS, count: 99 });
    // With 96 only three would fit: nothing is made.
    stacks[1] = [Block.PLANKS, 96];
    expect(craft(context(recordWith(...stacks)).ctx, 'planks')).toEqual({
      ok: false,
      reason: 'full',
    });
    // The last log frees its slot for the result.
    stacks[0] = [Block.LOG, 1];
    stacks[1] = [Block.DIRT, 99];
    expect(reasonOf(craft(context(recordWith(...stacks)).ctx, 'planks'))).toBe('ok');
  });

  it('is refused for an unknown recipe and in Creative', () => {
    const { ctx } = context(recordWith([Block.LOG, 3]));
    expect(applyAction(ctx, { kind: 'craft', recipe: 999 }, 0)).toEqual({
      ok: false,
      reason: 'invalid',
    });
    const creative = context(recordWith([Block.LOG, 3]), 'creative');
    expect(craft(creative.ctx, 'planks')).toEqual({ ok: false, reason: 'mode' });
  });

  it('a tool takes a slot of its own', () => {
    const record = recordWith([Block.PLANKS, 6], [Item.STICK, 4], [Item.WOODEN_PICKAXE, 1]);
    const { world, ctx } = context(record);
    world.setBlock(1, 10, 0, Block.WORKBENCH);
    const result = craft(ctx, 'wooden_pickaxe');
    expect(result.ok).toBe(true);
    if (!result.ok || !result.player) return;
    expect(result.player.slots.slice(0, 4)).toEqual([
      { item: Block.PLANKS, count: 3 },
      { item: Item.STICK, count: 2 },
      { item: Item.WOODEN_PICKAXE, count: 1 },
      { item: Item.WOODEN_PICKAXE, count: 1 },
    ]);
  });

  it('cancels a running break, like every change of the items', () => {
    const record = { ...recordWith([Block.LOG, 1]), breaking: { x: 1, y: 9, z: 0, startMs: 5 } };
    const result = craft(context(record).ctx, 'planks');
    expect(result.ok && result.player?.breaking).toBeNull();
  });

  it('goes through the session: the listener gets the new record and the answer', () => {
    const world = new Cells();
    const records: PlayerRecord[] = [];
    const results: ActionResult[] = [];
    const session = new LocalSession(
      { world, mode: 'gathering', pose: () => pose, nowMs: () => 0 },
      recordWith([Block.LOG, 1]),
      {
        onBlocks: () => {
          throw new Error('crafting sets no block');
        },
        onPlayer: (record) => records.push(record),
        onResult: (_action, result) => results.push(result),
      },
    );
    session.submit({ kind: 'craft', recipe: recipe('planks').id });
    session.submit({ kind: 'craft', recipe: recipe('planks').id });
    expect(results.map(reasonOf)).toEqual(['ok', 'missing']);
    expect(records.length).toBe(1);
    expect(countItems(session.record.slots, Block.PLANKS)).toBe(4);
    expect(countItems(session.record.slots, Block.LOG)).toBe(0);
  });
});
