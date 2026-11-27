import { describe, expect, it } from 'vitest';
import { BOOK_VERSION, CHEST_SLOTS, SAVE_FORMAT_VERSION, STACK_SIZE } from '../game/config';
import { Block } from '../world/blocks';
import { type ChestState, type WorldStates, emptyChest } from '../world/blockState';
import { blockIndex, chunkKey } from '../world/chunk';
import { World } from '../world/World';
import { sampleMeta } from '../testing/sampleWorld';
import { MemoryStore } from './WorldStore';
import {
  type ChunkRecord,
  decodeChunk,
  decodeMeta,
  decodeWorld,
  encodeChunk,
  encodeChunks,
  encodeMeta,
} from './saveFormat';

function throughJson(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value)) as unknown;
}

function chestOf(stacks: Record<number, { item: number; count: number }>): ChestState {
  const slots = emptyChest().slots.slice();
  for (const [slot, stack] of Object.entries(stacks)) slots[Number(slot)] = stack;
  return { kind: 'chest', slots };
}

const INDEX = blockIndex(3, 70, 5);

/** A chunk record of format 6 with one chest state, as the game writes it. */
function chestRecord(states: unknown): Record<string, unknown> {
  return { key: 'w1|0,0', worldId: 'w1', cx: 0, cz: 0, edits: [INDEX, Block.CHEST], states };
}

describe('format 6: block states in chunk records (Phase 8B3a AC4.1, AC4.3, AC4.4)', () => {
  it('Phase 8B3a AC4.1: a chunk with a chest round-trips; a chunk with states only too', () => {
    expect(SAVE_FORMAT_VERSION).toBe(6);
    const chest = chestOf({ 0: { item: Block.STONE, count: 64 }, 26: { item: 9999, count: 1 } });
    const record = encodeChunk(
      'w1',
      0,
      0,
      new Map([[INDEX, Block.CHEST]]),
      new Map([[INDEX, chest]]),
    );
    expect(record.states).toEqual([[INDEX, 'chest', [0, Block.STONE, 64, 26, 9999, 1]]]);
    const decoded = decodeChunk(throughJson(record));
    expect(decoded.ok && decoded.value.states).toEqual(new Map([[INDEX, chest]]));
    // An unknown item id loads (shows as "Unknown item").
    const statesOnly = encodeChunks(
      'w1',
      new Map(),
      undefined,
      new Map([['2,-1', new Map([[7, chest]])]]),
    );
    expect(statesOnly.map((r) => [r.cx, r.cz, r.edits])).toEqual([[2, -1, []]]);
    const back = decodeChunk(throughJson(statesOnly[0]));
    expect(back.ok && [...back.value.states.keys()]).toEqual([7]);
    // An explicitly stored empty chest stays explicit.
    const empty = encodeChunk('w1', 0, 0, new Map(), new Map([[INDEX, emptyChest()]]));
    expect(empty.states).toEqual([[INDEX, 'chest', []]]);
  });

  it('a chunk without states leaves the field out; records of format 1–5 load without states', () => {
    const record = encodeChunk('w1', 0, 0, new Map([[1, 2]]));
    expect('states' in record).toBe(false);
    const decoded = decodeChunk(throughJson(record));
    expect(decoded.ok && decoded.value.states.size).toBe(0);
  });

  it('a chunk named on purpose is written even when it has nothing (no stale state survives)', () => {
    const records = encodeChunks('w1', new Map(), ['4,4']);
    expect(records).toEqual([{ key: 'w1|4,4', worldId: 'w1', cx: 4, cz: 4, edits: [] }]);
  });

  it('Phase 8B3a AC4.3: a state that does not check out makes the chunk damaged', () => {
    const bad: unknown[] = [
      'nope',
      [[INDEX, 'chest']],
      [[-1, 'chest', []]],
      [[16 * 16 * 128, 'chest', []]],
      [
        [INDEX, 'chest', []],
        [INDEX, 'chest', []],
      ],
      [[INDEX, 'furnace', []]],
      [[INDEX, 7, []]],
      [[INDEX, 'chest', [0, 3]]],
      [[INDEX, 'chest', [27, 3, 1]]],
      [[INDEX, 'chest', [-1, 3, 1]]],
      [[INDEX, 'chest', [0, 3, 1, 0, 4, 1]]],
      [[INDEX, 'chest', [0, 3, 0]]],
      [[INDEX, 'chest', [0, 3, STACK_SIZE + 1]]],
      [[INDEX, 'chest', [0, 0, 1]]],
      [[INDEX, 'chest', [0, 65536, 1]]],
      [[INDEX, 'chest', [0, 3.5, 1]]],
      [[INDEX, 'chest', 'slots']],
    ];
    for (const states of bad) {
      expect(decodeChunk(chestRecord(states)), JSON.stringify(states)).toEqual({
        ok: false,
        error: 'damaged',
      });
    }
    expect(decodeChunk(chestRecord([[INDEX, 'chest', [26, 65535, STACK_SIZE]]])).ok).toBe(true);
  });

  it('Phase 8B3a AC4.4: a full chest of 27 different stacks costs at most 400 bytes', () => {
    const stacks: Record<number, { item: number; count: number }> = {};
    // The largest ids and counts a chest of this build can hold.
    for (let slot = 0; slot < CHEST_SLOTS; slot++)
      stacks[slot] = { item: 241 + slot, count: STACK_SIZE };
    const withChest = encodeChunk(
      'w1',
      0,
      0,
      new Map([[INDEX, Block.CHEST]]),
      new Map([[INDEX, chestOf(stacks)]]),
    );
    const without = encodeChunk('w1', 0, 0, new Map([[INDEX, Block.CHEST]]));
    const cost = JSON.stringify(withChest).length - JSON.stringify(without).length;
    expect(cost).toBeLessThanOrEqual(400);
  });
});

describe('format 6: the book version (Phase 8B3a AC4.2, AC4.3)', () => {
  it('writes progress.book and reads it back', () => {
    const meta = sampleMeta({ mode: 'gathering' });
    const record = encodeMeta(meta);
    expect(record.formatVersion).toBe(6);
    expect(record.progress).toEqual({ done: [], counts: [], book: BOOK_VERSION });
    expect(decodeMeta(throughJson(record))).toEqual({ ok: true, value: meta });
  });

  it('Phase 8B3a AC4.3: a format 6 record without a valid book is damaged; a later book is newer', () => {
    const record = encodeMeta(sampleMeta()) as { progress: Record<string, unknown> };
    for (const book of [undefined, 0, -1, 1.5, '1', null]) {
      const progress = { ...record.progress, book };
      expect(decodeMeta({ ...record, progress }), String(book)).toEqual({
        ok: false,
        error: 'damaged',
      });
    }
    const later = { ...record, progress: { ...record.progress, book: BOOK_VERSION + 1 } };
    expect(decodeMeta(later)).toEqual({ ok: false, error: 'newer' });
    expect(decodeMeta({ ...record, formatVersion: 7 })).toEqual({ ok: false, error: 'newer' });
  });

  it('Phase 8B3a AC4.2: worlds of format 1–5 load with book 1 and no states, written back as 6', () => {
    const current = encodeMeta(sampleMeta({ mode: 'gathering' })) as Record<string, unknown>;
    const { book: _book, ...oldProgress } = current.progress as Record<string, unknown>;
    const chunk = { key: 'w1|0,0', worldId: 'w1', cx: 0, cz: 0, edits: [INDEX, Block.PLANKS] };
    for (const formatVersion of [4, 5]) {
      const old: Record<string, unknown> = { ...current, formatVersion, progress: oldProgress };
      if (formatVersion === 4) {
        const player = old.player as Record<string, unknown>;
        old.player = { ...player, track: undefined };
      }
      const loaded = decodeWorld(throughJson(old), [chunk]);
      expect(loaded.ok, String(formatVersion)).toBe(true);
      if (!loaded.ok) continue;
      expect(loaded.value.meta.book).toBe(1);
      expect(loaded.value.states.size).toBe(0);
      const written = encodeMeta(loaded.value.meta);
      expect(written.formatVersion).toBe(6);
      expect((written.progress as { book: number }).book).toBe(1);
    }
  });
});

describe('a world with chests through the store (Phase 8B3a AC4.1)', () => {
  it('saves and reloads the same contents; the world drops nothing', async () => {
    const store = new MemoryStore();
    const meta = sampleMeta({ mode: 'gathering' });
    await store.create(meta);
    const world = new World(meta.seed);
    world.setBlock(3, 70, 5, Block.CHEST);
    world.setBlock(-20, 70, 40, Block.CHEST);
    world.setState(3, 70, 5, chestOf({ 4: { item: Block.LOG, count: 12 } }));
    world.setState(-20, 70, 40, emptyChest());
    const keys = [chunkKey(0, 0), chunkKey(-2, 2)];
    await store.saveChunks(meta.id, world.edits, keys, world.states);
    const loaded = await store.load(meta.id);
    if (!loaded?.ok) throw new Error('not loaded');
    const states: WorldStates = loaded.value.states;
    const again = new World(meta.seed, undefined, loaded.value.edits, states);
    again.generate(0, 0);
    again.generate(-2, 2);
    expect(again.getState(3, 70, 5)).toEqual(chestOf({ 4: { item: Block.LOG, count: 12 } }));
    expect(again.storedState(-20, 70, 40)).toEqual(emptyChest());
    expect(again.droppedStates).toBe(0);
    // Breaking the chest and saving the chunk leaves no state behind.
    again.setBlock(3, 70, 5, Block.AIR);
    await store.saveChunks(meta.id, again.edits, [chunkKey(0, 0)], again.states);
    const record = store.chunks.get('w1|0,0') as ChunkRecord;
    expect(record.states).toBeUndefined();
  });
});
