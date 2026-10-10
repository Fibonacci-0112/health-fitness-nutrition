import AsyncStorage from "@react-native-async-storage/async-storage";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import { QueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { cacheKey, userCacheStorage, wipeUserCache } from "./queryCache";

/**
 * Query cache scoped to one signed-in user. A new user gets a fresh client and
 * a separate persisted cache; when a user signs out, their persisted cache is
 * deleted so the next person on the device never sees it.
 */
export function QueryProvider({ userId, children }: { userId: string | null; children: ReactNode }) {
  const client = useMemo(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 30_000, gcTime: 24 * 60 * 60 * 1000, retry: 1 },
          // R1 requires connectivity for writes: fail fast and let the screen keep its form state.
          mutations: { retry: 0 },
        },
      }),
    // A new client per user, so nothing in memory crosses accounts.
    [userId],
  );

  const persister = useMemo(
    () =>
      userId ? createAsyncStoragePersister({ storage: userCacheStorage(userId, AsyncStorage), key: cacheKey(userId) }) : null,
    [userId],
  );

  const previousUser = useRef<string | null>(userId);
  useEffect(() => {
    const prev = previousUser.current;
    if (prev && prev !== userId) {
      wipeUserCache(prev, AsyncStorage).catch(() => undefined);
    }
    previousUser.current = userId;
  }, [userId]);

  if (!persister) {
    return <PersistQueryClientProvider client={client} persistOptions={{ persister: noopPersister }}>{children}</PersistQueryClientProvider>;
  }
  return (
    <PersistQueryClientProvider
      client={client}
      persistOptions={{
        persister,
        maxAge: 24 * 60 * 60 * 1000,
        buster: "r1",
        // Queries can opt out of the offline cache with meta: { persist: false }.
        dehydrateOptions: { shouldDehydrateQuery: (q) => q.state.status === "success" && q.meta?.persist !== false },
      }}
    >
      {children}
    </PersistQueryClientProvider>
  );
}

const noopPersister = {
  persistClient: async () => undefined,
  restoreClient: async () => undefined,
  removeClient: async () => undefined,
};
