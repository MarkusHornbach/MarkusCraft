import { describe, expect, it } from 'vitest';
import { CHEST_SLOTS, INVENTORY_SLOTS, STACK_SIZE } from '../game/config';
import { breakTimeMs } from '../items/hardness';
import { Item } from '../items/items';
import { EMPTY_PROGRESS } from '../progress/progress';
import { mulberry32, randInt } from '../util/rng';
import { Block } from '../world/blocks';
import { type BlockState, type ChestState, emptyChest } from '../world/blockState';
import { createChunk } from '../world/chunk';
import { World } from '../world/World';
import { type Action, decodeAction } from './actions';
import { type ActionContext, type ActionResult, applyAction } from './apply';
import {
  type GameMode,
  type ItemStack,
  type PlayerRecord,
  createPlayerRecord,
} from './playerRecord';
import { LocalSession } from './Session';

const CHEST = { x: 3, y: 10, z: 0 };
const OTHER = { x: -3, y: 10, z: 0 };
const pose = { x: 0.5, y: 10, z: 0.5 };
const CHEST_MS = breakTimeMs(Block.CHEST) ?? 0;

/** Air with a stone floor at y 9, three lit chunks wide, and a chest at `CHEST`. */
function makeWorld(): World {
  const world = new World(1);
  for (let cz = -1; cz <= 1; cz++) {
    for (let cx = -1; cx <= 1; cx++) world.addChunk(createChunk(cx, cz));
  }
  for (let x = -8; x <= 8; x++) for (let z = -8; z <= 8; z++) world.setBlock(x, 9, z, Block.STONE);
  world.light(0, 0);
  world.setBlock(CHEST.x, CHEST.y, CHEST.z, Block.CHEST);
  return world;
}

function chestOf(stacks: Record<number, ItemStack>): ChestState {
  const slots = emptyChest().slots.slice();
  for (const [slot, stack] of Object.entries(stacks)) slots[Number(slot)] = stack;
  return { kind: 'chest', slots };
}

function recordOf(mode: GameMode, stacks: Record<number, ItemStack> = {}): PlayerRecord {
  const record = createPlayerRecord(mode);
  const slots = mode === 'creative' ? record.slots.map(() => null) : [...record.slots];
  for (const [slot, stack] of Object.entries(stacks)) slots[Number(slot)] = stack;
  return { ...record, slots };
}

function ctxOf(world: World, record: PlayerRecord, mode: GameMode = 'gathering'): ActionContext {
  return { world, mode, pose, record, players: [pose], progress: EMPTY_PROGRESS, states: world };
}

function reasonOf(result: ActionResult): string {
  return result.ok ? 'ok' : result.reason;
}

/** The chest state an accepted result stores at `CHEST`. */
function storedChest(result: ActionResult): ChestState {
  if (!result.ok || !result.states) throw new Error(`no state: ${reasonOf(result)}`);
  const change = result.states.find((c) => c.x === CHEST.x && c.y === CHEST.y && c.z === CHEST.z);
  if (!change?.state) throw new Error('chest removed');
  return change.state;
}

function playerOf(result: ActionResult): PlayerRecord {
  if (!result.ok || !result.player) throw new Error(`no record: ${reasonOf(result)}`);
  return result.player;
}

const stone = (count: number): ItemStack => ({ item: Block.STONE, count });
const planks = (count: number): ItemStack => ({ item: Block.PLANKS, count });

function move(
  from: number,
  fromChest: boolean,
  to: number,
  toChest: boolean,
  item: number,
): Action {
  return { kind: 'chestMove', ...CHEST, from, fromChest, to, toChest, item };
}

describe('chest actions are decoded (Phase 8B3a 6.3)', () => {
  it('accepts the five new kinds and refuses wrong fields', () => {
    for (const action of [
      move(0, true, 5, false, 3),
      { kind: 'quickMove', ...CHEST, slot: 4, fromChest: false, item: 3 },
      { kind: 'takeAll', ...CHEST },
      { kind: 'openChest', ...CHEST },
      { kind: 'closeChest' },
    ]) {
      expect(decodeAction(action)).toEqual({ ok: true, action });
    }
    expect(decodeAction({ ...move(0, true, 5, false, 3), fromChest: 1 }).ok).toBe(false);
    expect(decodeAction({ ...move(0, true, 36, false, 3) }).ok).toBe(false);
    expect(decodeAction({ ...move(0, true, 5, false, 0) }).ok).toBe(false);
    expect(decodeAction({ kind: 'closeChest', x: 1 }).ok).toBe(false);
    expect(decodeAction({ kind: 'takeAll', x: 1, y: 2 }).ok).toBe(false);
  });
});

describe('chestMove (Phase 8B3a AC2.1)', () => {
  it('moves a stack from the inventory into the chest and back', () => {
    const world = makeWorld();
    const record = recordOf('gathering', { 12: stone(40) });
    const into = applyAction(ctxOf(world, record), move(12, false, 3, true, Block.STONE), 0);
    expect(storedChest(into).slots[3]).toEqual(stone(40));
    expect(playerOf(into).slots[12]).toBeNull();
    world.setState(CHEST.x, CHEST.y, CHEST.z, storedChest(into));
    const back = applyAction(ctxOf(world, playerOf(into)), move(3, true, 0, false, Block.STONE), 0);
    expect(storedChest(back)).toEqual(emptyChest());
    expect(playerOf(back).slots[0]).toEqual(stone(40));
  });

  it('merges up to the stack size and swaps other items, in both directions', () => {
    const world = makeWorld();
    world.setState(CHEST.x, CHEST.y, CHEST.z, chestOf({ 0: stone(90), 1: planks(5) }));
    const record = recordOf('gathering', { 9: stone(30), 10: { item: Block.DIRT, count: 2 } });
    const merged = applyAction(ctxOf(world, record), move(9, false, 0, true, Block.STONE), 0);
    expect(storedChest(merged).slots[0]).toEqual(stone(STACK_SIZE));
    expect(playerOf(merged).slots[9]).toEqual(stone(30 - (STACK_SIZE - 90)));
    const swapped = applyAction(ctxOf(world, record), move(1, true, 10, false, Block.PLANKS), 0);
    expect(storedChest(swapped).slots[1]).toEqual({ item: Block.DIRT, count: 2 });
    expect(playerOf(swapped).slots[10]).toEqual(planks(5));
  });

  it('moves inside the chest and inside the player', () => {
    const world = makeWorld();
    world.setState(CHEST.x, CHEST.y, CHEST.z, chestOf({ 0: stone(9), 2: stone(5) }));
    const inChest = applyAction(ctxOf(world, recordOf('gathering')), move(0, true, 2, true, 3), 0);
    expect(storedChest(inChest).slots.slice(0, 3)).toEqual([null, null, stone(14)]);
    expect(inChest.ok && inChest.player).toBeNull();
    const record = recordOf('gathering', { 0: planks(3) });
    const inPlayer = applyAction(ctxOf(world, record), move(0, false, 20, false, 7), 0);
    expect(playerOf(inPlayer).slots[20]).toEqual(planks(3));
    // The chest is stored explicitly also when only the player's slots changed.
    expect(storedChest(inPlayer)).toEqual(chestOf({ 0: stone(9), 2: stone(5) }));
  });

  it('answers missing when the slot holds another item or nothing', () => {
    const world = makeWorld();
    world.setState(CHEST.x, CHEST.y, CHEST.z, chestOf({ 0: stone(9) }));
    const ctx = ctxOf(world, recordOf('gathering', { 4: planks(1) }));
    expect(reasonOf(applyAction(ctx, move(0, true, 1, false, Block.DIRT), 0))).toBe('missing');
    expect(reasonOf(applyAction(ctx, move(1, true, 1, false, Block.STONE), 0))).toBe('missing');
    expect(reasonOf(applyAction(ctx, move(4, false, 1, true, Block.STONE), 0))).toBe('missing');
  });

  it('answers reach beyond reach and invalid on a cell that is no chest', () => {
    const world = makeWorld();
    const ctx = ctxOf(world, recordOf('gathering', { 0: stone(1) }));
    const far = { kind: 'chestMove', x: 30, y: 10, z: 0 } as const;
    const fields = { from: 0, fromChest: false, to: 0, toChest: true, item: 3 };
    expect(reasonOf(applyAction(ctx, { ...far, ...fields }, 0))).toBe('reach');
    const noChest = { kind: 'chestMove', x: 1, y: 10, z: 2, ...fields } as const;
    expect(reasonOf(applyAction(ctx, noChest, 0))).toBe('invalid');
    expect(reasonOf(applyAction(ctx, move(0, false, 27, true, 3), 0))).toBe('invalid');
    expect(reasonOf(applyAction(ctx, move(0, false, 0, false, 3), 0))).toBe('invalid');
  });

  it('Creative: player slots are the bar only; equal items swap', () => {
    const world = makeWorld();
    world.setState(CHEST.x, CHEST.y, CHEST.z, chestOf({ 0: stone(1) }));
    const record = recordOf('creative', { 2: stone(1), 4: planks(1) });
    const ctx = ctxOf(world, record, 'creative');
    expect(reasonOf(applyAction(ctx, move(0, true, 9, false, 3), 0))).toBe('invalid');
    expect(reasonOf(applyAction(ctx, move(9, false, 0, true, 3), 0))).toBe('invalid');
    const swapped = applyAction(ctx, move(2, false, 0, true, Block.STONE), 0);
    expect(storedChest(swapped).slots[0]).toEqual(stone(1));
    expect(playerOf(swapped).slots[2]).toEqual(stone(1));
    const moved = applyAction(ctx, move(4, false, 5, true, Block.PLANKS), 0);
    expect(storedChest(moved).slots[5]).toEqual(planks(1));
    expect(playerOf(moved).slots[4]).toBeNull();
  });
});

describe('quickMove and takeAll (Phase 8B3a AC2.2)', () => {
  it('quick moves into the inventory: stacks of the item first, then slots 9–35, then the bar', () => {
    const world = makeWorld();
    world.setState(CHEST.x, CHEST.y, CHEST.z, chestOf({ 4: stone(50) }));
    const record = recordOf('gathering', { 1: stone(90) });
    const result = applyAction(
      ctxOf(world, record),
      { kind: 'quickMove', ...CHEST, slot: 4, fromChest: true, item: 3 },
      0,
    );
    const slots = playerOf(result).slots;
    expect(slots[1]).toEqual(stone(STACK_SIZE));
    expect(slots[9]).toEqual(stone(41));
    expect(storedChest(result).slots[4]).toBeNull();
  });

  it('quick moves into the chest in slot order and leaves what does not fit', () => {
    const world = makeWorld();
    const full: Record<number, ItemStack> = {};
    for (let i = 0; i < CHEST_SLOTS; i++) full[i] = planks(1);
    full[26] = stone(STACK_SIZE - 10);
    world.setState(CHEST.x, CHEST.y, CHEST.z, chestOf(full));
    const record = recordOf('gathering', { 0: stone(25) });
    const result = applyAction(
      ctxOf(world, record),
      { kind: 'quickMove', ...CHEST, slot: 0, fromChest: false, item: 3 },
      0,
    );
    expect(storedChest(result).slots[26]).toEqual(stone(STACK_SIZE));
    expect(playerOf(result).slots[0]).toEqual(stone(15));
    // Nothing fits any more: full.
    world.setState(CHEST.x, CHEST.y, CHEST.z, storedChest(result));
    const again = applyAction(
      ctxOf(world, playerOf(result)),
      { kind: 'quickMove', ...CHEST, slot: 0, fromChest: false, item: 3 },
      0,
    );
    expect(reasonOf(again)).toBe('full');
    const wrong = applyAction(
      ctxOf(world, playerOf(result)),
      { kind: 'quickMove', ...CHEST, slot: 0, fromChest: false, item: 7 },
      0,
    );
    expect(reasonOf(wrong)).toBe('missing');
  });

  it('Creative quick moves into the bar only', () => {
    const world = makeWorld();
    world.setState(CHEST.x, CHEST.y, CHEST.z, chestOf({ 0: stone(1) }));
    const bar: Record<number, ItemStack> = {};
    for (let i = 0; i < 9; i++) bar[i] = planks(1);
    const ctx = ctxOf(world, recordOf('creative', bar), 'creative');
    const action: Action = { kind: 'quickMove', ...CHEST, slot: 0, fromChest: true, item: 3 };
    expect(reasonOf(applyAction(ctx, action, 0))).toBe('full');
    const free = ctxOf(world, recordOf('creative', { 0: planks(1) }), 'creative');
    expect(playerOf(applyAction(free, action, 0)).slots[1]).toEqual(stone(1));
  });

  it('takes all in slot order, partly when the inventory fills up', () => {
    const world = makeWorld();
    world.setState(CHEST.x, CHEST.y, CHEST.z, chestOf({ 0: stone(10), 5: planks(20) }));
    const take: Action = { kind: 'takeAll', ...CHEST };
    const all = applyAction(ctxOf(world, recordOf('gathering')), take, 0);
    expect(storedChest(all)).toEqual(emptyChest());
    expect(playerOf(all).slots[9]).toEqual(stone(10));
    expect(playerOf(all).slots[10]).toEqual(planks(20));
    // Only room for the stone: the planks stay.
    const nearlyFull: Record<number, ItemStack> = {};
    for (let i = 0; i < INVENTORY_SLOTS; i++) nearlyFull[i] = { item: Block.DIRT, count: 1 };
    nearlyFull[30] = stone(80);
    const part = applyAction(ctxOf(world, recordOf('gathering', nearlyFull)), take, 0);
    expect(storedChest(part)).toEqual(chestOf({ 5: planks(20) }));
    expect(playerOf(part).slots[30]).toEqual(stone(90));
    nearlyFull[30] = { item: Block.DIRT, count: 1 };
    expect(reasonOf(applyAction(ctxOf(world, recordOf('gathering', nearlyFull)), take, 0))).toBe(
      'full',
    );
    world.setState(CHEST.x, CHEST.y, CHEST.z, emptyChest());
    expect(reasonOf(applyAction(ctxOf(world, recordOf('gathering')), take, 0))).toBe('missing');
  });

  it('opens and closes without changing anything; open checks reach and the block', () => {
    const world = makeWorld();
    const ctx = ctxOf(world, recordOf('gathering'));
    expect(applyAction(ctx, { kind: 'openChest', ...CHEST }, 0)).toEqual({
      ok: true,
      blocks: [],
      player: null,
      notices: [],
    });
    expect(reasonOf(applyAction(ctx, { kind: 'openChest', x: 1, y: 10, z: 0 }, 0))).toBe('invalid');
    expect(reasonOf(applyAction(ctx, { kind: 'openChest', x: 40, y: 10, z: 0 }, 0))).toBe('reach');
    expect(reasonOf(applyAction(ctx, { kind: 'closeChest' }, 0))).toBe('ok');
  });
});

describe('placing and breaking a chest (Phase 8B3a AC2.3)', () => {
  it('placing a chest stores an empty state', () => {
    const world = makeWorld();
    const record = recordOf('gathering', { 0: { item: Block.CHEST, count: 2 } });
    const result = applyAction(ctxOf(world, record), { kind: 'place', ...OTHER, slot: 0 }, 0);
    expect(result.ok && result.states).toEqual([{ ...OTHER, state: emptyChest() }]);
    expect(playerOf(result).slots[0]).toEqual({ item: Block.CHEST, count: 1 });
  });

  it('Adventure: the chest and all its contents go into the inventory, with notices', () => {
    const world = makeWorld();
    world.setState(CHEST.x, CHEST.y, CHEST.z, chestOf({ 0: stone(64), 3: stone(5), 7: planks(2) }));
    let ctx = ctxOf(world, recordOf('gathering', { 0: { item: Item.WOODEN_AXE, count: 1 } }));
    const start = applyAction(ctx, { kind: 'startBreak', ...CHEST }, 0);
    ctx = { ...ctx, record: playerOf(start) };
    const result = applyAction(ctx, { kind: 'break', ...CHEST }, CHEST_MS);
    if (!result.ok) throw new Error(result.reason);
    expect(result.blocks).toEqual([{ ...CHEST, id: Block.AIR }]);
    expect(result.states).toEqual([{ ...CHEST, state: null }]);
    expect(result.notices).toEqual([
      { item: Block.CHEST, count: 1 },
      { item: Block.STONE, count: 69 },
      { item: Block.PLANKS, count: 2 },
    ]);
    const slots = playerOf(result).slots;
    expect(slots.slice(1, 4)).toEqual([{ item: Block.CHEST, count: 1 }, stone(69), planks(2)]);
  });

  it('Adventure: if not everything fits, startBreak and break answer full', () => {
    const world = makeWorld();
    world.setState(CHEST.x, CHEST.y, CHEST.z, chestOf({ 0: stone(10), 1: planks(10) }));
    const crowded: Record<number, ItemStack> = {};
    for (let i = 0; i < INVENTORY_SLOTS; i++) crowded[i] = { item: Block.DIRT, count: 1 };
    // Room for the chest item and the stone, not the planks.
    delete crowded[34];
    crowded[35] = stone(80);
    const record = recordOf('gathering', crowded);
    const ctx = ctxOf(world, record);
    expect(reasonOf(applyAction(ctx, { kind: 'startBreak', ...CHEST }, 0))).toBe('full');
    const breaking = { ...record, breaking: { ...CHEST, startMs: 0 } };
    expect(reasonOf(applyAction(ctxOf(world, breaking), { kind: 'break', ...CHEST }, 5000))).toBe(
      'full',
    );
    // An empty chest only needs room for itself.
    world.setState(CHEST.x, CHEST.y, CHEST.z, emptyChest());
    expect(reasonOf(applyAction(ctx, { kind: 'startBreak', ...CHEST }, 0))).toBe('ok');
  });

  it('Creative: notEmpty while the chest holds items; empty, it breaks', () => {
    const world = makeWorld();
    world.setState(CHEST.x, CHEST.y, CHEST.z, chestOf({ 26: stone(1) }));
    const ctx = ctxOf(world, recordOf('creative'), 'creative');
    expect(reasonOf(applyAction(ctx, { kind: 'break', ...CHEST }, 0))).toBe('notEmpty');
    world.setState(CHEST.x, CHEST.y, CHEST.z, emptyChest());
    const result = applyAction(ctx, { kind: 'break', ...CHEST }, 0);
    expect(result.ok && result.states).toEqual([{ ...CHEST, state: null }]);
  });

  it('a torch on a chest comes off with it (the support rule is unchanged)', () => {
    const world = makeWorld();
    world.setBlock(CHEST.x, CHEST.y + 1, CHEST.z, Block.TORCH);
    const ctx = ctxOf(world, recordOf('creative'), 'creative');
    const result = applyAction(ctx, { kind: 'break', ...CHEST }, 0);
    expect(result.ok && result.blocks.map((b) => b.y)).toEqual([CHEST.y, CHEST.y + 1]);
    expect(world.verifyLight()).toBe(0);
  });
});

/** Every item of the player, the chests' contents, and every chest block as a chest item. */
function totals(world: World, record: PlayerRecord): Map<number, number> {
  const out = new Map<number, number>();
  const add = (item: number, count: number): void => {
    out.set(item, (out.get(item) ?? 0) + count);
  };
  for (const stack of record.slots) if (stack) add(stack.item, stack.count);
  for (const cell of [CHEST, OTHER]) {
    if (world.getBlock(cell.x, cell.y, cell.z) !== Block.CHEST) continue;
    add(Block.CHEST, 1);
    const state = world.getState(cell.x, cell.y, cell.z);
    for (const stack of state?.slots ?? []) if (stack) add(stack.item, stack.count);
  }
  return out;
}

describe('conservation (Phase 8B3a AC2.4)', () => {
  for (const mode of ['gathering', 'creative'] as const) {
    it(`2 000 random chest and inventory actions keep every item total (${mode})`, () => {
      const world = makeWorld();
      let now = 0;
      const start: Record<number, ItemStack> =
        mode === 'gathering'
          ? {
              0: { item: Block.CHEST, count: 3 },
              1: stone(99),
              2: stone(40),
              12: planks(64),
              20: { item: Block.DIRT, count: 30 },
              30: { item: Item.WOODEN_AXE, count: 1 },
            }
          : { 0: { item: Block.CHEST, count: 1 }, 1: stone(1), 2: planks(1), 5: stone(1) };
      const results: ActionResult[] = [];
      const session = new LocalSession(
        { world, mode, pose: () => pose, nowMs: () => now },
        recordOf(mode, start),
        { onBlocks: () => {}, onPlayer: () => {}, onResult: (_a, r) => results.push(r) },
      );
      const before = totals(world, session.record);
      let chestDelta = 0;
      const rng = mulberry32(mode === 'gathering' ? 11 : 12);
      const playerSlots = mode === 'creative' ? 9 : INVENTORY_SLOTS;
      for (let i = 0; i < 2000; i++) {
        const cell = randInt(rng, 2) === 0 ? CHEST : OTHER;
        const state: BlockState | null = world.getState(cell.x, cell.y, cell.z);
        const roll = randInt(rng, 20);
        const fromChest = randInt(rng, 2) === 0;
        const from = randInt(rng, fromChest ? CHEST_SLOTS : playerSlots);
        const shown = (fromChest ? state?.slots[from] : session.record.slots[from])?.item;
        // Mostly the item the screen shows, sometimes a stale one.
        const item = randInt(rng, 8) === 0 ? 1 + randInt(rng, 8) : (shown ?? 3);
        let action: Action;
        if (roll < 10) {
          const toChest = randInt(rng, 2) === 0;
          const to = randInt(rng, toChest ? CHEST_SLOTS : playerSlots);
          action = { kind: 'chestMove', ...cell, from, fromChest, to, toChest, item };
        } else if (roll < 14) {
          action = { kind: 'quickMove', ...cell, slot: from, fromChest, item };
        } else if (roll < 16) {
          action = { kind: 'takeAll', ...cell };
        } else if (roll < 18) {
          // Only chests are placed: other blocks in these cells would leave the count.
          const slot = session.record.slots.findIndex((s) => s?.item === Block.CHEST);
          action =
            slot >= 0 && slot < 9
              ? { kind: 'place', ...cell, slot }
              : { kind: 'selectSlot', slot: randInt(rng, 9) };
        } else {
          action = { kind: 'selectSlot', slot: randInt(rng, 9) };
        }
        if (roll === 19) {
          // A break: started, then due.
          if (mode === 'gathering') {
            session.submit({ kind: 'startBreak', ...cell });
            now += 5000;
          }
          action = { kind: 'break', ...cell };
        }
        const wasChest = world.getBlock(cell.x, cell.y, cell.z) === Block.CHEST;
        session.submit(action);
        const isChest = world.getBlock(cell.x, cell.y, cell.z) === Block.CHEST;
        if (mode === 'creative' && wasChest !== isChest) chestDelta += isChest ? 1 : -1;
        now += 16;
      }
      const after = totals(world, session.record);
      if (mode === 'creative') {
        before.set(Block.CHEST, (before.get(Block.CHEST) ?? 0) + chestDelta);
      }
      expect(after).toEqual(before);
      expect(results.filter((r) => r.ok).length).toBeGreaterThan(200);
      expect(world.verifyLight()).toBe(0);
    });
  }
});
