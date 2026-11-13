import { describe, expect, it } from 'vitest';
import { Autosave, type SaveBatch } from './autosave';

/** A writer whose writes are finished (or failed) by the test. */
function fakeWriter() {
  const batches: SaveBatch[] = [];
  const pending: { resolve: () => void; reject: (error: Error) => void }[] = [];
  const writer = (batch: SaveBatch): Promise<void> => {
    batches.push(batch);
    return new Promise<void>((resolve, reject) => pending.push({ resolve, reject }));
  };
  // Lets the promise callbacks of the autosave run.
  const settle = async (): Promise<void> => {
    for (let i = 0; i < 5; i++) await Promise.resolve();
  };
  return {
    batches,
    writer,
    settle,
    finish: async (): Promise<void> => {
      pending.shift()?.resolve();
      await settle();
    },
    fail: async (message: string): Promise<void> => {
      pending.shift()?.reject(new Error(message));
      await settle();
    },
  };
}

describe('Autosave (Phase 3 AC3.5)', () => {
  it('writes nothing while nothing is dirty', () => {
    const { batches, writer } = fakeWriter();
    const autosave = new Autosave(writer, 5000);
    for (let t = 0; t <= 60_000; t += 1000) autosave.tick(t);
    expect(batches).toEqual([]);
    expect(autosave.dirty).toBe(false);
    expect(autosave.lastError).toBeNull();
  });

  it('writes a change 5 s after it, counted from the first unsaved change', async () => {
    const { batches, writer, finish } = fakeWriter();
    const autosave = new Autosave(writer, 5000);
    autosave.markChunk('0,0', 1000);
    expect(autosave.dirty).toBe(true);
    autosave.tick(3000);
    // A later change does not push the write back.
    autosave.markChunk('1,0', 4000);
    autosave.markMeta(4500);
    autosave.tick(5999);
    expect(batches).toEqual([]);
    autosave.tick(6000);
    expect(batches).toEqual([{ chunks: ['0,0', '1,0'], meta: true }]);
    // Still dirty until the write has completed.
    expect(autosave.dirty).toBe(true);
    autosave.tick(20_000);
    expect(batches.length).toBe(1);
    await finish();
    expect(autosave.dirty).toBe(false);
    autosave.tick(30_000);
    expect(batches.length).toBe(1);
  });

  it('writes only dirty chunks, and the meta record only when it changed', async () => {
    const { batches, writer, finish } = fakeWriter();
    const autosave = new Autosave(writer, 5000);
    autosave.markChunk('0,0', 0);
    autosave.markChunk('0,0', 10);
    autosave.tick(5000);
    await finish();
    autosave.markChunk('2,2', 6000);
    autosave.tick(11_000);
    await finish();
    autosave.markMeta(12_000);
    autosave.tick(17_000);
    await finish();
    expect(batches).toEqual([
      { chunks: ['0,0'], meta: false },
      { chunks: ['2,2'], meta: false },
      { chunks: [], meta: true },
    ]);
  });

  it('flush writes at once (pause, hide, exit) and resolves when it is written', async () => {
    const { batches, writer, finish, settle } = fakeWriter();
    const autosave = new Autosave(writer, 5000);
    // Nothing dirty: resolves without a write.
    await autosave.flush(0);
    expect(batches).toEqual([]);

    autosave.markChunk('0,0', 100);
    let flushed = false;
    void autosave.flush(200).then(() => {
      flushed = true;
    });
    await settle();
    expect(batches).toEqual([{ chunks: ['0,0'], meta: false }]);
    expect(flushed).toBe(false);
    await finish();
    expect(flushed).toBe(true);
    expect(autosave.dirty).toBe(false);
  });

  it('flush waits for a write under way and then writes what changed meanwhile', async () => {
    const { batches, writer, finish, settle } = fakeWriter();
    const autosave = new Autosave(writer, 5000);
    autosave.markChunk('0,0', 0);
    autosave.tick(5000);
    autosave.markChunk('1,1', 5100);
    let flushed = false;
    void autosave.flush(5200).then(() => {
      flushed = true;
    });
    await settle();
    expect(batches.length).toBe(1);
    await finish();
    expect(batches).toEqual([
      { chunks: ['0,0'], meta: false },
      { chunks: ['1,1'], meta: false },
    ]);
    expect(flushed).toBe(false);
    await finish();
    expect(flushed).toBe(true);
  });

  it('keeps everything dirty after a failed write and retries at the next interval', async () => {
    const { batches, writer, finish, fail } = fakeWriter();
    const autosave = new Autosave(writer, 5000);
    autosave.markChunk('0,0', 0);
    autosave.markMeta(0);
    autosave.tick(5000);
    autosave.markChunk('3,3', 5500);
    await fail('quota exceeded');
    expect(autosave.dirty).toBe(true);
    expect(autosave.lastError).toBe('quota exceeded');
    autosave.tick(9999);
    expect(batches.length).toBe(1);
    autosave.tick(10_000);
    expect(batches[1]).toEqual({ chunks: ['3,3', '0,0'], meta: true });
    await finish();
    expect(autosave.dirty).toBe(false);
    expect(autosave.lastError).toBeNull();
  });

  it('survives a writer that throws, and flush does not reject on failure', async () => {
    let calls = 0;
    const autosave = new Autosave(() => {
      calls++;
      throw new Error('no storage');
    }, 5000);
    autosave.markMeta(0);
    await autosave.flush(100);
    expect(calls).toBe(1);
    expect(autosave.lastError).toBe('no storage');
    expect(autosave.dirty).toBe(true);
    const rejecting = new Autosave(() => Promise.reject('plain text'), 5000);
    rejecting.markChunk('0,0', 0);
    await rejecting.flush(0);
    expect(rejecting.lastError).toBe('plain text');
  });
});
