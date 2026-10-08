import { MEAL_SLOTS, NUTRIENT_KEYS, formatMoney, isIsoDate, minorUnitDigits, priceSchema, selectPrice, toMinorUnits } from "@hfn/core";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useAddPrice, useDeleteFood, useDeletePrice, useFood, useFoodPrices } from "../../../../api/foods";
import { useProfile } from "../../../../api/profile";
import { LogFoodCard } from "../../../../diary/LogFoodCard";
import { mealForHour } from "../../../../lib/diary";
import {
  NUTRIENT_COLUMNS,
  NUTRIENT_LABELS,
  basisLabel,
  packageLabel,
  toPriceRecord,
  unitPriceLabel,
} from "../../../../lib/foods";
import { parseDecimal, saveErrorMessage, today } from "../../../../lib/format";
import { Banner, Button, Card, Choice, Field, Label, Loading, Muted, Screen, Title, colors } from "../../../../ui";

type PackageUnit = "g" | "ml" | "serving";

export default function FoodDetail() {
  const { id, logDate, meal } = useLocalSearchParams<{ id: string; logDate?: string; meal?: string }>();
  const profile = useProfile().data!;
  const food = useFood(id);
  const prices = useFoodPrices(id);
  const addPrice = useAddPrice();
  const deletePrice = useDeletePrice();
  const deleteFood = useDeleteFood();
  const todayDate = today(profile.time_zone);

  const [amount, setAmount] = useState("");
  const [unit, setUnit] = useState<PackageUnit>("g");
  const [servingId, setServingId] = useState<string | null>(null);
  const [priceText, setPriceText] = useState("");
  const [currency, setCurrency] = useState(profile.currency);
  const [effective, setEffective] = useState(todayDate);
  const [note, setNote] = useState("");
  const [message, setMessage] = useState<{ tone: "error" | "info"; text: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (food.isPending || prices.isPending) return <Loading />;
  if (!food.data) {
    return (
      <Screen>
        <Banner tone="error">This food doesn't exist or isn't visible to you.</Banner>
      </Screen>
    );
  }

  const f = food.data;
  const isMine = f.owner_id === profile.user_id;
  const records = (prices.data ?? []).map(toPriceRecord);
  const current = selectPrice(records, { foodId: f.id, logDate: todayDate, currency: profile.currency });

  const priceMajor = parseDecimal(priceText);
  const candidate = {
    foodId: f.id,
    packageQuantity: { amount: parseDecimal(amount) ?? 0, unit, servingId: unit === "serving" ? servingId : null },
    priceMinor: priceMajor === null || !/^[A-Z]{3}$/.test(currency) ? -1 : toMinorUnits(priceMajor, currency),
    currency,
    effectiveDate: effective,
  };
  const priceValid = priceSchema.safeParse(candidate).success;
  const decimals = /^[A-Z]{3}$/.test(currency) ? minorUnitDigits(currency) : 2;

  async function savePrice() {
    setMessage(null);
    try {
      await addPrice.mutateAsync({
        food_id: f.id,
        package_amount: candidate.packageQuantity.amount,
        package_unit: unit,
        package_serving_id: unit === "serving" ? servingId : null,
        price_minor: candidate.priceMinor,
        currency,
        effective_date: effective,
        store_note: note.trim() || null,
      });
      setAmount("");
      setPriceText("");
      setNote("");
      setMessage({ tone: "info", text: "Price saved." });
    } catch (e) {
      setMessage({ tone: "error", text: saveErrorMessage(e) });
    }
  }

  // Opened from Today's "Add to …": after logging, return to the diary and reset the Foods stack.
  function backToDiary() {
    router.dismissAll();
    router.navigate("/");
  }

  async function removeFood() {
    try {
      await deleteFood.mutateAsync(f.id);
      if (router.canGoBack()) router.back();
      else router.replace("/foods");
    } catch (e) {
      setMessage({ tone: "error", text: saveErrorMessage(e) });
    }
  }

  return (
    <Screen>
      <Title>{f.name}</Title>
      <Muted>
        {[f.brand, f.preparation !== "unspecified" ? f.preparation.replace("_", " ") : null, f.source === "custom" ? "Your food" : "USDA"]
          .filter(Boolean)
          .join(" · ")}
      </Muted>

      <Card>
        <Label>Nutrition {basisLabel(f)}</Label>
        {NUTRIENT_KEYS.map((k) => {
          const v = f[NUTRIENT_COLUMNS[k]];
          return (
            <View key={k} style={styles.row}>
              <Text style={styles.cell}>{NUTRIENT_LABELS[k]}</Text>
              <Text style={[styles.cell, v == null ? styles.unknown : null]}>{v == null ? "unknown" : String(v)}</Text>
            </View>
          );
        })}
        {f.food_servings.length > 0 ? (
          <Muted>Servings: {f.food_servings.map((s) => `${s.label} = ${s.grams ?? s.ml} ${s.grams != null ? "g" : "ml"}`).join(", ")}</Muted>
        ) : null}
        {f.density_g_per_ml != null ? <Muted>Density: {f.density_g_per_ml} g/ml</Muted> : null}
        {f.source === "usda" ? (
          <Muted>Source: U.S. Department of Agriculture, FoodData Central (FDC ID {f.source_id}). Values not reported by USDA show as unknown.</Muted>
        ) : null}
        {isMine ? (
          <Button title="Edit food" variant="secondary" onPress={() => router.push({ pathname: "/foods/edit", params: { id: f.id } })} />
        ) : null}
      </Card>

      <LogFoodCard
        key={f.id}
        food={f}
        prices={prices.data ?? []}
        profile={profile}
        initialDate={logDate && isIsoDate(logDate) ? logDate : todayDate}
        initialMeal={MEAL_SLOTS.find((m) => m === meal) ?? mealForHour(new Date().getHours())}
        onLogged={logDate ? backToDiary : undefined}
      />

      <Card>
        <Label>Price</Label>
        {current.ok ? (
          <>
            <Text style={styles.big}>{unitPriceLabel(f, current.price) ?? "Can't compare this package with the nutrition basis"}</Text>
            <Muted>Current price, in effect since {current.price.effectiveDate}. Used to estimate the cost of what you eat.</Muted>
          </>
        ) : (
          <Muted>
            {current.reason === "CURRENCY_MISMATCH"
              ? `No price in ${profile.currency}. Prices in other currencies aren't converted.`
              : current.reason === "NOT_YET_EFFECTIVE"
                ? "Your recorded prices start in the future."
                : "No price yet. Add what you paid to estimate the cost of what you eat."}
          </Muted>
        )}
        {(prices.data ?? []).map((p) => (
          <View key={p.id} style={styles.priceRow}>
            <Text style={styles.cell}>
              {formatMoney(p.price_minor, p.currency)} for {packageLabel(f, p)} · from {p.effective_date}
              {p.store_note ? ` · ${p.store_note}` : ""}
            </Text>
            <Button title="Delete" variant="secondary" onPress={() => deletePrice.mutate(p)} />
          </View>
        ))}
      </Card>

      <Card>
        <Label>Add a price</Label>
        <Muted>What you paid for a package. Prices are private to you.</Muted>
        <Choice<PackageUnit>
          label="Package measured in"
          value={unit}
          onChange={(u) => {
            setUnit(u);
            if (u === "serving" && !servingId) setServingId(f.food_servings[0]?.id ?? null);
          }}
          options={[
            { value: "g", label: "grams" },
            { value: "ml", label: "ml" },
            ...(f.food_servings.length > 0 ? [{ value: "serving" as const, label: "servings" }] : []),
          ]}
        />
        {unit === "serving" ? (
          <Choice<string>
            label="Serving"
            value={servingId}
            onChange={setServingId}
            options={f.food_servings.map((s) => ({ value: s.id, label: s.label }))}
          />
        ) : null}
        <Field
          label={unit === "serving" ? "Number of servings in the package" : `Package size (${unit})`}
          value={amount}
          onChangeText={setAmount}
          keyboardType="decimal-pad"
          inputMode="decimal"
        />
        <Field
          label={`Price paid (${currency})`}
          value={priceText}
          onChangeText={setPriceText}
          keyboardType="decimal-pad"
          inputMode="decimal"
          hint={decimals === 0 ? "Whole units." : `Up to ${decimals} decimals.`}
        />
        <Field label="Currency" value={currency} onChangeText={(t) => setCurrency(t.toUpperCase())} autoCapitalize="characters" maxLength={3} />
        <Field
          label="Effective from"
          placeholder="YYYY-MM-DD"
          value={effective}
          onChangeText={setEffective}
          error={isIsoDate(effective) ? null : "Enter a date as YYYY-MM-DD."}
        />
        <Field label="Store (optional)" value={note} onChangeText={setNote} />
        {message ? <Banner tone={message.tone}>{message.text}</Banner> : null}
        <Button title="Save price" onPress={savePrice} disabled={!priceValid} loading={addPrice.isPending} />
      </Card>

      {isMine ? (
        <Card>
          {confirmDelete ? (
            <>
              <Banner tone="warning">Delete this food and its prices? Past diary entries keep their saved nutrition and cost.</Banner>
              <Button title="Yes, delete food" onPress={removeFood} loading={deleteFood.isPending} />
              <Button title="Cancel" variant="secondary" onPress={() => setConfirmDelete(false)} />
            </>
          ) : (
            <Button title="Delete food" variant="secondary" onPress={() => setConfirmDelete(true)} />
          )}
        </Card>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", justifyContent: "space-between" },
  cell: { fontSize: 14, color: colors.text, flexShrink: 1 },
  unknown: { color: colors.muted, fontStyle: "italic" },
  big: { fontSize: 20, fontWeight: "700", color: colors.text },
  priceRow: { gap: 6, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 8 },
});
