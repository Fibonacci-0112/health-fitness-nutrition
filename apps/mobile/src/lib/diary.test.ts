import { summarizeDay } from "@hfn/core";
import { describe, expect, it } from "vitest";
import {
  addDays,
  amountLabel,
  buildLogEntry,
  costTotalLabel,
  entryCostLabel,
  toDiaryEntry,
  totalLabel,
  type LogRow,
} from "./diary";
import type { FoodWithServings, PriceRow } from "./foods";

const food = (over: Partial<FoodWithServings> = {}): FoodWithServings => ({
  id: "bread",
  owner_id: null,
  source: "usda",
  source_id: "172676",
  name: "Bread, oat bran",
  brand: null,
  preparation: "unspecified",
  nutrient_basis: "per_100g",
  basis_serving_id: null,
  density_g_per_ml: null,
  energy_kcal: 236,
  protein_g: 10.4,
  carbs_g: 39.8,
  fat_g: 4.4,
  fiber_g: 4.5,
  sugar_g: 7.7,
  saturated_fat_g: 0.7,
  sodium_mg: null,
  created_at: "2026-10-08T00:00:00Z",
  updated_at: "2026-10-08T00:00:00Z",
  food_servings: [{ id: "slice", food_id: "bread", label: "1 slice", grams: 30, ml: null }],
  ...over,
});

const price = (over: Partial<PriceRow> = {}): PriceRow => ({
  id: "p1",
  user_id: "u",
  food_id: "bread",
  package_amount: 20,
  package_unit: "serving",
  package_serving_id: "slice",
  price_minor: 300,
  currency: "EUR",
  effective_date: "2026-10-01",
  store_note: null,
  created_at: "2026-10-01T00:00:00Z",
  ...over,
});

const args = { id: "log-1", logDate: "2026-10-08", mealSlot: "breakfast" as const, currency: "EUR" };

describe("buildLogEntry", () => {
  it("snapshots servings with nutrition and estimated cost", () => {
    const r = buildLogEntry({ ...args, food: food(), prices: [price()], quantity: { amount: 2, unit: "serving", servingId: "slice" } });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.row).toEqual({
      id: "log-1",
      log_date: "2026-10-08",
      meal_slot: "breakfast",
      food_id: "bread",
      amount: 2,
      unit: "serving",
      serving_id: "slice",
      food_name: "Bread, oat bran",
      food_brand: null,
      serving_label: "1 slice",
      resolved_grams: 60,
      resolved_ml: null,
      energy_kcal: 141.6,
      protein_g: 6.24,
      carbs_g: 23.88,
      fat_g: 2.64,
      fiber_g: 2.7,
      sugar_g: 4.62,
      saturated_fat_g: 0.42,
      sodium_mg: null, // unknown stays unknown
      cost_status: "priced",
      cost_minor: 30, // 300 / 20 slices x 2
      currency: "EUR",
      price_id: "p1",
    });
  });

  it("rounds snapshot values to the stored precision", () => {
    const r = buildLogEntry({ ...args, food: food(), prices: [], quantity: { amount: 33.3333, unit: "g" } });
    expect(r.ok && r.row).toMatchObject({ resolved_grams: 33.333, energy_kcal: 78.67, cost_status: "no_price", cost_minor: null });
  });

  it("rejects an amount that can't be converted, with a readable message", () => {
    const r = buildLogEntry({ ...args, food: food(), prices: [], quantity: { amount: 250, unit: "ml" } });
    expect(r).toEqual({ ok: false, message: "This food's nutrition is per 100 g, but the amount can't be converted to grams." });
  });

  it("logs ml of a per-100 ml food", () => {
    const milk = food({ id: "milk", nutrient_basis: "per_100ml", energy_kcal: 64, food_servings: [] });
    const r = buildLogEntry({ ...args, food: milk, prices: [], quantity: { amount: 250, unit: "ml" } });
    expect(r.ok && r.row).toMatchObject({ resolved_ml: 250, energy_kcal: 160, serving_id: null, serving_label: null });
  });
});

const row = (over: Partial<LogRow>): LogRow =>
  ({
    amount: 150,
    unit: "g",
    serving_label: null,
    cost_status: "no_price",
    cost_minor: null,
    currency: null,
    energy_kcal: 100,
    protein_g: 1,
    carbs_g: 1,
    fat_g: 1,
    fiber_g: null,
    sugar_g: null,
    saturated_fat_g: null,
    sodium_mg: null,
    ...over,
  }) as LogRow;

describe("labels", () => {
  it("describes amounts", () => {
    expect(amountLabel(row({}))).toBe("150 g");
    expect(amountLabel(row({ amount: 1.5, unit: "serving", serving_label: "1 slice" }))).toBe("1.5 × 1 slice");
  });

  it("describes entry cost or why it is unpriced", () => {
    expect(entryCostLabel(row({ cost_status: "priced", cost_minor: 37, currency: "EUR" }), "EUR", "en")).toBe("€0.37 est.");
    expect(entryCostLabel(row({ cost_status: "priced", cost_minor: 37, currency: "USD" }), "EUR", "en")).toBe(
      "unpriced (logged in another currency)",
    );
    expect(entryCostLabel(row({ cost_status: "no_price" }), "EUR")).toBe("unpriced");
    expect(entryCostLabel(row({ cost_status: "currency_mismatch" }), "EUR")).toBe("unpriced (no price in your currency)");
  });

  it("flags incomplete totals and unpriced items instead of treating them as zero", () => {
    const day = summarizeDay(
      [
        toDiaryEntry(row({ energy_kcal: 1500.4, cost_status: "priced", cost_minor: 375, currency: "EUR" })),
        toDiaryEntry(row({ energy_kcal: 350 })),
        toDiaryEntry(row({ energy_kcal: null })),
      ],
      "EUR",
    );
    expect(totalLabel(day.nutrients.energyKcal, "kcal", "en")).toBe("≥ 1,850 kcal (1 item missing data)");
    expect(totalLabel(day.nutrients.proteinG, "g", "en")).toBe("3 g");
    expect(costTotalLabel(day.cost, "en")).toBe("€3.75 est. · 2 items unpriced");
    expect(costTotalLabel({ totalMinor: 412, currency: "EUR", unpricedCount: 0 }, "en")).toBe("€4.12 est.");
  });

  it("shifts dates across month boundaries", () => {
    expect(addDays("2026-10-01", -1)).toBe("2026-09-30");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });
});
