import { Tabs } from "expo-router";
import { colors } from "../../../ui";

export default function TabsLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: colors.primary }}>
      <Tabs.Screen name="index" options={{ title: "Today" }} />
      <Tabs.Screen name="foods" options={{ title: "Foods" }} />
      <Tabs.Screen name="weight" options={{ title: "Weight" }} />
      <Tabs.Screen name="targets" options={{ title: "Targets" }} />
      <Tabs.Screen name="settings" options={{ title: "Settings" }} />
    </Tabs>
  );
}
