import { NUTRIENT_KEYS, REQUIRED_NUTRIENTS, type NutrientBasis, type NutrientKey } from "@hfn/core";
import { randomUUID } from "expo-crypto";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { useFood, useSaveFood } from "../../../../api/foods";
import {
  NUTRIENT_LABELS,
  buildFoodPayload,
  emptyFoodForm,
  formFromFood,
  type FoodForm,
  type Preparation,
  type ServingForm,
} from "../../../../lib/foods";
import { saveErrorMessage } from "../../../../lib/format";
import { Banner, Button, Card, Choice, Field, Label, Loading, Muted, Screen } from "../../../../ui";

const BASIS_OPTIONS: { value: NutrientBasis; label: string }[] = [
  { value: "per_100g", label: "Per 100 g" },
  { value: "per_100ml", label: "Per 100 ml" },
  { value: "per_serving", label: "Per serving" },
];

const PREP_OPTIONS: { value: Preparation; label: string }[] = [
  { value: "unspecified", label: "Not specified" },
  { value: "raw", label: "Raw" },
  { value: "cooked", label: "Cooked" },
  { value: "as_sold", label: "As sold" },
];

export default function EditFood() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const existing = useFood(id);
  const saveFood = useSaveFood();

  const [form, setForm] = useState<FoodForm>(emptyFoodForm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (existing.data) setForm(formFromFood(existing.data));
  }, [existing.data]);

  if (id && existing.isPending) return <Loading />;

  const set = <K extends keyof FoodForm>(key: K, value: FoodForm[K]) => setForm((f) => ({ ...f, [key]: value }));
  const setServing = (i: number, patch: Partial<ServingForm>) =>
    setForm((f) => ({ ...f, servings: f.servings.map((s, j) => (j === i ? { ...s, ...patch } : s)) }));
  const addServing = () =>
    setForm((f) => {
      const serving: ServingForm = { id: randomUUID(), label: "", amount: "", unit: f.basis === "per_100ml" ? "ml" : "g" };
      return {
        ...f,
        servings: [...f.servings, serving],
        basisServingId: f.basis === "per_serving" && !f.basisServingId ? serving.id : f.basisServingId,
      };
    });
  const removeServing = (i: number) =>
    setForm((f) => {
      const removed = f.servings[i];
      return {
        ...f,
        servings: f.servings.filter((_, j) => j !== i),
        basisServingId: f.basisServingId === removed?.id ? null : f.basisServingId,
      };
    });

  const basisServing = form.servings.find((s) => s.id === form.basisServingId);
  const per =
    form.basis === "per_100g" ? "per 100 g" : form.basis === "per_100ml" ? "per 100 ml" : `per ${basisServing?.label || "serving"}`;

  async function save() {
    setSaveError(null);
    const result = buildFoodPayload(form);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    try {
      const foodId = await saveFood.mutateAsync(result.payload);
      // Editing returns to the detail screen we came from; creating replaces this form with the new food.
      if (form.id && router.canGoBack()) router.back();
      else router.replace({ pathname: "/foods/[id]", params: { id: foodId } });
    } catch (e) {
      setSaveError(saveErrorMessage(e));
    }
  }

  const required = new Set<NutrientKey>(REQUIRED_NUTRIENTS);

  return (
    <Screen>
      <Card>
        <Field label="Name" value={form.name} onChangeText={(v) => set("name", v)} error={errors.name} />
        <Field label="Brand (optional)" value={form.brand} onChangeText={(v) => set("brand", v)} />
        <Choice<Preparation> label="State" value={form.preparation} onChange={(v) => set("preparation", v)} options={PREP_OPTIONS} />
        <Muted>Raw and cooked weights differ a lot; label which one the nutrition refers to.</Muted>
      </Card>

      <Card>
        <Label>Servings</Label>
        <Muted>Optional household measures, e.g. "1 slice = 28 g". Needed to log or price by the piece.</Muted>
        {form.servings.map((s, i) => (
          <View key={s.id} style={{ gap: 8 }}>
            <Field label={`Serving ${i + 1} name`} placeholder="1 slice" value={s.label} onChangeText={(v) => setServing(i, { label: v })} />
            <Choice<"g" | "ml">
              label={`Serving ${i + 1} measured in`}
              value={s.unit}
              onChange={(v) => setServing(i, { unit: v })}
              options={[
                { value: "g", label: "grams" },
                { value: "ml", label: "ml" },
              ]}
            />
            <Field
              label={`Serving ${i + 1} amount (${s.unit})`}
              value={s.amount}
              onChangeText={(v) => setServing(i, { amount: v })}
              keyboardType="decimal-pad"
              inputMode="decimal"
              error={errors[`servings.${i}`]}
            />
            <Button title={`Remove serving ${i + 1}`} variant="secondary" onPress={() => removeServing(i)} />
          </View>
        ))}
        <Button title="Add serving" variant="secondary" onPress={addServing} />
      </Card>

      <Card>
        <Choice<NutrientBasis>
          label="Nutrition is given"
          value={form.basis}
          onChange={(v) =>
            setForm((f) => ({ ...f, basis: v, basisServingId: v === "per_serving" ? (f.basisServingId ?? f.servings[0]?.id ?? null) : null }))
          }
          options={BASIS_OPTIONS}
        />
        {form.basis === "per_serving" ? (
          form.servings.length === 0 ? (
            <Banner tone="warning">Add a serving above, then choose it here.</Banner>
          ) : (
            <Choice<string>
              label="Nutrition is for"
              value={form.basisServingId}
              onChange={(v) => set("basisServingId", v)}
              options={form.servings.map((s, i) => ({ value: s.id, label: s.label || `Serving ${i + 1}` }))}
            />
          )
        ) : null}
        {errors.basisServingId ? <Banner tone="error">{errors.basisServingId}</Banner> : null}
        <Field
          label="Density (g per ml, optional)"
          value={form.density}
          onChangeText={(v) => set("density", v)}
          keyboardType="decimal-pad"
          inputMode="decimal"
          hint="Only if known. Lets you log a liquid by weight or a solid by volume."
          error={errors.density}
        />
      </Card>

      <Card>
        <Label>Nutrition {per}</Label>
        <Muted>Leave optional values blank if unknown. Blank is shown as unknown, never as zero.</Muted>
        {NUTRIENT_KEYS.map((k) => (
          <Field
            key={k}
            label={`${NUTRIENT_LABELS[k]}${required.has(k) ? "" : " (optional)"}`}
            value={form.nutrients[k]}
            onChangeText={(v) => setForm((f) => ({ ...f, nutrients: { ...f.nutrients, [k]: v } }))}
            keyboardType="decimal-pad"
            inputMode="decimal"
            error={errors[`nutrients.${k}`]}
          />
        ))}
      </Card>

      {Object.keys(errors).length > 0 ? <Banner tone="error">Fix the highlighted fields.</Banner> : null}
      {saveError ? <Banner tone="error">{saveError}</Banner> : null}
      <Button title="Save food" onPress={save} loading={saveFood.isPending} />
    </Screen>
  );
}
