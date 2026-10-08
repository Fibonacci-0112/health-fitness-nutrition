import { selectPrice } from "@hfn/core";
import { describe, expect, it } from "vitest";
import {
  buildFoodPayload,
  emptyFoodForm,
  formFromFood,
  toPriceRecord,
  unitPriceLabel,
  type FoodForm,
  type FoodWithServings,
  type PriceRow,
} from "./foods";

const filled = (over: Partial<FoodForm> = {}): FoodForm => ({
  ...emptyFoodForm(),
  name: "Rolled oats",
  nutrients: { ...emptyFoodForm().nutrients, energyKcal: "389", proteinG: "16.9", carbsG: "66,3", fatG: "6.9" },
  ...over,
});

describe("buildFoodPayload", () => {
  it("builds the RPC payload, keeping blank optional nutrients unknown", () => {
    const r = buildFoodPayload(filled());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.payload.food).toMatchObject({
      name: "Rolled oats", nutrient_basis: "per_100g", energy_kcal: 389, carbs_g: 66.3, fiber_g: null, basis_serving_id: null,
    });
  });

  it("requires calories and macros", () => {
    const f = filled();
    f.nutrients.proteinG = "";
    const r = buildFoodPayload(f);
    expect(r).toEqual({ ok: false, errors: { "nutrients.proteinG": "Required." } });
  });

  it("rejects non-numeric and negative nutrient values", () => {
    const f = filled();
    f.nutrients.fiberG = "abc";
    f.nutrients.sugarG = "-1";
    const r = buildFoodPayload(f);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(Object.keys(r.errors).sort()).toEqual(["nutrients.fiberG", "nutrients.sugarG"]);
  });

  it("requires a basis serving for per-serving foods", () => {
    const r = buildFoodPayload(filled({ basis: "per_serving", servings: [{ id: "s1", label: "1 bar", amount: "60", unit: "g" }] }));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors.basisServingId).toBeDefined();
  });

  it("validates servings and maps their unit", () => {
    const bad = buildFoodPayload(filled({ servings: [{ id: "s1", label: "", amount: "0", unit: "g" }] }));
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.errors["servings.0"]).toBeDefined();

    const ok = buildFoodPayload(
      filled({ basis: "per_serving", basisServingId: "s1", servings: [{ id: "s1", label: "1 glass", amount: "250", unit: "ml" }] }),
    );
    expect(ok.ok && ok.payload.servings).toEqual([{ id: "s1", label: "1 glass", grams: null, ml: 250 }]);
    expect(ok.ok && ok.payload.food.basis_serving_id).toBe("s1");
  });
});

const food: FoodWithServings = {
  id: "f1", owner_id: "u1", source: "custom", source_id: null, name: "Protein bar", brand: null, preparation: "as_sold",
  nutrient_basis: "per_serving", basis_serving_id: "bar", density_g_per_ml: null,
  energy_kcal: 210, protein_g: 20, carbs_g: 22, fat_g: 7, fiber_g: null, sugar_g: null, saturated_fat_g: null, sodium_mg: null,
  created_at: "", updated_at: "",
  food_servings: [{ id: "bar", food_id: "f1", label: "1 bar", grams: 60, ml: null }],
};

const price = (over: Partial<PriceRow>): PriceRow => ({
  id: "p1", user_id: "u1", food_id: "f1", package_amount: 12, package_unit: "serving", package_serving_id: "bar",
  price_minor: 1800, currency: "USD", effective_date: "2026-10-01", store_note: null, created_at: "2026-10-01T10:00:00Z", ...over,
});

describe("unitPriceLabel", () => {
  it("prices one basis serving from a multi-pack", () => {
    expect(unitPriceLabel(food, toPriceRecord(price({})), "en-US")).toBe("$1.50 per 1 bar");
  });

  it("prices a per-serving food bought by weight", () => {
    expect(unitPriceLabel(food, toPriceRecord(price({ package_amount: 600, package_unit: "g", package_serving_id: null })), "en-US"))
      .toBe("$1.80 per 1 bar");
  });

  it("returns null when the package can't be compared", () => {
    expect(unitPriceLabel(food, toPriceRecord(price({ package_amount: 1, package_unit: "ml", package_serving_id: null })), "en-US"))
      .toBeNull();
  });

  it("works with selectPrice on mapped rows", () => {
    const rows = [price({ id: "old", price_minor: 1500, effective_date: "2026-01-01" }), price({ id: "new" })];
    const sel = selectPrice(rows.map(toPriceRecord), { foodId: "f1", logDate: "2026-10-08", currency: "USD" });
    expect(sel.ok && sel.price.id).toBe("new");
  });
});

describe("formFromFood", () => {
  it("round-trips through buildFoodPayload", () => {
    const r = buildFoodPayload(formFromFood(food));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.payload.food).toMatchObject({ id: "f1", basis_serving_id: "bar", energy_kcal: 210, fiber_g: null });
    expect(r.payload.servings).toEqual([{ id: "bar", label: "1 bar", grams: 60, ml: null }]);
  });
});
