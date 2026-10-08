import { describe, expect, it } from "vitest";
import { snapshotLogEntry, summarizeDay, type FoodMeasureDef, type Nutrients, type PriceRecord } from "../src";

const oats: FoodMeasureDef = { nutrientBasis: "per_100g", servings: [{ id: "cup", label: "1 cup", grams: 80 }] };
const oatNutrients: Nutrients = { energyKcal: 389, proteinG: 16.9, carbsG: 66.3, fatG: 6.9, fiberG: null };
const bar: FoodMeasureDef = { nutrientBasis: "per_serving", basisServingId: "bar", servings: [{ id: "bar", label: "1 bar", grams: 60 }] };
const egg: FoodMeasureDef = { nutrientBasis: "per_serving", basisServingId: "egg", servings: [{ id: "egg", label: "1 egg" }] };

function price(overrides: Partial<PriceRecord> = {}): PriceRecord {
  return {
    id: "p1",
    foodId: "oats",
    packageQuantity: { amount: 1000, unit: "g" },
    priceMinor: 249,
    currency: "EUR",
    effectiveDate: "2026-01-01",
    ...overrides,
  };
}

const base = { foodId: "oats", food: oats, nutrients: oatNutrients, logDate: "2026-10-08", currency: "EUR" };

describe("snapshotLogEntry", () => {
  it("scales nutrition and prices the entry", () => {
    const r = snapshotLogEntry({ ...base, quantity: { amount: 150, unit: "g" }, prices: [price()] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.snapshot).toMatchObject({
      resolvedGrams: 150,
      resolvedMl: null,
      costStatus: "priced",
      costMinor: 37, // 249 * 0.15 = 37.35
      currency: "EUR",
      priceId: "p1",
    });
    expect(r.snapshot.nutrients.energyKcal).toBeCloseTo(583.5);
    expect(r.snapshot.nutrients.proteinG).toBeCloseTo(25.35);
  });

  it("keeps unknown nutrients unknown", () => {
    const r = snapshotLogEntry({ ...base, quantity: { amount: 100, unit: "g" }, prices: [] });
    expect(r.ok && r.snapshot.nutrients.fiberG).toBeNull();
    expect(r.ok && r.snapshot.nutrients.sodiumMg).toBeNull();
  });

  it("logs servings of a per-serving food", () => {
    const r = snapshotLogEntry({
      foodId: "bar",
      food: bar,
      nutrients: { energyKcal: 210, proteinG: 20, carbsG: 22, fatG: 7 },
      quantity: { amount: 2, unit: "serving", servingId: "bar" },
      prices: [price({ foodId: "bar", packageQuantity: { amount: 12, unit: "serving", servingId: "bar" }, priceMinor: 1800 })],
      logDate: "2026-10-08",
      currency: "EUR",
    });
    expect(r.ok && r.snapshot).toMatchObject({ resolvedGrams: 120, costMinor: 300, nutrients: { energyKcal: 420 } });
  });

  it("logs grams of a per-serving food through the serving weight", () => {
    const r = snapshotLogEntry({
      foodId: "bar",
      food: bar,
      nutrients: { energyKcal: 210, proteinG: 20, carbsG: 22, fatG: 7 },
      quantity: { amount: 90, unit: "g" },
      prices: [price({ foodId: "bar", packageQuantity: { amount: 12, unit: "serving", servingId: "bar" }, priceMinor: 1800 })],
      logDate: "2026-10-08",
      currency: "EUR",
    });
    expect(r.ok && r.snapshot).toMatchObject({ costMinor: 225, nutrients: { energyKcal: 315 } });
  });

  it("rejects a quantity that can't be converted to the nutrient basis", () => {
    const r = snapshotLogEntry({ ...base, quantity: { amount: 250, unit: "ml" }, prices: [price()] });
    expect(r).toMatchObject({ ok: false, error: "UNCONVERTIBLE" });
  });

  it("rejects a non-positive amount", () => {
    expect(snapshotLogEntry({ ...base, quantity: { amount: 0, unit: "g" }, prices: [] })).toMatchObject({ ok: false, error: "INVALID_AMOUNT" });
  });

  it.each([
    ["no price", [], "no_price"],
    ["a price that starts after the log date", [price({ effectiveDate: "2026-10-09" })], "not_yet_effective"],
    ["only a price in another currency", [price({ currency: "USD" })], "currency_mismatch"],
  ] as const)("records %s as unpriced", (_label, prices, status) => {
    const r = snapshotLogEntry({ ...base, quantity: { amount: 100, unit: "g" }, prices });
    expect(r.ok && r.snapshot).toMatchObject({ costStatus: status, costMinor: null, currency: null, priceId: null });
    expect(r.ok && r.snapshot.nutrients.energyKcal).toBeCloseTo(389);
  });

  it("uses the price in effect on the log date", () => {
    const prices = [price({ id: "old", priceMinor: 200 }), price({ id: "new", priceMinor: 300, effectiveDate: "2026-10-08" })];
    const onDay = snapshotLogEntry({ ...base, quantity: { amount: 1000, unit: "g" }, prices });
    const dayBefore = snapshotLogEntry({ ...base, logDate: "2026-10-07", quantity: { amount: 1000, unit: "g" }, prices });
    expect(onDay.ok && onDay.snapshot.priceId).toBe("new");
    expect(dayBefore.ok && dayBefore.snapshot.priceId).toBe("old");
  });

  it("logs the entry unpriced when the price package can't be compared with the amount", () => {
    // Eggs counted by the piece, priced per kilogram: no egg weight, so no cost.
    const r = snapshotLogEntry({
      foodId: "egg",
      food: egg,
      nutrients: { energyKcal: 72, proteinG: 6.3, carbsG: 0.4, fatG: 4.8 },
      quantity: { amount: 2, unit: "serving", servingId: "egg" },
      prices: [price({ foodId: "egg" })],
      logDate: "2026-10-08",
      currency: "EUR",
    });
    expect(r.ok && r.snapshot).toMatchObject({ costStatus: "unconvertible", costMinor: null, nutrients: { energyKcal: 144 } });
  });
});

describe("summarizeDay", () => {
  it("totals nutrients and cost, flagging unknown nutrients and unpriced entries", () => {
    const s = summarizeDay(
      [
        { nutrients: { energyKcal: 583.5, proteinG: 25.35, fiberG: 4 }, costMinor: 37, currency: "EUR" },
        { nutrients: { energyKcal: 420, proteinG: 40, fiberG: null }, costMinor: 300, currency: "EUR" },
        { nutrients: { energyKcal: null, proteinG: 8 }, costMinor: null, currency: null },
      ],
      "EUR",
    );
    expect(s.entryCount).toBe(3);
    expect(s.nutrients.energyKcal).toEqual({ value: 1003.5, missingCount: 1 });
    expect(s.nutrients.proteinG.value).toBeCloseTo(73.35);
    expect(s.nutrients.proteinG.missingCount).toBe(0);
    expect(s.nutrients.fiberG).toEqual({ value: 4, missingCount: 2 });
    expect(s.cost).toEqual({ totalMinor: 337, currency: "EUR", unpricedCount: 1 });
  });

  it("is empty but complete for a day with no entries", () => {
    const s = summarizeDay([], "EUR");
    expect(s.nutrients.energyKcal).toEqual({ value: 0, missingCount: 0 });
    expect(s.cost).toEqual({ totalMinor: 0, currency: "EUR", unpricedCount: 0 });
  });
});
