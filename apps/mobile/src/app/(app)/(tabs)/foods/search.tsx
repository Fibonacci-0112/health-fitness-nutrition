import { router } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useImportUsdaFood, useUsdaSearch, type UsdaSearchItem } from "../../../../api/usda";
import { saveErrorMessage } from "../../../../lib/format";
import { Banner, Button, Field, Loading, Muted, Screen, Title, colors } from "../../../../ui";

export default function UsdaSearch() {
  const [text, setText] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const search = useUsdaSearch(query, page);
  const importFood = useImportUsdaFood();
  const [importError, setImportError] = useState<string | null>(null);
  const [importing, setImporting] = useState<number | null>(null);

  const submit = () => {
    setQuery(text);
    setPage(1);
  };

  async function open(item: UsdaSearchItem) {
    setImportError(null);
    setImporting(item.fdcId);
    try {
      const id = await importFood.mutateAsync(item.fdcId);
      router.push({ pathname: "/foods/[id]", params: { id } });
    } catch (e) {
      setImportError(saveErrorMessage(e));
    } finally {
      setImporting(null);
    }
  }

  const per = (i: UsdaSearchItem) => (i.nutrient_basis === "per_100ml" ? "100 ml" : "100 g");
  const fmt = (n: number | null) => (n == null ? "?" : String(Math.round(n * 10) / 10));

  return (
    <Screen>
      <Title>Search foods</Title>
      <Muted>Search the USDA FoodData Central database of generic and branded foods.</Muted>
      <Field
        label="Search USDA foods"
        placeholder="e.g. rolled oats"
        value={text}
        onChangeText={setText}
        onSubmitEditing={submit}
        returnKeyType="search"
        autoCapitalize="none"
      />
      <Button title="Search" onPress={submit} disabled={text.trim().length < 2} />

      {search.isFetching && !search.data ? <Loading /> : null}
      {search.isError ? <Banner tone="error">{saveErrorMessage(search.error).replace(/^Not saved: /, "")}</Banner> : null}
      {importError ? <Banner tone="error">{importError}</Banner> : null}

      {search.data ? (
        <>
          <Muted>
            {search.data.totalHits === 0 ? "No matches." : `${search.data.totalHits.toLocaleString()} matches · page ${search.data.page}`}
          </Muted>
          {search.data.items.map((item) => (
            <Pressable
              key={item.fdcId}
              accessibilityRole="button"
              accessibilityLabel={`${item.name}${item.brand ? `, ${item.brand}` : ""}`}
              onPress={() => open(item)}
              disabled={importing !== null}
              style={({ pressed }) => [styles.row, pressed ? styles.pressed : null]}
            >
              <View style={styles.rowText}>
                <Text style={styles.name}>{item.name}</Text>
                <Text style={styles.meta}>
                  {[item.brand, item.dataType === "Branded" ? null : item.dataType].filter(Boolean).join(" · ") || "Generic"}
                </Text>
                <Text style={styles.meta}>
                  {fmt(item.energy_kcal)} kcal · P {fmt(item.protein_g)} · C {fmt(item.carbs_g)} · F {fmt(item.fat_g)} per {per(item)}
                  {item.serving ? ` · serving ${item.serving}` : ""}
                </Text>
                {importing === item.fdcId ? <Text style={styles.meta}>Opening…</Text> : null}
              </View>
            </Pressable>
          ))}
          {search.data.page < Math.min(search.data.totalPages, 20) ? (
            <Button title="Next page" variant="secondary" onPress={() => setPage((p) => p + 1)} loading={search.isFetching} />
          ) : null}
          {search.data.page > 1 ? (
            <Button title="Previous page" variant="secondary" onPress={() => setPage((p) => p - 1)} />
          ) : null}
        </>
      ) : null}

      <Muted>Data: U.S. Department of Agriculture, FoodData Central (public domain).</Muted>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 14 },
  pressed: { opacity: 0.7 },
  rowText: { gap: 2 },
  name: { fontSize: 16, fontWeight: "600", color: colors.text },
  meta: { fontSize: 13, color: colors.muted },
});
