import type { Session } from "@supabase/supabase-js";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { wipeUserCache } from "../lib/queryCache";
import { supabase } from "../lib/supabase";

interface SessionContextValue {
  session: Session | null;
  isLoading: boolean;
  signIn(email: string, password: string): Promise<string | null>;
  /** Returns an error message, or null. `needsConfirmation` is true when the project requires email confirmation. */
  signUp(email: string, password: string): Promise<{ error: string | null; needsConfirmation: boolean }>;
  signOut(): Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setIsLoading(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, []);

  const value = useMemo<SessionContextValue>(
    () => ({
      session,
      isLoading,
      async signIn(email, password) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        return error?.message ?? null;
      },
      async signUp(email, password) {
        const { data, error } = await supabase.auth.signUp({ email, password });
        return { error: error?.message ?? null, needsConfirmation: !error && !data.session };
      },
      async signOut() {
        const userId = session?.user.id;
        await supabase.auth.signOut();
        // Drop this user's persisted query cache so the next person on the device never sees it.
        // wipeUserCache also stops a throttled write that is still pending from restoring it.
        if (userId) await wipeUserCache(userId, AsyncStorage).catch(() => undefined);
      },
    }),
    [session, isLoading],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used inside <SessionProvider>");
  return ctx;
}
