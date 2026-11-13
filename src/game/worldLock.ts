// World lock: a world can be open in one tab only, or two tabs would overwrite each other.

/** Releases a lock taken by `acquireWorldLock`. */
export type ReleaseLock = () => void;

/**
 * Takes the lock named after the world (Web Locks API). Resolves with a release function,
 * or with null if another tab holds the lock. Browsers without the API skip the check.
 * A lock is also released when its tab closes.
 */
export function acquireWorldLock(worldId: string): Promise<ReleaseLock | null> {
  const locks = (navigator as Navigator & { locks?: LockManager }).locks;
  if (!locks) return Promise.resolve(() => {});
  return new Promise((resolve) => {
    locks
      .request(`markuscraft-world-${worldId}`, { ifAvailable: true }, (lock) => {
        if (!lock) {
          resolve(null);
          return undefined;
        }
        // The lock is held until this promise settles.
        return new Promise<void>((release) => resolve(release));
      })
      .catch(() => resolve(() => {}));
  });
}
