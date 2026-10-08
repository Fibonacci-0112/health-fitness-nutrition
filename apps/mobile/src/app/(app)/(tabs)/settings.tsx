import { useState } from "react";
import { useProfile, useUpdateProfile } from "../../../api/profile";
import { useSession } from "../../../auth/SessionProvider";
import { parseDecimal, saveErrorMessage, type UnitSystem } from "../../../lib/format";
import { Banner, Button, Card, Choice, Field, Label, Muted, Screen, Title } from "../../../ui";

export default function Settings() {
  const { session, signOut } = useSession();
  const profile = useProfile().data!;
  const update = useUpdateProfile();

  const [units, setUnits] = useState<UnitSystem>(profile.unit_system as UnitSystem);
  const [currency, setCurrency] = useState(profile.currency);
  const [floor, setFloor] = useState(String(profile.calorie_floor_kcal));
  const [message, setMessage] = useState<{ tone: "error" | "info"; text: string } | null>(null);

  const floorValue = parseDecimal(floor);
  const floorValid = floorValue !== null && floorValue >= 800 && floorValue <= 3000;
  const currencyValid = /^[A-Z]{3}$/.test(currency);

  async function save() {
    setMessage(null);
    try {
      await update.mutateAsync({ unit_system: units, currency, calorie_floor_kcal: Math.round(floorValue!) });
      setMessage({ tone: "info", text: "Saved." });
    } catch (e) {
      setMessage({ tone: "error", text: saveErrorMessage(e) });
    }
  }

  return (
    <Screen>
      <Title>Settings</Title>
      <Card>
        <Choice<UnitSystem>
          label="Units"
          value={units}
          onChange={setUnits}
          options={[
            { value: "metric", label: "Metric" },
            { value: "imperial", label: "Imperial" },
          ]}
        />
        <Field
          label="Currency"
          value={currency}
          onChangeText={(t) => setCurrency(t.toUpperCase())}
          autoCapitalize="characters"
          maxLength={3}
          hint="Costs logged in another currency are shown as unpriced (no conversion)."
          error={currencyValid ? null : "Use a 3-letter code such as USD."}
        />
        <Field
          label="Calorie floor (kcal)"
          value={floor}
          onChangeText={setFloor}
          keyboardType="number-pad"
          inputMode="numeric"
          hint="Estimated targets never go below this."
          error={floorValid ? null : "Between 800 and 3000."}
        />
        {message ? <Banner tone={message.tone}>{message.text}</Banner> : null}
        <Button title="Save settings" onPress={save} disabled={!floorValid || !currencyValid} loading={update.isPending} />
      </Card>
      <Card>
        <Label>Account</Label>
        <Muted>Signed in as {session?.user.email}</Muted>
        <Muted>Time zone: {profile.time_zone}</Muted>
        <Button title="Sign out" variant="secondary" onPress={signOut} />
      </Card>
    </Screen>
  );
}
