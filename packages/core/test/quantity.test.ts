import { describe, expect, it } from "vitest";
import { resolveQuantity, quantityRatio, type FoodMeasureDef, type Quantity } from "../src";

const oats: FoodMeasureDef = {
  nutrientBasis: "per_100g",
  servings: [{ id: "cup", label: "1 cup", grams: 80 }],
};
const milk: FoodMeasureDef = {
  nutrientBasis: "per_100ml",
  densityGPerMl: 1.03,
  servings: [{ id: "glass", label: "1 glass", ml: 250 }],
};
const juiceNoDensity: FoodMeasureDef = { nutrientBasis: "per_100ml", servings: [] };
const bread: FoodMeasureDef = {
  nutrientBasis: "per_serving",
  basisServingId: "slice",
  servings: [{ id: "slice", label: "1 slice", grams: 28 }],
};
const egg: FoodMeasureDef = {
  nutrientBasis: "per_serving",
  basisServingId: "egg",
  servings: [{ id: "egg", label: "1 egg" }],
};

describe("resolveQuantity", () => {
  it.each<[string, FoodMeasureDef, Quantity, number]>([
    ["grams on per_100g", oats, { amount: 150, unit: "g" }, 1.5],
    ["servings on per_100g", oats, { amount: 2, unit: "serving", servingId: "cup" }, 1.6],
    ["ml on per_100ml", milk, { amount: 330, unit: "ml" }, 3.3],
    ["grams on per_100ml via density", milk, { amount: 206, unit: "g" }, 2],
    ["serving ml on per_100ml", milk, { amount: 1, unit: "serving", servingId: "glass" }, 2.5],
    ["basis serving count", bread, { amount: 1.5, unit: "serving", servingId: "slice" }, 1.5],
    ["grams on per_serving", bread, { amount: 56, unit: "g" }, 2],
    ["count-only serving", egg, { amount: 3, unit: "serving", servingId: "egg" }, 3],
  ])("%s", (_name, food, qty, expected) => {
    const r = resolveQuantity(food, qty);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.basisMultiplier).toBeCloseTo(expected, 10);
  });

  it.each<[string, FoodMeasureDef, Quantity, string]>([
    ["zero amount", oats, { amount: 0, unit: "g" }, "INVALID_AMOUNT"],
    ["negative amount", oats, { amount: -5, unit: "g" }, "INVALID_AMOUNT"],
    ["NaN amount", oats, { amount: Number.NaN, unit: "g" }, "INVALID_AMOUNT"],
    ["ml on per_100g without density", oats, { amount: 100, unit: "ml" }, "UNCONVERTIBLE"],
    ["grams on per_100ml without density", juiceNoDensity, { amount: 100, unit: "g" }, "UNCONVERTIBLE"],
    ["grams on count-only serving basis", egg, { amount: 100, unit: "g" }, "UNCONVERTIBLE"],
    ["serving from another food", oats, { amount: 1, unit: "serving", servingId: "slice" }, "UNKNOWN_SERVING"],
    [
      "per_serving without basis serving",
      { nutrientBasis: "per_serving", servings: [] },
      { amount: 1, unit: "g" },
      "MISSING_BASIS_SERVING",
    ],
  ])("rejects %s", (_name, food, qty, error) => {
    const r = resolveQuantity(food, qty);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe(error);
  });
});

describe("quantityRatio", () => {
  it("compares grams to a package in grams", () => {
    const r = quantityRatio(oats, { amount: 80, unit: "g" }, { amount: 1000, unit: "g" });
    expect(r.ok && r.ratio).toBeCloseTo(0.08, 10);
  });

  it("compares identical count servings", () => {
    const r = quantityRatio(egg, { amount: 2, unit: "serving", servingId: "egg" }, { amount: 12, unit: "serving", servingId: "egg" });
    expect(r.ok && r.ratio).toBeCloseTo(1 / 6, 10);
  });

  it("refuses to compare grams with a count-only package", () => {
    const r = quantityRatio(egg, { amount: 100, unit: "g" }, { amount: 12, unit: "serving", servingId: "egg" });
    expect(r.ok).toBe(false);
  });
});
