import { describe, expect, it } from 'vitest';
import { HOTBAR_SLOTS, INVENTORY_SLOTS, WORLD_HEIGHT } from '../game/config';
import { expectFasterThan } from '../testing/timing';
import { mulberry32, randInt } from '../util/rng';
import { Block, HOTBAR_BLOCKS } from '../world/blocks';
import type { Action } from './actions';
import { type ActionContext, type ActionResult, applyAction } from './apply';
import { type PlayerRecord, createPlayerRecord } from './playerRecord';
import { LocalSession, type SessionListener } from './Session';

/** A small world as a map of cells; everything else is air, bedrock below y 0. */
class Cells {
  readonly cells = new Map<string, number>();
  sets = 0;
  getBlock(x: number, y: number, z: number): number {
    if (y < 0) return Block.BEDROCK;
    return this.cells.get(`${x},${y},${z}`) ?? Block.AIR;
  }
  setBlock(x: number, y: number, z: number, id: number): boolean {
    this.sets++;
    this.cells.set(`${x},${y},${z}`, id);
    return true;
  }
}

/** A stone floor at y 9; the player stands on it at the origin (feet at y 10). */
function scene(): { world: Cells; ctx: ActionContext } {
  const world = new Cells();
  for (let z = -8; z <= 8; z++) for (let x = -8; x <= 8; x++) world.setBlock(x, 9, z, Block.STONE);
  world.sets = 0;
  const pose = { x: 0.5, y: 10, z: 0.5 };
  return {
    world,
    ctx: { world, mode: 'creative', pose, record: createPlayerRecord('creative'), players: [pose] },
  };
}

function reasonOf(result: ActionResult): string {
  return result.ok ? 'ok' : result.reason;
}

describe('createPlayerRecord', () => {
  it('fills the bar with the nine Phase 1 blocks in Creative and nothing in Gathering', () => {
    const creative = createPlayerRecord('creative');
    expect(creative.slots.length).toBe(INVENTORY_SLOTS);
    expect(creative.slots.slice(0, HOTBAR_SLOTS).map((s) => s?.item)).toEqual([...HOTBAR_BLOCKS]);
    expect(creative.slots.slice(HOTBAR_SLOTS).every((s) => s === null)).toBe(true);
    expect(creative.selectedSlot).toBe(0);
    expect(creative.breaking).toBeNull();
    expect(createPlayerRecord('gathering').slots.every((s) => s === null)).toBe(true);
  });
});

describe('applyAction (Phase 3 AC2.3)', () => {
  it('selectSlot sets the slot and cancels a running break', () => {
    const { ctx } = scene();
    const record: PlayerRecord = {
      ...ctx.record,
      breaking: { x: 1, y: 9, z: 0, startMs: 0 },
    };
    const result = applyAction({ ...ctx, record }, { kind: 'selectSlot', slot: 4 }, 0);
    expect(result).toEqual({
      ok: true,
      blocks: [],
      player: { ...record, selectedSlot: 4, breaking: null },
      notices: [],
    });
  });

  it('break removes a block in Creative at once', () => {
    const { ctx } = scene();
    expect(applyAction(ctx, { kind: 'break', x: 2, y: 9, z: 0 }, 0)).toEqual({
      ok: true,
      blocks: [{ x: 2, y: 9, z: 0, id: Block.AIR }],
      player: null,
      notices: [],
    });
  });

  it('break follows the water rule: a hole next to water fills with water', () => {
    const { world, ctx } = scene();
    world.setBlock(3, 9, 0, Block.WATER);
    const result = applyAction(ctx, { kind: 'break', x: 2, y: 9, z: 0 }, 0);
    expect(result.ok && result.blocks).toEqual([{ x: 2, y: 9, z: 0, id: Block.WATER }]);
    // Water below does not flood the hole.
    world.setBlock(-2, 8, 0, Block.WATER);
    const dry = applyAction(ctx, { kind: 'break', x: -2, y: 9, z: 0 }, 0);
    expect(dry.ok && dry.blocks[0].id).toBe(Block.AIR);
  });

  it('break is refused as unbreakable for air, water and bedrock', () => {
    const { world, ctx } = scene();
    world.setBlock(1, 10, 0, Block.WATER);
    world.setBlock(2, 10, 0, Block.BEDROCK);
    expect(reasonOf(applyAction(ctx, { kind: 'break', x: 0, y: 11, z: 2 }, 0))).toBe('unbreakable');
    expect(reasonOf(applyAction(ctx, { kind: 'break', x: 1, y: 10, z: 0 }, 0))).toBe('unbreakable');
    expect(reasonOf(applyAction(ctx, { kind: 'break', x: 2, y: 10, z: 0 }, 0))).toBe('unbreakable');
  });

  it('block actions are refused as invalid outside the height range', () => {
    const { ctx } = scene();
    const low = { ...ctx, pose: { x: 0.5, y: 0, z: 0.5 } };
    expect(reasonOf(applyAction(low, { kind: 'break', x: 0, y: -1, z: 0 }, 0))).toBe('invalid');
    expect(reasonOf(applyAction(low, { kind: 'place', x: 0, y: -1, z: 0, slot: 0 }, 0))).toBe(
      'invalid',
    );
    const high = { ...ctx, pose: { x: 0.5, y: WORLD_HEIGHT - 2, z: 0.5 } };
    expect(reasonOf(applyAction(high, { kind: 'break', x: 0, y: WORLD_HEIGHT, z: 0 }, 0))).toBe(
      'invalid',
    );
    expect(
      reasonOf(applyAction(high, { kind: 'place', x: 0, y: WORLD_HEIGHT, z: 0, slot: 0 }, 0)),
    ).toBe('invalid');
  });

  it('block actions are refused beyond reach plus tolerance, measured from the eye', () => {
    const { world, ctx } = scene();
    // Eye at (0.5, 11.62, 0.5); block centres along +x at eye height: distance = x.
    for (let x = 1; x <= 8; x++) world.setBlock(x, 11, 0, Block.STONE);
    const near = Math.hypot(6, 11.5 - 11.62);
    expect(near).toBeLessThan(6.5);
    expect(reasonOf(applyAction(ctx, { kind: 'break', x: 6, y: 11, z: 0 }, 0))).toBe('ok');
    expect(reasonOf(applyAction(ctx, { kind: 'break', x: 7, y: 11, z: 0 }, 0))).toBe('reach');
    expect(reasonOf(applyAction(ctx, { kind: 'place', x: 6, y: 12, z: 0, slot: 0 }, 0))).toBe('ok');
    expect(reasonOf(applyAction(ctx, { kind: 'place', x: 7, y: 12, z: 0, slot: 0 }, 0))).toBe(
      'reach',
    );
    expect(reasonOf(applyAction(ctx, { kind: 'break', x: 0, y: 9, z: 100 }, 0))).toBe('reach');
  });

  it('place puts the block of the given bar slot into air or water', () => {
    const { world, ctx } = scene();
    world.setBlock(2, 10, 0, Block.WATER);
    for (let slot = 0; slot < HOTBAR_SLOTS; slot++) {
      const result = applyAction(ctx, { kind: 'place', x: 2, y: 10, z: 0, slot }, 0);
      expect(result).toEqual({
        ok: true,
        blocks: [{ x: 2, y: 10, z: 0, id: HOTBAR_BLOCKS[slot] }],
        // Creative: the bar is never used up.
        player: null,
        notices: [],
      });
    }
    expect(reasonOf(applyAction(ctx, { kind: 'place', x: 3, y: 10, z: 0, slot: 2 }, 0))).toBe('ok');
  });

  it('place is refused as occupied where a block is', () => {
    const { ctx } = scene();
    expect(reasonOf(applyAction(ctx, { kind: 'place', x: 2, y: 9, z: 0, slot: 0 }, 0))).toBe(
      'occupied',
    );
  });

  it('place is refused as occupied inside any player box', () => {
    const { ctx } = scene();
    // The acting player's own feet and head cells.
    expect(reasonOf(applyAction(ctx, { kind: 'place', x: 0, y: 10, z: 0, slot: 0 }, 0))).toBe(
      'occupied',
    );
    expect(reasonOf(applyAction(ctx, { kind: 'place', x: 0, y: 11, z: 0, slot: 0 }, 0))).toBe(
      'occupied',
    );
    // Right above the head is free.
    expect(reasonOf(applyAction(ctx, { kind: 'place', x: 0, y: 12, z: 0, slot: 0 }, 0))).toBe('ok');
    // A second player (Phase 4) blocks their cell as well.
    const other = { x: 3.5, y: 10, z: 0.5 };
    const two = { ...ctx, players: [ctx.pose, other] };
    expect(reasonOf(applyAction(two, { kind: 'place', x: 3, y: 10, z: 0, slot: 0 }, 0))).toBe(
      'occupied',
    );
    expect(reasonOf(applyAction(ctx, { kind: 'place', x: 3, y: 10, z: 0, slot: 0 }, 0))).toBe('ok');
  });

  it('place is refused as missing with an empty slot and as invalid for a non-placeable item', () => {
    const { ctx } = scene();
    const slots = [...ctx.record.slots];
    slots[0] = null;
    slots[1] = { item: Block.WATER, count: 1 };
    slots[2] = { item: Block.BEDROCK, count: 1 };
    slots[3] = { item: 300, count: 1 };
    slots[4] = { item: Block.COAL_ORE, count: 1 };
    const record = { ...ctx.record, slots };
    const at = (slot: number): string =>
      reasonOf(applyAction({ ...ctx, record }, { kind: 'place', x: 2, y: 10, z: 0, slot }, 0));
    expect(at(0)).toBe('missing');
    expect(at(1)).toBe('invalid');
    expect(at(2)).toBe('invalid');
    expect(at(3)).toBe('invalid');
    // The terrain blocks of Part A are not in the bar, but the rule would allow them.
    expect(at(4)).toBe('ok');
  });
});

function randomAction(rng: () => number): Action {
  const coord = (): number => randInt(rng, 16) - 8;
  const y = (): number => randInt(rng, 8) + 6;
  switch (randInt(rng, 3)) {
    case 0:
      return { kind: 'selectSlot', slot: randInt(rng, HOTBAR_SLOTS) };
    case 1:
      return { kind: 'break', x: coord(), y: y(), z: coord() };
    default:
      return { kind: 'place', x: coord(), y: y(), z: coord(), slot: randInt(rng, HOTBAR_SLOTS) };
  }
}

describe('applyAction purity and speed', () => {
  it('never changes its inputs over 1 000 seeded random actions (Phase 3 AC2.4)', () => {
    const { world, ctx } = scene();
    const frozen = JSON.stringify([...world.cells]);
    const record = JSON.stringify(ctx.record);
    const pose = JSON.stringify(ctx.pose);
    const rng = mulberry32(7);
    const outcomes = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      const action = randomAction(rng);
      const copy = JSON.stringify(action);
      outcomes.add(reasonOf(applyAction(ctx, action, i * 16)));
      expect(JSON.stringify(action)).toBe(copy);
    }
    expect(world.sets).toBe(0);
    expect(JSON.stringify([...world.cells])).toBe(frozen);
    expect(JSON.stringify(ctx.record)).toBe(record);
    expect(JSON.stringify(ctx.pose)).toBe(pose);
    // The mix exercised accepted and refused actions.
    expect(outcomes.has('ok')).toBe(true);
    expect(outcomes.has('occupied')).toBe(true);
    expect(outcomes.has('unbreakable')).toBe(true);
  });

  it('validates and applies an action in under 0.2 ms on average (Phase 3 AC2.8)', () => {
    const { world, ctx } = scene();
    const session = new LocalSession(
      { world, mode: 'creative', pose: () => ctx.pose, nowMs: () => 0 },
      ctx.record,
      { onBlocks: () => {}, onPlayer: () => {}, onResult: () => {} },
    );
    const rng = mulberry32(11);
    const actions = Array.from({ length: 10_000 }, () => randomAction(rng));
    let best = Infinity;
    for (let round = 0; round < 3; round++) {
      const start = performance.now();
      for (const action of actions) session.submit(action);
      best = Math.min(best, (performance.now() - start) / actions.length);
    }
    expectFasterThan(best, 0.2);
  });
});

describe('LocalSession (Phase 3 AC2.5)', () => {
  function setup() {
    const { world, ctx } = scene();
    const log: string[] = [];
    const results: ActionResult[] = [];
    let now = 0;
    const listener: SessionListener = {
      onBlocks: (changes) =>
        log.push(`blocks ${changes.map((c) => `${c.x},${c.y},${c.z}=${c.id}`)}`),
      onPlayer: (record) => log.push(`player ${record.selectedSlot}`),
      onResult: (action, result) => {
        log.push(`result ${action.kind} ${reasonOf(result)}`);
        results.push(result);
      },
    };
    const session = new LocalSession(
      { world, mode: 'creative', pose: () => ctx.pose, nowMs: () => now++ },
      ctx.record,
      listener,
    );
    return { world, session, log, results, record: ctx.record };
  }

  it('applies a valid action and reports blocks, then the result', () => {
    const { world, session, log } = setup();
    session.submit({ kind: 'break', x: 2, y: 9, z: 0 });
    expect(world.getBlock(2, 9, 0)).toBe(Block.AIR);
    expect(log).toEqual(['blocks 2,9,0=0', 'result break ok']);
    log.length = 0;
    session.submit({ kind: 'place', x: 2, y: 9, z: 0, slot: 7 });
    expect(world.getBlock(2, 9, 0)).toBe(Block.BRICKS);
    expect(log).toEqual([`blocks 2,9,0=${Block.BRICKS}`, 'result place ok']);
  });

  it('keeps the confirmed record and reports its changes', () => {
    const { session, log, record } = setup();
    expect(session.record).toBe(record);
    session.submit({ kind: 'selectSlot', slot: 5 });
    expect(session.record.selectedSlot).toBe(5);
    expect(session.record).not.toBe(record);
    expect(record.selectedSlot).toBe(0);
    expect(log).toEqual(['player 5', 'result selectSlot ok']);
  });

  it('reports a rejected action and changes nothing', () => {
    const { world, session, log, record } = setup();
    const before = JSON.stringify([...world.cells]);
    session.submit({ kind: 'break', x: 0, y: 9, z: 100 });
    session.submit({ kind: 'place', x: 0, y: 10, z: 0, slot: 0 });
    // Not an action at all: the session decodes whatever it is given.
    session.submit({ kind: 'break', x: 0.5, y: 9, z: 0 });
    session.submit({ kind: 'explode' } as unknown as Action);
    expect(log).toEqual([
      'result break reach',
      'result place occupied',
      'result break invalid',
      'result explode invalid',
    ]);
    expect(world.sets).toBe(0);
    expect(JSON.stringify([...world.cells])).toBe(before);
    expect(session.record).toBe(record);
  });
});
