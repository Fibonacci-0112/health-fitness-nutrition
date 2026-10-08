import { Stack } from "expo-router";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { SessionProvider, useSession } from "../auth/SessionProvider";
import { QueryProvider } from "../lib/QueryProvider";
import { Loading } from "../ui";

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <SessionProvider>
        <RootNavigator />
      </SessionProvider>
    </SafeAreaProvider>
  );
}

function RootNavigator() {
  const { session, isLoading } = useSession();
  if (isLoading) return <Loading />;

  return (
    // Keyed by user: switching accounts remounts the navigator with a fresh query cache.
    <QueryProvider key={session?.user.id ?? "signed-out"} userId={session?.user.id ?? null}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Protected guard={!!session}>
          <Stack.Screen name="(app)" />
        </Stack.Protected>
        <Stack.Protected guard={!session}>
          <Stack.Screen name="sign-in" />
        </Stack.Protected>
      </Stack>
    </QueryProvider>
  );
}
