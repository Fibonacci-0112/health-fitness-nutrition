import { MEAL_SLOTS, summarizeDay, type MealSlot } from "@hfn/core";
import { Link, router } from "expo-router";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useDeleteLog, useDiaryDay } from "../../../api/diary";
import { useProfile } from "../../../api/profile";
import { useTargetOn } from "../../../api/targets";
import { useLatestWeight, useSaveWeight } from "../../../api/weights";
import { addDays, amountLabel, costTotalLabel, entryCostLabel, MEAL_LABELS, toDiaryEntry, totalLabel, type LogRow } from "../../../lib/diary";
import { displayWeight, parseDecimal, saveErrorMessage, toKg, today, weightUnit, type UnitSystem } from "../../../lib/format";
import { Banner, Button, Card, Field, Label, Loading, Muted, Screen, Title, colors } from "../../../ui";

export default function Today() {
  const profile = useProfile().data!;
  const units = profile.unit_system as UnitSystem;
  const todayDate = today(profile.time_zone);
  const [date, setDate] = useState(todayDate);
  const target = useTargetOn(date);
  const diary = useDiaryDay(date);
  const deleteLog = useDeleteLog();
  const latestWeight = useLatestWeight();
  const saveWeight = useSaveWeight();

  const [weight, setWeight] = useState("");
  const [weightError, setWeightError] = useState<string | null>(null);
  const [diaryError, setDiaryError] = useState<string | null>(null);

  if (target.isPending || latestWeight.isPending || diary.isPending) return <Loading />;

  const entries = diary.data ?? [];
  const day = summarizeDay(entries.map(toDiaryEntry), profile.currency);
  const t = target.data;

  const wUnit = weightUnit(units);
  const weightKg = (() => {
    const v = parseDecimal(weight);
    return v === null ? null : toKg(v, units);
  })();
  const weightValid = weightKg !== null && weightKg >= 20 && weightKg <= 500;

  async function logWeight() {
    setWeightError(null);
    if (!weightValid) return;
    try {
      await saveWeight.mutateAsync({ measuredOn: todayDate, weightKg: weightKg! });
      setWeight("");
    } catch (e) {
      setWeightError(saveErrorMessage(e));
    }
  }

  async function remove(row: LogRow) {
    setDiaryError(null);
    try {
      await deleteLog.mutateAsync(row);
    } catch (e) {
      setDiaryError(saveErrorMessage(e));
    }
  }

  // navigate (not push): return to the Foods list rather than stacking another copy of it.
  const addFood = (meal: MealSlot) => router.navigate({ pathname: "/foods", params: { logDate: date, meal } });

  return (
    <Screen>
      <Title>{date === todayDate ? "Today" : "Diary"}</Title>
      <View style={styles.dayNav}>
        <Button title="Previous day" variant="secondary" onPress={() => setDate(addDays(date, -1))} />
        <Text style={styles.date} accessibilityLabel={`Showing ${date}`}>
          {date}
        </Text>
        <Button title="Next day" variant="secondary" onPress={() => setDate(addDays(date, 1))} />
      </View>
      {date !== todayDate ? <Button title="Back to today" variant="secondary" onPress={() => setDate(todayDate)} /> : null}

      {diary.isError && !diary.data ? (
        <>
          <Banner tone="error">Couldn't load this day's diary. Check your connection.</Banner>
          <Button title="Try again" onPress={() => diary.refetch()} />
        </>
      ) : (
        <>
          <Card>
            <Label>Totals</Label>
            <Text style={styles.big}>{totalLabel(day.nutrients.energyKcal, "kcal")}</Text>
            {t ? (
              <Muted>of {t.kcal} kcal target</Muted>
            ) : (
              <>
                <Muted>No targets yet.</Muted>
                <Link href="/targets" style={styles.link}>
                  Set your targets
                </Link>
              </>
            )}
            <Muted>
              Protein {totalLabel(day.nutrients.proteinG, "g")}
              {t ? ` of ${t.protein_g} g` : ""}
            </Muted>
            <Muted>
              Carbs {totalLabel(day.nutrients.carbsG, "g")}
              {t ? ` of ${t.carbs_g} g` : ""}
            </Muted>
            <Muted>
              Fat {totalLabel(day.nutrients.fatG, "g")}
              {t ? ` of ${t.fat_g} g` : ""}
            </Muted>
            <Label>Estimated food cost</Label>
            <Text style={styles.big}>{costTotalLabel(day.cost)}</Text>
            <Muted>Estimated from your recorded prices. Not your grocery spend.</Muted>
          </Card>

          {diaryError ? <Banner tone="error">{diaryError}</Banner> : null}

          {MEAL_SLOTS.map((meal) => {
            const rows = entries.filter((e) => e.meal_slot === meal);
            return (
              <Card key={meal}>
                <Label>{MEAL_LABELS[meal]}</Label>
                {rows.length === 0 ? <Muted>Nothing logged.</Muted> : null}
                {rows.map((row) => (
                  <View key={row.id} style={styles.entry} accessibilityLabel={`${row.food_name}, ${amountLabel(row)}`}>
                    <Text style={styles.name}>{row.food_name}</Text>
                    <Muted>
                      {amountLabel(row)} · {row.energy_kcal == null ? "kcal unknown" : `${Math.round(row.energy_kcal)} kcal`} ·{" "}
                      {entryCostLabel(row, profile.currency)}
                    </Muted>
                    <Button title={`Delete ${row.food_name}`} variant="secondary" onPress={() => remove(row)} />
                  </View>
                ))}
                <Button title={`Add to ${MEAL_LABELS[meal]}`} variant="secondary" onPress={() => addFood(meal)} />
              </Card>
            );
          })}
        </>
      )}

      <Card>
        <Label>Weight</Label>
        {latestWeight.data ? (
          <Muted>
            Latest: {displayWeight(latestWeight.data.weight_kg, units)} {wUnit} on {latestWeight.data.measured_on}
          </Muted>
        ) : (
          <Muted>No weigh-ins yet.</Muted>
        )}
        <Field
          label={`Today's weight (${wUnit})`}
          value={weight}
          onChangeText={setWeight}
          keyboardType="decimal-pad"
          inputMode="decimal"
          hint="Logging again today replaces today's entry."
        />
        {weightError ? <Banner tone="error">{weightError}</Banner> : null}
        <Button title="Log weight" onPress={logWeight} disabled={!weightValid} loading={saveWeight.isPending} />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  dayNav: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  date: { fontSize: 16, fontWeight: "600", color: colors.text },
  big: { fontSize: 20, fontWeight: "700", color: colors.text },
  link: { color: colors.primary, fontWeight: "600" },
  entry: { gap: 6, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 8 },
  name: { fontSize: 15, fontWeight: "600", color: colors.text },
});
