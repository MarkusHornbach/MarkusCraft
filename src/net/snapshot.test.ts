import { describe, expect, it } from 'vitest';
import { CHUNK_VOLUME, SNAPSHOT_PART_BYTES } from '../game/config';
import type { WorldEdits } from '../save/saveFormat';
import { mulberry32 } from '../util/rng';
import { chunkKey } from '../world/chunk';
import { decodeHostMessage, encodeMessage } from './protocol';
import { type ChestState, type WorldStates, emptyChest } from '../world/blockState';
import { joinParts, joinStates, splitEdits, splitSnapshot, worldHash } from './snapshot';

function randomEdits(seed: number, edits: number, chunks: number): WorldEdits {
  const rng = mulberry32(seed);
  const world: WorldEdits = new Map();
  let made = 0;
  while (made < edits) {
    const c = Math.floor(rng() * chunks);
    const key = chunkKey((c % 20) - 10, Math.floor(c / 20) - 5);
    let chunk = world.get(key);
    if (!chunk) {
      chunk = new Map();
      world.set(key, chunk);
    }
    const index = Math.floor(rng() * CHUNK_VOLUME);
    if (chunk.has(index)) continue;
    chunk.set(index, Math.floor(rng() * 20));
    made++;
  }
  return world;
}

describe('snapshot (Phase 6 AC3.5)', () => {
  it('50 000 edits in 200 chunks survive split → join; no part is too long', () => {
    const edits = randomEdits(5, 50_000, 200);
    expect(edits.size).toBe(200);
    const parts = splitEdits(edits);
    expect(parts.length).toBeGreaterThan(1);
    const decoded = parts.map((chunks, part) => {
      const text = encodeMessage({ t: 'snapshot', part, chunks, states: [] });
      expect(text.length).toBeLessThanOrEqual(SNAPSHOT_PART_BYTES);
      const message = decodeHostMessage(text);
      if (!message.ok || message.message.t !== 'snapshot') throw new Error('not a snapshot');
      return message.message.chunks;
    });
    expect(joinParts(decoded)).toEqual(edits);
    expect(worldHash(joinParts(decoded))).toBe(worldHash(edits));
  });

  it('one chunk full of edits is spread over several parts', () => {
    const edits = randomEdits(9, 20_000, 1);
    const parts = splitEdits(edits);
    expect(parts.length).toBeGreaterThan(5);
    expect(joinParts(parts)).toEqual(edits);
  });

  it('no edits give zero parts', () => {
    expect(splitEdits(new Map())).toEqual([]);
    expect(splitEdits(new Map([['0,0', new Map()]]))).toEqual([]);
  });

  it('the world hash ignores order and sees every edit', () => {
    const a: WorldEdits = new Map([
      [
        '0,0',
        new Map([
          [1, 2],
          [3, 4],
        ]),
      ],
      ['1,0', new Map([[5, 6]])],
    ]);
    const b: WorldEdits = new Map([
      ['1,0', new Map([[5, 6]])],
      [
        '0,0',
        new Map([
          [3, 4],
          [1, 2],
        ]),
      ],
    ]);
    expect(worldHash(a)).toBe(worldHash(b));
    b.get('1,0')?.set(5, 7);
    expect(worldHash(a)).not.toBe(worldHash(b));
    expect(worldHash(new Map())).toBe(0);
  });
});

/** Random chests: `count` states in `chunks` chunks, each with up to 27 filled slots. */
function randomStates(seed: number, count: number, chunks: number): WorldStates {
  const rng = mulberry32(seed);
  const states: WorldStates = new Map();
  for (let i = 0; i < count; i++) {
    const c = Math.floor(rng() * chunks);
    const key = chunkKey((c % 10) - 5, Math.floor(c / 10));
    let chunk = states.get(key);
    if (!chunk) {
      chunk = new Map();
      states.set(key, chunk);
    }
    const slots = emptyChest().slots.slice();
    for (let slot = 0; slot < 27; slot++) {
      if (rng() < 0.7)
        slots[slot] = { item: 1 + Math.floor(rng() * 300), count: 1 + Math.floor(rng() * 99) };
    }
    const state: ChestState = { kind: 'chest', slots };
    chunk.set(Math.floor(rng() * CHUNK_VOLUME), state);
  }
  return states;
}

describe('snapshot with block states (Phase 8B3a 6.5)', () => {
  it('Phase 8B3a AC3.1: 600 chests and 20 000 edits survive split → join; no part is too long', () => {
    const edits = randomEdits(3, 20_000, 60);
    const states = randomStates(4, 600, 40);
    const parts = splitSnapshot(edits, states);
    expect(parts.length).toBeGreaterThan(3);
    const decoded = parts.map((part, index) => {
      const text = encodeMessage({ t: 'snapshot', part: index, ...part });
      expect(text.length).toBeLessThanOrEqual(SNAPSHOT_PART_BYTES);
      const message = decodeHostMessage(text);
      if (!message.ok || message.message.t !== 'snapshot') throw new Error('not a snapshot');
      return message.message;
    });
    const joined = joinStates(decoded.map((m) => m.states));
    expect(joined).toEqual(states);
    expect(joinParts(decoded.map((m) => m.chunks))).toEqual(edits);
    expect(worldHash(joinParts(decoded.map((m) => m.chunks)), joined)).toBe(
      worldHash(edits, states),
    );
    // Every state arrives whole, in exactly one part.
    const sent = decoded.reduce((sum, m) => sum + m.states.length, 0);
    expect(sent).toBe([...states.values()].reduce((sum, c) => sum + c.size, 0));
  });

  it('states without edits make parts of their own; nothing gives no parts', () => {
    const states = randomStates(5, 3, 2);
    const parts = splitSnapshot(new Map(), states);
    expect(parts).toHaveLength(1);
    expect(parts[0].chunks).toEqual([]);
    expect(joinStates(parts.map((p) => p.states))).toEqual(states);
    expect(splitSnapshot(new Map(), new Map())).toEqual([]);
  });

  it('the hash sees every state, explicit empty ones too, and no order', () => {
    const states = randomStates(6, 10, 3);
    const reversed: WorldStates = new Map(
      [...states].reverse().map(([key, chunk]) => [key, new Map([...chunk].reverse())]),
    );
    expect(worldHash(new Map(), reversed)).toBe(worldHash(new Map(), states));
    const one = new Map([['0,0', new Map([[5, emptyChest()]])]]);
    expect(worldHash(new Map(), one)).not.toBe(worldHash(new Map(), new Map()));
    const changed = new Map([
      [
        '0,0',
        new Map([
          [
            5,
            {
              kind: 'chest' as const,
              slots: emptyChest().slots.map((s, i) => (i === 3 ? { item: 3, count: 1 } : s)),
            },
          ],
        ]),
      ],
    ]);
    expect(worldHash(new Map(), changed)).not.toBe(worldHash(new Map(), one));
  });
});
