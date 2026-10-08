import { isIsoDate, proposeTargets, type GoalMode } from "@hfn/core";
import { useEffect, useMemo, useState } from "react";
import { targetProfile, useProfile } from "../../../api/profile";
import { useSaveTarget, useTargetOn } from "../../../api/targets";
import { useLatestWeight } from "../../../api/weights";
import { displayWeight, parseDecimal, round, saveErrorMessage, toKg, today, weightUnit, type UnitSystem } from "../../../lib/format";
import { Banner, Button, Card, Choice, Field, Label, Loading, Muted, Screen, Title } from "../../../ui";

type ModeKind = GoalMode["kind"];

export default function Targets() {
  const profile = useProfile().data!;
  const units = profile.unit_system as UnitSystem;
  const todayDate = today(profile.time_zone);
  const latestWeight = useLatestWeight();
  const current = useTargetOn(todayDate);
  const saveTarget = useSaveTarget();

  const [goalWeight, setGoalWeight] = useState("");
  const [modeKind, setModeKind] = useState<ModeKind>("rate");
  const [rate, setRate] = useState(units === "imperial" ? "1" : "0.5");
  const [goalDate, setGoalDate] = useState("");
  const [manual, setManual] = useState({ kcal: "", protein: "", carbs: "", fat: "" });
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  // Prefill the goal from the saved target once it loads.
  useEffect(() => {
    const t = current.data;
    if (t?.goal_weight_kg != null && goalWeight === "") setGoalWeight(String(displayWeight(t.goal_weight_kg, units)));
    if (t && manual.kcal === "") {
      setManual({ kcal: String(t.kcal), protein: String(t.protein_g), carbs: String(t.carbs_g), fat: String(t.fat_g) });
    }
  }, [current.data]);

  const goalKg = (() => {
    const v = parseDecimal(goalWeight);
    return v === null ? null : toKg(v, units);
  })();
  const mode: GoalMode | null = (() => {
    if (modeKind === "rate") {
      const v = parseDecimal(rate);
      return v === null ? null : { kind: "rate", kgPerWeek: toKg(v, units) };
    }
    return isIsoDate(goalDate) ? { kind: "date", targetDate: goalDate } : null;
  })();

  const modeKey = mode ? JSON.stringify(mode) : "";
  const proposal = useMemo(() => {
    if (goalKg === null || mode === null || latestWeight.data === undefined) return null;
    return proposeTargets({
      profile: targetProfile(profile),
      currentWeightKg: latestWeight.data?.weight_kg ?? null,
      goalWeightKg: goalKg,
      mode,
      today: todayDate,
    });
    // `mode` is rebuilt every render; modeKey captures its value.
  }, [goalKg, modeKey, latestWeight.data, profile, todayDate]);

  if (latestWeight.isPending || current.isPending) return <Loading />;

  const wUnit = weightUnit(units);
  const fmtRate = (kgPerWeek: number) => `${round(Math.abs(displayWeight(kgPerWeek, units)), 2)} ${wUnit}/week`;

  async function save(source: "estimated" | "manual") {
    setSaveError(null);
    setSaved(null);
    try {
      const base = {
        effective_from: todayDate,
        goal_weight_kg: goalKg === null ? null : round(goalKg, 1),
        kg_per_week: proposal?.ok ? round(proposal.plan.kgPerWeek, 2) : null,
      };
      if (source === "estimated") {
        if (!proposal?.ok) return;
        const e = proposal.estimate;
        await saveTarget.mutateAsync({ ...base, source, kcal: e.kcal, protein_g: e.proteinG, carbs_g: e.carbsG, fat_g: e.fatG });
        setManual({ kcal: String(e.kcal), protein: String(e.proteinG), carbs: String(e.carbsG), fat: String(e.fatG) });
      } else {
        const m = manualValues;
        if (!m) return;
        await saveTarget.mutateAsync({ ...base, source, kcal: m.kcal, protein_g: m.protein, carbs_g: m.carbs, fat_g: m.fat });
      }
      setSaved(`Saved. These targets apply from ${todayDate}.`);
    } catch (e) {
      setSaveError(saveErrorMessage(e));
    }
  }

  const manualValues = (() => {
    const kcal = parseDecimal(manual.kcal);
    const protein = parseDecimal(manual.protein);
    const carbs = parseDecimal(manual.carbs);
    const fat = parseDecimal(manual.fat);
    if (kcal === null || protein === null || carbs === null || fat === null) return null;
    if (kcal < 500 || kcal > 10000 || protein < 0 || carbs < 0 || fat < 0) return null;
    return { kcal: Math.round(kcal), protein: round(protein, 1), carbs: round(carbs, 1), fat: round(fat, 1) };
  })();
  const macroKcal = manualValues ? Math.round(manualValues.protein * 4 + manualValues.carbs * 4 + manualValues.fat * 9) : null;

  return (
    <Screen>
      <Title>Targets</Title>

      {current.data ? (
        <Card>
          <Label>Current targets</Label>
          <Muted>
            {current.data.kcal} kcal · P {current.data.protein_g} g · C {current.data.carbs_g} g · F {current.data.fat_g} g
          </Muted>
          <Muted>
            {current.data.source === "manual" ? "Set manually" : "Estimated"} · since {current.data.effective_from}
          </Muted>
        </Card>
      ) : (
        <Banner tone="info">You don't have targets yet. Set a goal below to get a starting estimate.</Banner>
      )}

      <Card>
        <Label>Goal</Label>
        {latestWeight.data ? (
          <Muted>
            Current weight: {displayWeight(latestWeight.data.weight_kg, units)} {wUnit} (on {latestWeight.data.measured_on})
          </Muted>
        ) : (
          <Banner tone="warning">Log your current weight on the Today tab first.</Banner>
        )}
        <Field label={`Goal weight (${wUnit})`} value={goalWeight} onChangeText={setGoalWeight} keyboardType="decimal-pad" inputMode="decimal" />
        <Choice<ModeKind>
          label="Plan by"
          value={modeKind}
          onChange={setModeKind}
          options={[
            { value: "rate", label: "Weekly rate" },
            { value: "date", label: "Goal date" },
          ]}
        />
        {modeKind === "rate" ? (
          <Field label={`Change per week (${wUnit})`} value={rate} onChangeText={setRate} keyboardType="decimal-pad" inputMode="decimal" />
        ) : (
          <Field label="Goal date" placeholder="YYYY-MM-DD" value={goalDate} onChangeText={setGoalDate} />
        )}
      </Card>

      {proposal && !proposal.ok ? <Banner tone="error">{proposalErrorMessage(proposal.error)}</Banner> : null}

      {proposal?.ok ? (
        <Card>
          <Label>Estimated starting targets</Label>
          <Muted>
            {proposal.plan.direction === "maintain"
              ? "Maintain your current weight."
              : `${proposal.plan.direction === "lose" ? "Lose" : "Gain"} ${fmtRate(proposal.plan.kgPerWeek)}, reaching your goal around ${proposal.plan.targetDate}.`}
          </Muted>
          <Muted>
            Maintenance ≈ {proposal.estimate.tdee} kcal (BMR {proposal.estimate.bmr} kcal). This is an estimate; adjust it once you have a
            few weeks of data.
          </Muted>
          <Label>
            {proposal.estimate.kcal} kcal · P {proposal.estimate.proteinG} g · C {proposal.estimate.carbsG} g · F {proposal.estimate.fatG} g
          </Label>

          {proposal.plan.warnings.includes("RATE_ABOVE_SAFE_MAX") ? (
            <>
              <Banner tone="warning">
                {`That's faster than the recommended maximum of ${fmtRate(proposal.plan.maxSafeKgPerWeek)}. Choose a safer option, or set targets manually below.`}
              </Banner>
              <Button
                variant="secondary"
                title={`Use ${fmtRate(proposal.plan.maxSafeKgPerWeek)}`}
                onPress={() => {
                  setModeKind("rate");
                  setRate(String(round(Math.abs(displayWeight(proposal.plan.maxSafeKgPerWeek, units)), 2)));
                }}
              />
              {proposal.plan.dateAtSafeRate ? (
                <Button
                  variant="secondary"
                  title={`Use a later date (${proposal.plan.dateAtSafeRate})`}
                  onPress={() => {
                    setModeKind("date");
                    setGoalDate(proposal.plan.dateAtSafeRate!);
                  }}
                />
              ) : null}
            </>
          ) : null}
          {proposal.estimate.warnings.includes("CALORIE_FLOOR_APPLIED") ? (
            <Banner tone="warning">
              {`The estimate was raised to your calorie floor of ${profile.calorie_floor_kcal} kcal, so progress will be slower than planned.`}
            </Banner>
          ) : null}
          {proposal.estimate.warnings.includes("MACROS_EXCEED_CALORIES") ? (
            <Banner tone="warning">Protein and fat already use all the calories; carbs are set to 0. Consider a manual target.</Banner>
          ) : null}

          <Button
            title="Use these targets"
            onPress={() => save("estimated")}
            disabled={proposal.plan.warnings.includes("RATE_ABOVE_SAFE_MAX")}
            loading={saveTarget.isPending}
          />
        </Card>
      ) : null}

      <Card>
        <Label>Set targets manually</Label>
        <Muted>A manual target always takes priority over the estimate.</Muted>
        <Field label="Calories (kcal)" value={manual.kcal} onChangeText={(kcal) => setManual((m) => ({ ...m, kcal }))} keyboardType="number-pad" inputMode="numeric" />
        <Field label="Protein (g)" value={manual.protein} onChangeText={(protein) => setManual((m) => ({ ...m, protein }))} keyboardType="decimal-pad" inputMode="decimal" />
        <Field label="Carbs (g)" value={manual.carbs} onChangeText={(carbs) => setManual((m) => ({ ...m, carbs }))} keyboardType="decimal-pad" inputMode="decimal" />
        <Field label="Fat (g)" value={manual.fat} onChangeText={(fat) => setManual((m) => ({ ...m, fat }))} keyboardType="decimal-pad" inputMode="decimal" />
        {macroKcal !== null ? <Muted>Macros add up to {macroKcal} kcal.</Muted> : null}
        <Button title="Save manual targets" variant="secondary" onPress={() => save("manual")} disabled={!manualValues} loading={saveTarget.isPending} />
      </Card>

      {saveError ? <Banner tone="error">{saveError}</Banner> : null}
      {saved ? <Banner tone="info">{saved}</Banner> : null}
    </Screen>
  );
}

function proposalErrorMessage(error: string): string {
  switch (error) {
    case "NO_CURRENT_WEIGHT":
      return "Log your current weight first.";
    case "PROFILE_INCOMPLETE":
      return "Complete your profile in Settings first.";
    case "TARGET_DATE_NOT_IN_FUTURE":
      return "Choose a goal date in the future.";
    default:
      return "Check the goal weight and rate.";
  }
}
