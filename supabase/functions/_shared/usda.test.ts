import { describe, expect, it } from "vitest";
import branded from "./fixtures/detail-branded.json";
import foundationLiquid from "./fixtures/detail-foundation-liquid.json";
import foundation from "./fixtures/detail-foundation.json";
import srLegacy from "./fixtures/detail-sr-legacy.json";
import search from "./fixtures/search.json";
import { normalizeDetail, normalizeSearch, portionLabel } from "./usda.ts";

describe("normalizeSearch", () => {
  const items = normalizeSearch(search);

  it("maps every search hit", () => {
    expect(items).toHaveLength(5);
    expect(items.map((i) => i.dataType)).toEqual(["Branded", "Branded", "SR Legacy", "Foundation", "Foundation"]);
  });

  it("title-cases ALL-CAPS branded names and keeps the brand", () => {
    expect(items[0]).toMatchObject({ fdcId: 2672932, name: "Rolled Oats", brand: "Malt O Meal", nutrient_basis: "per_100g" });
    expect(items[0]!.serving).toBe("0.5 cup (40 g)");
  });

  it("uses Atwater energy for Foundation foods that lack nutrient 1008", () => {
    const oatMilk = items.find((i) => i.fdcId === 2257046)!;
    expect(oatMilk.energy_kcal).toBeCloseTo(48.33, 1);
  });

  it("keeps unreported nutrients unknown", () => {
    const steelCut = items.find((i) => i.fdcId === 2346397)!;
    expect(steelCut.fiber_g).toBeNull();
    expect(steelCut.protein_g).toBe(12.5);
  });

  it("tolerates malformed input", () => {
    expect(normalizeSearch(null)).toEqual([]);
    expect(normalizeSearch({ foods: [{ nope: 1 }] })).toEqual([]);
  });
});

describe("normalizeDetail", () => {
  it("normalizes a branded food per 100 g with its label serving", () => {
    const r = normalizeDetail(branded)!;
    expect(r.food).toMatchObject({
      source: "usda", source_id: "2672932", name: "Rolled Oats", brand: "Malt O Meal", preparation: "as_sold",
      nutrient_basis: "per_100g", energy_kcal: 375, protein_g: 12.5, carbs_g: 67.5, fat_g: 7.5, fiber_g: 10, sugar_g: 2.5,
      saturated_fat_g: 1.25, sodium_mg: 0,
    });
    expect(r.servings).toEqual([{ label: "0.5 cup (40 g)", grams: 40, ml: null }]);
  });

  it("builds SR Legacy servings from portions", () => {
    const r = normalizeDetail(srLegacy)!;
    expect(r.food).toMatchObject({ name: "Bread, oat bran", nutrient_basis: "per_100g", energy_kcal: 236, preparation: "unspecified" });
    expect(r.servings).toEqual([
      { label: "1 oz", grams: 28.35, ml: null },
      { label: "1 slice", grams: 30, ml: null },
    ]);
  });

  it("handles Foundation foods: Atwater energy and RACC servings", () => {
    const r = normalizeDetail(foundation)!;
    expect(r.food.energy_kcal).toBeCloseTo(381.25, 2);
    expect(r.food.fiber_g).toBeNull();
    expect(r.servings).toEqual([{ label: "1 serving", grams: 40, ml: null }]);
  });

  it("keeps Foundation liquids per 100 g (as FDC reports them)", () => {
    const r = normalizeDetail(foundationLiquid)!;
    expect(r.food.nutrient_basis).toBe("per_100g");
    expect(r.servings).toEqual([]);
  });

  it("lower-cases ALL-CAPS household servings", () => {
    const r = normalizeDetail({ ...branded, householdServingFullText: "1 CONTAINER", servingSize: 150 })!;
    expect(r.servings).toEqual([{ label: "1 container (150 g)", grams: 150, ml: null }]);
  });

  it("uses ml for branded foods measured in ml", () => {
    const r = normalizeDetail({ ...branded, servingSize: 240, servingSizeUnit: "MLT", householdServingFullText: "1 cup" })!;
    expect(r.food.nutrient_basis).toBe("per_100ml");
    expect(r.servings).toEqual([{ label: "1 cup (240 ml)", grams: null, ml: 240 }]);
  });

  it("ignores nutrients in unexpected units and returns null for junk", () => {
    const r = normalizeDetail({
      ...srLegacy,
      foodNutrients: [{ nutrient: { id: 1008, unitName: "kJ" }, amount: 1000 }],
    })!;
    expect(r.food.energy_kcal).toBeNull();
    expect(normalizeDetail({})).toBeNull();
  });
});

describe("portionLabel", () => {
  it("prefers a real portion description", () => {
    expect(portionLabel({ portionDescription: "1 cup, chopped", amount: 1 })).toBe("1 cup, chopped");
    expect(portionLabel({ portionDescription: "Quantity not specified", amount: 1, modifier: "piece", measureUnit: { name: "undetermined" } }))
      .toBe("1 piece");
  });

  it("drops portions with nothing to call them", () => {
    expect(portionLabel({ amount: 1, measureUnit: { name: "undetermined" } })).toBeNull();
  });
});
