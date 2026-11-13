// IdbStore: the world store on IndexedDB. Worlds live in this browser, on this device.
import {
  type Decoded,
  type LoadedWorld,
  type WorldEdits,
  type WorldListEntry,
  type WorldMeta,
  decodeWorld,
  encodeChunks,
  encodeMeta,
  listEntries,
} from '../save/saveFormat';
import type { WorldStore } from '../save/WorldStore';
import { SAVE_DATABASE } from './config';

const WORLDS = 'worlds';
const CHUNKS = 'chunks';
const BY_WORLD = 'worldId';

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'));
  });
}

/** Resolves when the transaction's data is committed. */
function done(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB write failed'));
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB write aborted'));
  });
}

export class IdbStore implements WorldStore {
  private constructor(private readonly db: IDBDatabase) {}

  /** Opens (and on the first visit creates) the database. Rejects where it is unavailable. */
  static open(name: string = SAVE_DATABASE): Promise<IdbStore> {
    return new Promise((resolve, reject) => {
      let req: IDBOpenDBRequest;
      try {
        req = indexedDB.open(name, 1);
      } catch (error) {
        reject(error instanceof Error ? error : new Error(String(error)));
        return;
      }
      req.onupgradeneeded = () => {
        const db = req.result;
        db.createObjectStore(WORLDS, { keyPath: 'id' });
        db.createObjectStore(CHUNKS, { keyPath: 'key' }).createIndex(BY_WORLD, 'worldId');
      };
      req.onsuccess = () => resolve(new IdbStore(req.result));
      req.onerror = () => reject(req.error ?? new Error('IndexedDB is not available'));
      req.onblocked = () => reject(new Error('IndexedDB is blocked'));
    });
  }

  close(): void {
    this.db.close();
  }

  async list(): Promise<WorldListEntry[]> {
    const store = this.db.transaction(WORLDS, 'readonly').objectStore(WORLDS);
    const [records, keys] = await Promise.all([
      request(store.getAll()),
      request(store.getAllKeys()),
    ]);
    return listEntries(records as unknown[], keys.map(String));
  }

  async create(meta: WorldMeta): Promise<void> {
    const transaction = this.db.transaction(WORLDS, 'readwrite');
    transaction.objectStore(WORLDS).add(encodeMeta(meta));
    await done(transaction);
  }

  async load(id: string): Promise<Decoded<LoadedWorld> | null> {
    const transaction = this.db.transaction([WORLDS, CHUNKS], 'readonly');
    const [meta, chunks] = await Promise.all([
      request(transaction.objectStore(WORLDS).get(id) as IDBRequest<unknown>),
      request(transaction.objectStore(CHUNKS).index(BY_WORLD).getAll(id) as IDBRequest<unknown[]>),
    ]);
    if (meta === undefined) return null;
    return decodeWorld(meta, chunks);
  }

  async saveMeta(meta: WorldMeta): Promise<void> {
    const transaction = this.db.transaction(WORLDS, 'readwrite');
    transaction.objectStore(WORLDS).put(encodeMeta(meta));
    await done(transaction);
  }

  async saveChunks(worldId: string, edits: WorldEdits, keys: Iterable<string>): Promise<void> {
    // Encoded before the first await: the records are a snapshot of this moment.
    const records = encodeChunks(worldId, edits, keys);
    if (records.length === 0) return;
    const transaction = this.db.transaction(CHUNKS, 'readwrite');
    const store = transaction.objectStore(CHUNKS);
    for (const record of records) store.put(record);
    await done(transaction);
  }

  async delete(id: string): Promise<void> {
    const transaction = this.db.transaction([WORLDS, CHUNKS], 'readwrite');
    transaction.objectStore(WORLDS).delete(id);
    const chunks = transaction.objectStore(CHUNKS);
    const cursor = chunks.index(BY_WORLD).openKeyCursor(IDBKeyRange.only(id));
    cursor.onsuccess = () => {
      const position = cursor.result;
      if (!position) return;
      chunks.delete(position.primaryKey);
      position.continue();
    };
    await done(transaction);
  }
}
