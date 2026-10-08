import { ACTIVITY_FACTORS, ageOn, isIsoDate, type ActivityLevel, type BiologicalSex } from "@hfn/core";
import { useState } from "react";
import { useProfile, useUpdateProfile } from "../../api/profile";
import { useSaveWeight } from "../../api/weights";
import { deviceTimeZone, heightUnit, parseDecimal, saveErrorMessage, toCm, toKg, today, weightUnit, type UnitSystem } from "../../lib/format";
import { Banner, Button, Card, Choice, Field, Muted, Screen, Title } from "../../ui";

const ACTIVITY_OPTIONS: { value: ActivityLevel; label: string }[] = [
  { value: "sedentary", label: "Sedentary" },
  { value: "light", label: "Light" },
  { value: "moderate", label: "Moderate" },
  { value: "active", label: "Active" },
  { value: "very_active", label: "Very active" },
];

export default function Onboarding() {
  const profile = useProfile().data;
  const updateProfile = useUpdateProfile();
  const saveWeight = useSaveWeight();

  const [units, setUnits] = useState<UnitSystem>((profile?.unit_system as UnitSystem) ?? "metric");
  const [sex, setSex] = useState<BiologicalSex | null>((profile?.sex as BiologicalSex) ?? null);
  const [birthDate, setBirthDate] = useState(profile?.birth_date ?? "");
  const [height, setHeight] = useState("");
  const [weight, setWeight] = useState("");
  const [activity, setActivity] = useState<ActivityLevel | null>((profile?.activity_level as ActivityLevel) ?? null);
  const [currency, setCurrency] = useState(profile?.currency ?? "USD");
  const [timeZone, setTimeZone] = useState(profile?.time_zone && profile.time_zone !== "UTC" ? profile.time_zone : deviceTimeZone());
  const [submitted, setSubmitted] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const todayDate = today(timeZone);
  const heightCm = (() => {
    const v = parseDecimal(height);
    return v === null ? null : toCm(v, units);
  })();
  const weightKg = (() => {
    const v = parseDecimal(weight);
    return v === null ? null : toKg(v, units);
  })();
  const age = isIsoDate(birthDate) ? ageOn(birthDate, todayDate) : null;

  const errors = {
    sex: sex ? null : "Choose one (used for the calorie estimate).",
    birthDate: !isIsoDate(birthDate)
      ? "Enter a date as YYYY-MM-DD."
      : age === null || age < 13 || age > 110
        ? "Enter a birth date for an age between 13 and 110."
        : null,
    height: heightCm === null || heightCm < 50 || heightCm > 272 ? `Enter your height in ${heightUnit(units)}.` : null,
    weight: weightKg === null || weightKg < 20 || weightKg > 500 ? `Enter your current weight in ${weightUnit(units)}.` : null,
    activity: activity ? null : "Choose your typical activity level.",
    currency: /^[A-Z]{3}$/.test(currency) ? null : "Use a 3-letter currency code such as USD, EUR or SEK.",
    timeZone: isValidTimeZone(timeZone) ? null : "Enter a time zone such as Europe/Stockholm.",
  };
  const valid = Object.values(errors).every((e) => e === null);
  const show = (k: keyof typeof errors) => (submitted ? errors[k] : null);

  async function save() {
    setSubmitted(true);
    setSaveError(null);
    if (!valid) return;
    try {
      // Weight first: the profile update completes onboarding and navigates away.
      await saveWeight.mutateAsync({ measuredOn: todayDate, weightKg: weightKg! });
      await updateProfile.mutateAsync({
        unit_system: units,
        sex,
        birth_date: birthDate,
        height_cm: Math.round(heightCm! * 10) / 10,
        activity_level: activity,
        currency,
        time_zone: timeZone,
      });
    } catch (e) {
      setSaveError(saveErrorMessage(e));
    }
  }

  return (
    <Screen>
      <Title>About you</Title>
      <Muted>We use this to estimate your starting calorie and macro targets. You can change any of it later.</Muted>
      <Card>
        <Choice<UnitSystem>
          label="Units"
          value={units}
          onChange={setUnits}
          options={[
            { value: "metric", label: "Metric (kg, cm)" },
            { value: "imperial", label: "Imperial (lb, in)" },
          ]}
        />
        <Choice<BiologicalSex>
          label="Sex (for the BMR formula)"
          value={sex}
          onChange={setSex}
          options={[
            { value: "female", label: "Female" },
            { value: "male", label: "Male" },
          ]}
        />
        {show("sex") ? <Banner tone="error">{show("sex")}</Banner> : null}
        <Field label="Birth date" placeholder="YYYY-MM-DD" value={birthDate} onChangeText={setBirthDate} error={show("birthDate")} />
        <Field
          label={`Height (${heightUnit(units)})`}
          value={height}
          onChangeText={setHeight}
          keyboardType="decimal-pad"
          inputMode="decimal"
          error={show("height")}
        />
        <Field
          label={`Current weight (${weightUnit(units)})`}
          value={weight}
          onChangeText={setWeight}
          keyboardType="decimal-pad"
          inputMode="decimal"
          error={show("weight")}
        />
        <Choice<ActivityLevel> label="Activity level" value={activity} onChange={setActivity} options={ACTIVITY_OPTIONS} />
        {activity ? <Muted>Activity factor ×{ACTIVITY_FACTORS[activity]}</Muted> : null}
        {show("activity") ? <Banner tone="error">{show("activity")}</Banner> : null}
        <Field
          label="Currency"
          value={currency}
          onChangeText={(t) => setCurrency(t.toUpperCase())}
          autoCapitalize="characters"
          maxLength={3}
          hint="Food costs are tracked in this currency."
          error={show("currency")}
        />
        <Field label="Time zone" value={timeZone} onChangeText={setTimeZone} autoCapitalize="none" error={show("timeZone")} />
        {saveError ? <Banner tone="error">{saveError}</Banner> : null}
        <Button title="Continue" onPress={save} loading={updateProfile.isPending || saveWeight.isPending} />
      </Card>
    </Screen>
  );
}

function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return tz.length > 0;
  } catch {
    return false;
  }
}
