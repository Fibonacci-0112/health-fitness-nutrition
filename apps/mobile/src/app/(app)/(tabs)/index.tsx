import { Link } from "expo-router";
import { useState } from "react";
import { useProfile } from "../../../api/profile";
import { useTargetOn } from "../../../api/targets";
import { useLatestWeight, useSaveWeight } from "../../../api/weights";
import { displayWeight, parseDecimal, saveErrorMessage, toKg, today, weightUnit, type UnitSystem } from "../../../lib/format";
import { Banner, Button, Card, Field, Label, Loading, Muted, Screen, Title } from "../../../ui";

export default function Today() {
  const profile = useProfile().data!;
  const units = profile.unit_system as UnitSystem;
  const todayDate = today(profile.time_zone);
  const target = useTargetOn(todayDate);
  const latestWeight = useLatestWeight();
  const saveWeight = useSaveWeight();

  const [weight, setWeight] = useState("");
  const [weightError, setWeightError] = useState<string | null>(null);

  if (target.isPending || latestWeight.isPending) return <Loading />;

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

  return (
    <Screen>
      <Title>Today</Title>
      <Muted>{todayDate}</Muted>

      <Card>
        <Label>Daily targets</Label>
        {target.data ? (
          <>
            <Muted>{target.data.kcal} kcal</Muted>
            <Muted>
              Protein {target.data.protein_g} g · Carbs {target.data.carbs_g} g · Fat {target.data.fat_g} g
            </Muted>
          </>
        ) : (
          <>
            <Muted>No targets yet.</Muted>
            <Link href="/targets" style={{ color: "#1F6FEB", fontWeight: "600" }}>
              Set your targets
            </Link>
          </>
        )}
        <Muted>Food logging and estimated food cost arrive in the next update.</Muted>
      </Card>

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
