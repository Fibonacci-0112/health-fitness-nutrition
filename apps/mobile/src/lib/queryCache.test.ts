import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import type { PersistedClient } from "@tanstack/react-query-persist-client";
import { describe, expect, it } from "vitest";
import { cacheKey, userCacheStorage, wipeUserCache, type KeyValueStorage } from "./queryCache";

function memoryStorage(): KeyValueStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: async (key) => data.get(key) ?? null,
    setItem: async (key, value) => {
      data.set(key, value);
    },
    removeItem: async (key) => {
      data.delete(key);
    },
  };
}

const snapshot = (n: number): PersistedClient => ({
  timestamp: n,
  buster: "r1",
  clientState: { mutations: [], queries: [] },
});
const throttleTime = 30;
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** A first write lands at once; a second, inside the throttle window, is scheduled for later. */
async function scheduleLateWrite(storage: KeyValueStorage, userId: string) {
  const persister = createAsyncStoragePersister({ storage, key: cacheKey(userId), throttleTime });
  await persister.persistClient(snapshot(1));
  void persister.persistClient(snapshot(2));
}

describe("wipeUserCache", () => {
  it("a write scheduled before sign-out does not recreate the wiped cache", async () => {
    const base = memoryStorage();
    await scheduleLateWrite(userCacheStorage("user-a", base), "user-a");
    expect(base.data.has(cacheKey("user-a"))).toBe(true);

    await wipeUserCache("user-a", base);
    await wait(throttleTime * 4);
    expect(base.data.has(cacheKey("user-a"))).toBe(false);
  });

  it("without the guard, the late write brings the cache back (the race being fixed)", async () => {
    const base = memoryStorage();
    await scheduleLateWrite(base, "user-b");
    await base.removeItem(cacheKey("user-b"));
    await wait(throttleTime * 4);
    expect(base.data.has(cacheKey("user-b"))).toBe(true);
  });

  it("only closes the wiped user's storage, and a new session for that user writes again", async () => {
    const base = memoryStorage();
    const other = userCacheStorage("user-d", base);
    await wipeUserCache("user-c", base);
    await other.setItem(cacheKey("user-d"), "kept");
    expect(base.data.get(cacheKey("user-d"))).toBe("kept");

    const next = userCacheStorage("user-c", base);
    await next.setItem(cacheKey("user-c"), "fresh");
    expect(base.data.get(cacheKey("user-c"))).toBe("fresh");
  });
});
