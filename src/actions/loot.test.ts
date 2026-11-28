// State rules for generator 4's loot chests (Phase 8 part B3b, AC2.3, AC2.4): derived until
// touched, never refilled, broken by the usual rules, and every item total kept.
import { describe, expect, it } from 'vitest';
import { CHEST_SLOTS, CHUNK_SIZE, INVENTORY_SLOTS } from '../game/config';
import { breakTimeMs } from '../items/hardness';
import { encodeChunks } from '../save/saveFormat';
import { mulberry32, randInt } from '../util/rng';
import { Block } from '../world/blocks';
import { type BlockState, type ChestState, emptyChest, isEmptyState } from '../world/blockState';
import { type Shaft, shaftChestCell } from '../world/generation/shafts';
import { getTerrain } from '../world/generation/terrain';
import type { TerrainV4 } from '../world/generation/terrainV4';
import { World } from '../world/World';
import type { Action } from './actions';
import type { ActionResult } from './apply';
import {
  type GameMode,
  type ItemStack,
  type PlayerRecord,
  createPlayerRecord,
} from './playerRecord';
import { LocalSession } from './Session';

const GEN4 = { version: 4, options: { terrain: 'balanced', trees: 'few' } } as const;
const SEED = 1337;
const CHEST_MS = breakTimeMs(Block.CHEST) ?? 0;

interface Cell {
  x: number;
  y: number;
  z: number;
}

const terrain = getTerrain(SEED, GEN4) as TerrainV4;

function spawnShaft(): Shaft {
  const s = terrain.shafts.spawnShaft();
  if (!s) throw new Error('no spawn shaft');
  return s;
}

/** The nearest grid shaft to the spawn shaft. */
function gridShaft(): Shaft {
  const own = spawnShaft();
  const grid = terrain.shafts
    .shaftsIn(own.x - 400, own.z - 400, own.x + 400, own.z + 400)
    .filter((s) => !s.spawn)
    .sort((a, b) => Math.hypot(a.x - own.x, a.z - own.z) - Math.hypot(b.x - own.x, b.z - own.z));
  if (grid.length === 0) throw new Error('no grid shaft');
  return grid[0];
}

/** Generates and lights the chunks around a cell. */
function load(world: World, c: Cell): void {
  const cx = Math.floor(c.x / CHUNK_SIZE);
  const cz = Math.floor(c.z / CHUNK_SIZE);
  for (let dz = -2; dz <= 2; dz++)
    for (let dx = -2; dx <= 2; dx++) world.generate(cx + dx, cz + dz);
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) world.light(cx + dx, cz + dz);
}

/** A standing cell in the chamber next to the chest (the chest is the corner (-3, +3)). */
function standBy(chest: Cell): { x: number; y: number; z: number } {
  return { x: chest.x + 1.5, y: chest.y, z: chest.z - 0.5 };
}

function recordOf(mode: GameMode, stacks: Record<number, ItemStack> = {}): PlayerRecord {
  const record = createPlayerRecord(mode);
  const slots = mode === 'creative' ? record.slots.map(() => null) : [...record.slots];
  for (const [slot, stack] of Object.entries(stacks)) slots[Number(slot)] = stack;
  return { ...record, slots };
}

interface Play {
  world: World;
  session: LocalSession;
  results: ActionResult[];
  chest: Cell;
  advance(ms: number): void;
  setPose(p: { x: number; y: number; z: number }): void;
}

function play(mode: GameMode, stacks: Record<number, ItemStack> = {}, world?: World): Play {
  const w = world ?? new World(SEED, GEN4);
  const chest = shaftChestCell(spawnShaft());
  load(w, chest);
  let now = 0;
  let pose = standBy(chest);
  const results: ActionResult[] = [];
  const session = new LocalSession(
    { world: w, mode, pose: () => pose, nowMs: () => now },
    recordOf(mode, stacks),
    { onBlocks: () => {}, onPlayer: () => {}, onResult: (_a, r) => results.push(r) },
  );
  return {
    world: w,
    session,
    results,
    chest,
    advance: (ms) => {
      now += ms;
    },
    setPose: (p) => {
      pose = p;
    },
  };
}

function last(p: Play): ActionResult {
  const r = p.results[p.results.length - 1];
  if (!r) throw new Error('no answer');
  return r;
}

function reasonOf(r: ActionResult): string {
  return r.ok ? 'ok' : r.reason;
}

function chestAt(world: World, c: Cell): ChestState {
  const s = world.getState(c.x, c.y, c.z);
  if (!s) throw new Error('no chest');
  return s;
}

function filledSlots(state: BlockState): number[] {
  return state.slots.flatMap((s, i) => (s ? [i] : []));
}

function itemsOf(state: BlockState | null): Map<number, number> {
  const out = new Map<number, number>();
  for (const s of state?.slots ?? []) if (s) out.set(s.item, (out.get(s.item) ?? 0) + s.count);
  return out;
}

describe('loot chests (Phase 8B3b 6.3)', () => {
  it('Phase 8B3b AC2.1 an untouched loot chest reads the derived contents and stores nothing', () => {
    const p = play('gathering');
    const { world, chest } = p;
    expect(world.getBlock(chest.x, chest.y, chest.z)).toBe(Block.CHEST);
    const derived = chestAt(world, chest);
    expect(derived).toEqual(terrain.lootAt(chest.x, chest.y, chest.z));
    expect(isEmptyState(derived)).toBe(false);
    // Opening and closing store nothing.
    p.session.submit({ kind: 'openChest', ...chest });
    expect(reasonOf(last(p))).toBe('ok');
    p.session.submit({ kind: 'closeChest' });
    expect(world.storedState(chest.x, chest.y, chest.z)).toBeNull();
    expect(world.states.size).toBe(0);
    // No save bytes: no chunk record at all.
    expect(encodeChunks('w', world.edits, undefined, world.states)).toEqual([]);
    expect(world.verifyLight()).toBe(0);
  });

  it('Phase 8B3b AC2.3 take one stack, then all: the chest stays empty after reload and unload', () => {
    const p = play('gathering');
    const { world, chest } = p;
    const derived = chestAt(world, chest);
    const [first, ...rest] = filledSlots(derived);
    const item = derived.slots[first]?.item ?? 0;
    p.session.submit({ kind: 'quickMove', ...chest, slot: first, fromChest: true, item });
    expect(reasonOf(last(p))).toBe('ok');
    const partly = world.storedState(chest.x, chest.y, chest.z);
    expect(partly).not.toBeNull();
    expect(filledSlots(chestAt(world, chest))).toEqual(rest);
    // A partly emptied chest keeps exactly what is left, also after a reload.
    const reloaded = new World(SEED, GEN4, new Map(world.edits), new Map(world.states));
    load(reloaded, chest);
    expect(chestAt(reloaded, chest)).toEqual(partly);

    p.session.submit({ kind: 'takeAll', ...chest });
    expect(reasonOf(last(p))).toBe('ok');
    expect(isEmptyState(chestAt(world, chest))).toBe(true);
    for (const s of derived.slots) {
      if (!s) continue;
      const held = p.session.record.slots.filter((x) => x?.item === s.item);
      expect(held.reduce((a, x) => a + (x?.count ?? 0), 0)).toBeGreaterThanOrEqual(s.count);
    }
    // Reload: the empty chest is stored explicitly, so the loot never comes back.
    const again = new World(SEED, GEN4, new Map(world.edits), new Map(world.states));
    load(again, chest);
    expect(isEmptyState(chestAt(again, chest))).toBe(true);
    // Unload and load the chunk again.
    const cx = Math.floor(chest.x / CHUNK_SIZE);
    const cz = Math.floor(chest.z / CHUNK_SIZE);
    world.removeChunk(cx, cz);
    world.generate(cx, cz);
    expect(isEmptyState(chestAt(world, chest))).toBe(true);
    // Taking from an empty chest is refused.
    p.session.submit({ kind: 'takeAll', ...chest });
    expect(reasonOf(last(p))).toBe('missing');
    world.light(cx, cz);
    expect(world.verifyLight()).toBe(0);
  });

  it('Phase 8B3b AC2.3 Adventure: a broken loot chest gives the chest and its contents, or full', () => {
    // A full inventory first: the break answers `full` and the chest stays.
    const full: Record<number, ItemStack> = {};
    for (let i = 0; i < INVENTORY_SLOTS; i++) full[i] = { item: Block.DIRT, count: 99 };
    const blocked = play('gathering', full);
    const c = blocked.chest;
    blocked.session.submit({ kind: 'startBreak', ...c });
    expect(reasonOf(last(blocked))).toBe('full');
    expect(blocked.world.getBlock(c.x, c.y, c.z)).toBe(Block.CHEST);

    const p = play('gathering');
    const { world, chest } = p;
    const derived = chestAt(world, chest);
    p.session.submit({ kind: 'startBreak', ...chest });
    expect(reasonOf(last(p))).toBe('ok');
    p.advance(CHEST_MS + 100);
    p.session.submit({ kind: 'break', ...chest });
    expect(reasonOf(last(p))).toBe('ok');
    expect(world.getBlock(chest.x, chest.y, chest.z)).toBe(Block.AIR);
    const held = new Map<number, number>();
    for (const s of p.session.record.slots)
      if (s) held.set(s.item, (held.get(s.item) ?? 0) + s.count);
    for (const [item, count] of itemsOf(derived))
      expect(held.get(item) ?? 0).toBeGreaterThanOrEqual(count);
    expect(held.get(Block.CHEST)).toBe(1);
    expect(world.storedState(chest.x, chest.y, chest.z)).toBeNull();

    // A chest placed into the cell later is empty, and stored so.
    const slot = p.session.record.slots.findIndex((s) => s?.item === Block.CHEST);
    if (slot >= 9) {
      p.session.submit({ kind: 'moveStack', from: slot, to: 0 });
      expect(reasonOf(last(p))).toBe('ok');
    }
    const barSlot = p.session.record.slots.findIndex((s) => s?.item === Block.CHEST);
    p.session.submit({ kind: 'place', ...chest, slot: barSlot });
    expect(reasonOf(last(p))).toBe('ok');
    expect(world.getBlock(chest.x, chest.y, chest.z)).toBe(Block.CHEST);
    expect(world.storedState(chest.x, chest.y, chest.z)).toEqual(emptyChest());
    expect(isEmptyState(chestAt(world, chest))).toBe(true);
    expect(world.verifyLight()).toBe(0);
  });

  it('Phase 8B3b AC2.3 Creative: breaking a loot chest answers notEmpty until it is emptied', () => {
    const p = play('creative');
    const { world, chest } = p;
    p.session.submit({ kind: 'break', ...chest });
    expect(reasonOf(last(p))).toBe('notEmpty');
    expect(world.getBlock(chest.x, chest.y, chest.z)).toBe(Block.CHEST);
    p.session.submit({ kind: 'takeAll', ...chest });
    expect(reasonOf(last(p))).toBe('ok');
    if (!isEmptyState(chestAt(world, chest))) {
      // The bar has 9 slots; a rich chest may need two rounds.
      p.session.submit({ kind: 'takeAll', ...chest });
    }
    expect(isEmptyState(chestAt(world, chest))).toBe(true);
    p.session.submit({ kind: 'break', ...chest });
    expect(reasonOf(last(p))).toBe('ok');
    expect(world.getBlock(chest.x, chest.y, chest.z)).toBe(Block.AIR);
    expect(world.verifyLight()).toBe(0);
  });
});

describe('loot conservation (Phase 8B3b AC2.4)', () => {
  for (const mode of ['gathering', 'creative'] as const) {
    it(`1 000 random chest actions on two loot chests and a placed chest keep every total (${mode})`, () => {
      const start: Record<number, ItemStack> =
        mode === 'gathering'
          ? { 0: { item: Block.CHEST, count: 2 }, 1: { item: Block.STONE, count: 40 } }
          : { 0: { item: Block.CHEST, count: 1 }, 1: { item: Block.STONE, count: 1 } };
      const p = play(mode, start);
      const { world, session } = p;
      const spawnChest = p.chest;
      const gridChest = shaftChestCell(gridShaft());
      load(world, gridChest);
      // The placed chest stands in the spawn chamber, next to the loot chest.
      const placed = { x: spawnChest.x + 1, y: spawnChest.y, z: spawnChest.z };
      session.submit({ kind: 'place', ...placed, slot: 0 });
      expect(reasonOf(last(p))).toBe('ok');
      const cells = [spawnChest, gridChest, placed];

      const totals = (): Map<number, number> => {
        const out = new Map<number, number>();
        const add = (item: number, count: number): void => {
          out.set(item, (out.get(item) ?? 0) + count);
        };
        for (const s of session.record.slots) if (s) add(s.item, s.count);
        for (const c of cells) {
          if (world.getBlock(c.x, c.y, c.z) !== Block.CHEST) continue;
          add(Block.CHEST, 1);
          for (const [item, count] of itemsOf(world.getState(c.x, c.y, c.z))) add(item, count);
        }
        return out;
      };
      const before = totals();
      let chestDelta = 0;
      const rng = mulberry32(mode === 'gathering' ? 21 : 22);
      const playerSlots = mode === 'creative' ? 9 : INVENTORY_SLOTS;
      for (let i = 0; i < 1000; i++) {
        const cell = cells[randInt(rng, cells.length)];
        p.setPose(cell === gridChest ? standBy(gridChest) : standBy(spawnChest));
        const state = world.getState(cell.x, cell.y, cell.z);
        const roll = randInt(rng, 20);
        const fromChest = randInt(rng, 2) === 0;
        const from = randInt(rng, fromChest ? CHEST_SLOTS : playerSlots);
        const shown = (fromChest ? state?.slots[from] : session.record.slots[from])?.item;
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
          const slot = session.record.slots.findIndex((s) => s?.item === Block.CHEST);
          action =
            slot >= 0 && slot < 9
              ? { kind: 'place', ...cell, slot }
              : { kind: 'selectSlot', slot: randInt(rng, 9) };
        } else {
          action = { kind: 'selectSlot', slot: randInt(rng, 9) };
        }
        if (roll === 19) {
          if (mode === 'gathering') {
            session.submit({ kind: 'startBreak', ...cell });
            p.advance(5000);
          }
          action = { kind: 'break', ...cell };
        }
        const wasChest = world.getBlock(cell.x, cell.y, cell.z) === Block.CHEST;
        session.submit(action);
        const isChest = world.getBlock(cell.x, cell.y, cell.z) === Block.CHEST;
        if (mode === 'creative' && wasChest !== isChest) chestDelta += isChest ? 1 : -1;
        p.advance(16);
      }
      const after = totals();
      if (mode === 'creative') before.set(Block.CHEST, (before.get(Block.CHEST) ?? 0) + chestDelta);
      expect(after).toEqual(before);
      expect(p.results.filter((r) => r.ok).length).toBeGreaterThan(100);
      expect(world.verifyLight()).toBe(0);
    });
  }
});
