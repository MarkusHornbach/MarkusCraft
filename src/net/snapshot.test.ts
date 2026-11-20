import { describe, expect, it } from 'vitest';
import { CHUNK_VOLUME, SNAPSHOT_PART_BYTES } from '../game/config';
import type { WorldEdits } from '../save/saveFormat';
import { mulberry32 } from '../util/rng';
import { chunkKey } from '../world/chunk';
import { decodeHostMessage, encodeMessage } from './protocol';
import { joinParts, splitEdits, worldHash } from './snapshot';

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
      const text = encodeMessage({ t: 'snapshot', part, chunks });
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
