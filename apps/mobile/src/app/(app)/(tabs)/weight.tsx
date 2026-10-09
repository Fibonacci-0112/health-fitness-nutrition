import { isIsoDate } from "@hfn/core";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useProfile } from "../../../api/profile";
import { useDeleteWeight, useSaveWeight, useWeights, WEIGHT_HISTORY_LIMIT, type BodyWeight } from "../../../api/weights";
import { displayWeight, parseDecimal, round, saveErrorMessage, toKg, today, weightUnit, type UnitSystem } from "../../../lib/format";
import { Banner, Button, Card, Field, Label, Loading, Muted, Screen, Title, colors } from "../../../ui";

export default function Weight() {
  const profile = useProfile().data!;
  const units = profile.unit_system as UnitSystem;
  const wUnit = weightUnit(units);
  const todayDate = today(profile.time_zone);
  const weights = useWeights();
  const saveWeight = useSaveWeight();
  const deleteWeight = useDeleteWeight();

  const [date, setDate] = useState(todayDate);
  const [value, setValue] = useState("");
  const [message, setMessage] = useState<{ tone: "error" | "info"; text: string } | null>(null);

  if (weights.isPending) return <Loading />;

  const dateError = !isIsoDate(date) ? "Enter a date as YYYY-MM-DD." : date > todayDate ? "The date can't be in the future." : null;
  const parsed = parseDecimal(value);
  const weightKg = parsed === null ? null : toKg(parsed, units);
  const valid = !dateError && weightKg !== null && weightKg >= 20 && weightKg <= 500;
  const list = weights.data ?? [];

  async function save() {
    if (!valid) return;
    setMessage(null);
    try {
      await saveWeight.mutateAsync({ measuredOn: date, weightKg: weightKg! });
      setValue("");
      setMessage({ tone: "info", text: `Saved ${round(parsed!, 1)} ${wUnit} for ${date}.` });
    } catch (e) {
      setMessage({ tone: "error", text: saveErrorMessage(e) });
    }
  }

  async function remove(w: BodyWeight) {
    setMessage(null);
    try {
      await deleteWeight.mutateAsync(w.id);
    } catch (e) {
      setMessage({ tone: "error", text: saveErrorMessage(e) });
    }
  }

  return (
    <Screen>
      <Title>Weight</Title>
      <Card>
        <Label>Log a weigh-in</Label>
        <Field label="Date of weigh-in" placeholder="YYYY-MM-DD" value={date} onChangeText={setDate} error={dateError} />
        <Field
          label={`Weight (${wUnit})`}
          value={value}
          onChangeText={setValue}
          keyboardType="decimal-pad"
          inputMode="decimal"
          hint="One weigh-in per day: saving again for the same date replaces it."
        />
        {message ? <Banner tone={message.tone}>{message.text}</Banner> : null}
        <Button title="Save weigh-in" onPress={save} disabled={!valid} loading={saveWeight.isPending} />
      </Card>

      <Card>
        <Label>History</Label>
        {weights.isError ? <Banner tone="error">Couldn't load your weigh-ins. Check your connection.</Banner> : null}
        {list.length === 0 && !weights.isError ? <Muted>No weigh-ins yet.</Muted> : null}
        {list.map((w, i) => {
          const previous = list[i + 1];
          const change = previous ? displayWeight(w.weight_kg, units) - displayWeight(previous.weight_kg, units) : null;
          const label = `${displayWeight(w.weight_kg, units)} ${wUnit} on ${w.measured_on}`;
          return (
            <View key={w.id} style={styles.row} accessibilityLabel={label}>
              <View style={styles.rowText}>
                <Text style={styles.value}>{label}</Text>
                {change !== null ? (
                  <Muted>
                    {change === 0 ? "No change" : `${change > 0 ? "+" : "−"}${round(Math.abs(change), 1)} ${wUnit}`} since {previous!.measured_on}
                  </Muted>
                ) : null}
              </View>
              <Button title={`Delete weigh-in on ${w.measured_on}`} variant="secondary" onPress={() => remove(w)} />
            </View>
          );
        })}
        {list.length === WEIGHT_HISTORY_LIMIT ? <Muted>Showing your latest {WEIGHT_HISTORY_LIMIT} weigh-ins.</Muted> : null}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { gap: 6, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 8 },
  rowText: { gap: 2 },
  value: { fontSize: 15, fontWeight: "600", color: colors.text },
});
