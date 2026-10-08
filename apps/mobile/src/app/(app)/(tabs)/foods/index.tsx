import { router } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useMyFoods } from "../../../../api/foods";
import { basisLabel } from "../../../../lib/foods";
import { Banner, Button, Card, Field, Loading, Muted, Screen, Title, colors } from "../../../../ui";

export default function Foods() {
  const foods = useMyFoods();
  const [query, setQuery] = useState("");

  if (foods.isPending) return <Loading />;

  const q = query.trim().toLowerCase();
  const list = (foods.data ?? []).filter((f) => !q || `${f.name} ${f.brand ?? ""}`.toLowerCase().includes(q));

  return (
    <Screen>
      <Title>My foods</Title>
      <Muted>Foods you create are private to you, and so are the prices you record for any food.</Muted>
      <Button title="Search USDA foods" onPress={() => router.push("/foods/search")} />
      <Button title="New food" variant="secondary" onPress={() => router.push("/foods/edit")} />
      {foods.isError ? <Banner tone="error">Couldn't load your foods. Check your connection.</Banner> : null}
      {foods.data && foods.data.length > 0 ? (
        <Field label="Search my foods" value={query} onChangeText={setQuery} autoCapitalize="none" />
      ) : null}
      {list.length === 0 && foods.data ? (
        <Card>
          <Muted>{foods.data.length === 0 ? "No foods yet. Create one to start logging and pricing it." : "No matches."}</Muted>
        </Card>
      ) : null}
      {list.map((f) => (
        <Pressable
          key={f.id}
          accessibilityRole="link"
          accessibilityLabel={f.name}
          onPress={() => router.push({ pathname: "/foods/[id]", params: { id: f.id } })}
          style={({ pressed }) => [styles.row, pressed ? styles.pressed : null]}
        >
          <View style={styles.rowText}>
            <Text style={styles.name}>{f.name}</Text>
            <Text style={styles.meta}>
              {[f.brand, `${round(f.energy_kcal)} kcal ${basisLabel(f)}`].filter(Boolean).join(" · ")}
            </Text>
          </View>
        </Pressable>
      ))}
    </Screen>
  );
}

const round = (n: number | null) => (n == null ? "?" : Math.round(n));

const styles = StyleSheet.create({
  row: { backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 14 },
  pressed: { opacity: 0.7 },
  rowText: { gap: 2 },
  name: { fontSize: 16, fontWeight: "600", color: colors.text },
  meta: { fontSize: 13, color: colors.muted },
});
