// WorldStore: where worlds are kept. The interface, and a store in memory for tests.
import {
  type ChunkRecord,
  type Decoded,
  type LoadedWorld,
  type WorldEdits,
  type WorldListEntry,
  type WorldMeta,
  decodeWorld,
  encodeChunks,
  encodeMeta,
  listEntries,
} from './saveFormat';

export interface WorldStore {
  /** All stored worlds, most recently played first; worlds that cannot be opened last. */
  list(): Promise<WorldListEntry[]>;
  /** Stores a new world (without edits). */
  create(meta: WorldMeta): Promise<void>;
  /** Null if no world has this id. */
  load(id: string): Promise<Decoded<LoadedWorld> | null>;
  saveMeta(meta: WorldMeta): Promise<void>;
  /** Writes the edits of the chunks named by `keys` (chunk keys of `edits`). */
  saveChunks(worldId: string, edits: WorldEdits, keys: Iterable<string>): Promise<void>;
  /** Removes the world and all its chunk records. */
  delete(id: string): Promise<void>;
}

/** Keeps the same plain records as the real store, in memory. Nothing outlives the page. */
export class MemoryStore implements WorldStore {
  /** Raw records by world id; tests may plant damaged ones. */
  readonly worlds = new Map<string, unknown>();
  readonly chunks = new Map<string, ChunkRecord>();
  /** Test hook: the next writes fail with this error. */
  failWrites: Error | null = null;

  async list(): Promise<WorldListEntry[]> {
    return listEntries([...this.worlds.values()], [...this.worlds.keys()]);
  }

  async create(meta: WorldMeta): Promise<void> {
    this.checkWrite();
    if (this.worlds.has(meta.id)) throw new Error(`World ${meta.id} exists already`);
    this.worlds.set(meta.id, encodeMeta(meta));
  }

  async load(id: string): Promise<Decoded<LoadedWorld> | null> {
    const meta = this.worlds.get(id);
    if (meta === undefined) return null;
    const chunks = [...this.chunks.values()].filter((record) => record.worldId === id);
    // Copies, as a real store hands out: the caller may change what it gets.
    return decodeWorld(structuredClone(meta), structuredClone(chunks));
  }

  async saveMeta(meta: WorldMeta): Promise<void> {
    this.checkWrite();
    this.worlds.set(meta.id, encodeMeta(meta));
  }

  async saveChunks(worldId: string, edits: WorldEdits, keys: Iterable<string>): Promise<void> {
    this.checkWrite();
    for (const record of encodeChunks(worldId, edits, keys)) this.chunks.set(record.key, record);
  }

  async delete(id: string): Promise<void> {
    this.checkWrite();
    this.worlds.delete(id);
    for (const [key, record] of this.chunks) {
      if (record.worldId === id) this.chunks.delete(key);
    }
  }

  private checkWrite(): void {
    if (this.failWrites) throw this.failWrites;
  }
}
