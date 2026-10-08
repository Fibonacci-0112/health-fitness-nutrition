import { Stack } from "expo-router";

export default function FoodsLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="search" options={{ title: "Search foods" }} />
      <Stack.Screen name="edit" options={{ title: "Food" }} />
      <Stack.Screen name="[id]" options={{ title: "Food" }} />
    </Stack>
  );
}
