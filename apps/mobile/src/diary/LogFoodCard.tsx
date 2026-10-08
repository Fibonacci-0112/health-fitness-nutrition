import { isIsoDate, MEAL_SLOTS, type MealSlot, type Quantity } from "@hfn/core";
import { randomUUID } from "expo-crypto";
import { useState } from "react";
import { useLogFood } from "../api/diary";
import type { Profile } from "../api/profile";
import { buildLogEntry, entryCostLabel, MEAL_LABELS } from "../lib/diary";
import type { FoodWithServings, PriceRow } from "../lib/foods";
import { parseDecimal, saveErrorMessage } from "../lib/format";
import { Banner, Button, Card, Choice, Field, Label, Muted } from "../ui";

/** "g", "ml", or a serving id. */
type UnitChoice = string;

function defaultUnit(food: FoodWithServings): UnitChoice {
  if (food.nutrient_basis === "per_serving" && food.basis_serving_id) return food.basis_serving_id;
  return food.nutrient_basis === "per_100ml" ? "ml" : "g";
}

/** Log an amount of a food to the diary, snapshotting its nutrition and estimated cost. */
export function LogFoodCard({
  food,
  prices,
  profile,
  initialDate,
  initialMeal,
  onLogged,
}: {
  food: FoodWithServings;
  prices: readonly PriceRow[];
  profile: Profile;
  initialDate: string;
  initialMeal: MealSlot;
  /** Called after a successful save, e.g. to return to the diary. */
  onLogged?: () => void;
}) {
  const logFood = useLogFood();
  // One id per entry being composed: a retried save upserts the same row.
  const [entryId, setEntryId] = useState(() => randomUUID());
  const [meal, setMeal] = useState<MealSlot>(initialMeal);
  const [unit, setUnit] = useState<UnitChoice>(() => defaultUnit(food));
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(initialDate);
  const [message, setMessage] = useState<{ tone: "error" | "info"; text: string } | null>(null);

  const amountValue = parseDecimal(amount);
  const quantity: Quantity =
    unit === "g" || unit === "ml"
      ? { amount: amountValue ?? 0, unit }
      : { amount: amountValue ?? 0, unit: "serving", servingId: unit };
  const dateValid = isIsoDate(date);
  const built =
    amountValue !== null && amountValue > 0 && dateValid
      ? buildLogEntry({ id: entryId, food, prices, quantity, logDate: date, mealSlot: meal, currency: profile.currency })
      : null;

  async function save() {
    if (!built?.ok) return;
    setMessage(null);
    try {
      await logFood.mutateAsync(built.row);
      setMessage({ tone: "info", text: `Logged to ${MEAL_LABELS[meal]} on ${date}.` });
      setAmount("");
      setEntryId(randomUUID());
      onLogged?.();
    } catch (e) {
      setMessage({ tone: "error", text: saveErrorMessage(e) });
    }
  }

  const kcal = built?.ok ? built.row.energy_kcal : null;

  return (
    <Card>
      <Label>Log this food</Label>
      <Choice<MealSlot>
        label="Meal"
        value={meal}
        onChange={setMeal}
        options={MEAL_SLOTS.map((m) => ({ value: m, label: MEAL_LABELS[m] }))}
      />
      <Choice<UnitChoice>
        label="Amount in"
        value={unit}
        onChange={setUnit}
        options={[
          { value: "g", label: "g" },
          { value: "ml", label: "ml" },
          ...food.food_servings.map((s) => ({ value: s.id, label: s.label })),
        ]}
      />
      <Field
        label={unit === "g" || unit === "ml" ? `Amount (${unit})` : "Number of servings"}
        value={amount}
        onChangeText={setAmount}
        keyboardType="decimal-pad"
        inputMode="decimal"
        error={built && !built.ok ? built.message : null}
      />
      <Field
        label="Date"
        placeholder="YYYY-MM-DD"
        value={date}
        onChangeText={setDate}
        error={dateValid ? null : "Enter a date as YYYY-MM-DD."}
      />
      {built?.ok ? (
        <Muted>
          {kcal == null ? "Calories unknown" : `${Math.round(kcal)} kcal`} · {entryCostLabel(built.row, profile.currency)}
        </Muted>
      ) : null}
      {message ? <Banner tone={message.tone}>{message.text}</Banner> : null}
      <Button title="Log food" onPress={save} disabled={!built?.ok} loading={logFood.isPending} />
    </Card>
  );
}
