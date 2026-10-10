// Per-user storage for the persisted TanStack Query cache.
//
// The async-storage persister throttles writes (one per second by default) and a write that is
// already scheduled still runs after its wait, even once the provider has unmounted. Without a
// guard, signing out could delete the cache and then have that late write put it back, leaking
// the previous user's data to the next person on the device.

export interface KeyValueStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

const CACHE_PREFIX = "hfn-query-cache:";
export const cacheKey = (userId: string) => `${CACHE_PREFIX}${userId}`;

// Close handles for every storage currently writing a user's cache.
const openStorages = new Map<string, Set<() => void>>();

/** Storage for one user's cache that drops every write once that user's cache is wiped. */
export function userCacheStorage(userId: string, base: KeyValueStorage): KeyValueStorage {
  let open = true;
  const close = () => {
    open = false;
  };
  const handles = openStorages.get(userId) ?? new Set();
  handles.add(close);
  openStorages.set(userId, handles);

  return {
    getItem: (key) => base.getItem(key),
    setItem: (key, value) => (open ? base.setItem(key, value) : Promise.resolve()),
    removeItem: (key) => base.removeItem(key),
  };
}

/** Deletes a user's persisted cache and stops any pending write from recreating it. */
export async function wipeUserCache(userId: string, base: KeyValueStorage): Promise<void> {
  for (const close of openStorages.get(userId) ?? []) close();
  openStorages.delete(userId);
  await base.removeItem(cacheKey(userId));
}
