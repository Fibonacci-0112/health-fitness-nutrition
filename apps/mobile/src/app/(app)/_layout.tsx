import { Stack } from "expo-router";
import { isProfileComplete, useProfile } from "../../api/profile";
import { Banner, Button, Loading, Screen } from "../../ui";

export default function AppLayout() {
  const profile = useProfile();

  if (profile.isPending) return <Loading />;
  if (profile.isError) {
    return (
      <Screen>
        <Banner tone="error">Couldn't load your profile. Check your connection and try again.</Banner>
        <Button title="Try again" onPress={() => profile.refetch()} />
      </Screen>
    );
  }

  const complete = isProfileComplete(profile.data);
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={!complete}>
        <Stack.Screen name="onboarding" />
      </Stack.Protected>
      <Stack.Protected guard={complete}>
        <Stack.Screen name="(tabs)" />
      </Stack.Protected>
    </Stack>
  );
}
