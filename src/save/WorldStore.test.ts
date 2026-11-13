import { describe, expect, it } from 'vitest';
import { sampleMeta } from '../testing/sampleWorld';
import type { WorldEdits } from './saveFormat';
import { MemoryStore } from './WorldStore';

function editsOf(...chunks: [string, [number, number][]][]): WorldEdits {
  return new Map(chunks.map(([key, pairs]) => [key, new Map(pairs)]));
}

describe('MemoryStore (Phase 3 AC3.4)', () => {
  it('creates, lists most recently played first, loads and saves', async () => {
    const store = new MemoryStore();
    expect(await store.list()).toEqual([]);
    expect(await store.load('a')).toBeNull();

    const a = sampleMeta({ id: 'a', name: 'First', playedMs: 1000 });
    const b = sampleMeta({ id: 'b', name: 'Second', playedMs: 2000, seed: 7 });
    await store.create(a);
    await store.create(b);
    await expect(store.create(a)).rejects.toThrow(/exists/);
    expect((await store.list()).map((e) => e.id)).toEqual(['b', 'a']);

    // Playing the first world again moves it to the top.
    await store.saveMeta({ ...a, playedMs: 3000, time: 0.5 });
    const list = await store.list();
    expect(list.map((e) => e.id)).toEqual(['a', 'b']);
    expect(list[0]).toMatchObject({ status: 'ok', meta: { name: 'First', time: 0.5 } });

    const loaded = await store.load('a');
    expect(loaded).toEqual({
      ok: true,
      value: { meta: { ...a, playedMs: 3000, time: 0.5 }, edits: new Map() },
    });
  });

  it('writes only the chunks it is told to and keeps worlds apart', async () => {
    const store = new MemoryStore();
    await store.create(sampleMeta({ id: 'a' }));
    await store.create(sampleMeta({ id: 'b' }));
    const editsA = editsOf(['0,0', [[5, 3]]], ['1,-2', [[9, 8]]]);
    await store.saveChunks('a', editsA, ['0,0']);
    let a = await store.load('a');
    expect(a?.ok && [...a.value.edits.keys()]).toEqual(['0,0']);
    await store.saveChunks('a', editsA, ['1,-2', '7,7']);
    await store.saveChunks('b', editsOf(['0,0', [[5, 14]]]), ['0,0']);

    a = await store.load('a');
    const b = await store.load('b');
    expect(a?.ok && a.value.edits).toEqual(editsA);
    expect(b?.ok && b.value.edits).toEqual(editsOf(['0,0', [[5, 14]]]));

    // A chunk is replaced as a whole when it is written again.
    editsA.get('0,0')?.set(6, 1);
    await store.saveChunks('a', editsA, ['0,0']);
    a = await store.load('a');
    expect(a?.ok && a.value.edits.get('0,0')).toEqual(
      new Map([
        [5, 3],
        [6, 1],
      ]),
    );
    // What was loaded is a copy.
    if (a?.ok) a.value.edits.get('0,0')?.set(1, 1);
    const again = await store.load('a');
    expect(again?.ok && again.value.edits.get('0,0')?.size).toBe(2);
  });

  it('deletes a world together with its chunk records', async () => {
    const store = new MemoryStore();
    await store.create(sampleMeta({ id: 'a' }));
    await store.create(sampleMeta({ id: 'b' }));
    await store.saveChunks('a', editsOf(['0,0', [[1, 1]]], ['3,3', [[2, 2]]]), ['0,0', '3,3']);
    await store.saveChunks('b', editsOf(['0,0', [[1, 2]]]), ['0,0']);
    expect(store.chunks.size).toBe(3);
    await store.delete('a');
    expect(await store.load('a')).toBeNull();
    expect((await store.list()).map((e) => e.id)).toEqual(['b']);
    expect([...store.chunks.keys()]).toEqual(['b|0,0']);
    const b = await store.load('b');
    expect(b?.ok && b.value.edits.get('0,0')?.get(1)).toBe(2);
    // Deleting what is not there is not an error.
    await store.delete('a');
  });

  it('lists and reports damaged and newer worlds without opening them', async () => {
    const store = new MemoryStore();
    await store.create(sampleMeta({ id: 'a' }));
    store.worlds.set('bad', { id: 'bad', name: 'Broken' });
    store.worlds.set('new', { id: 'new', name: 'Later', formatVersion: 5 });
    expect((await store.list()).map((e) => [e.id, e.status])).toEqual([
      ['a', 'ok'],
      ['bad', 'damaged'],
      ['new', 'newer'],
    ]);
    expect(await store.load('bad')).toEqual({ ok: false, error: 'damaged' });
    expect(await store.load('new')).toEqual({ ok: false, error: 'newer' });
    await store.delete('bad');
    expect((await store.list()).length).toBe(2);
  });

  it('can be made to fail for tests of the error path', async () => {
    const store = new MemoryStore();
    store.failWrites = new Error('quota');
    await expect(store.create(sampleMeta())).rejects.toThrow('quota');
    await expect(store.saveMeta(sampleMeta())).rejects.toThrow('quota');
    await expect(store.saveChunks('a', new Map(), [])).rejects.toThrow('quota');
    await expect(store.delete('a')).rejects.toThrow('quota');
  });
});
