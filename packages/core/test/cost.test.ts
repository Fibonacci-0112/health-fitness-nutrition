import { describe, expect, it } from "vitest";
import {
  consumptionCost,
  formatMoney,
  minorUnitDigits,
  selectPrice,
  sumCosts,
  toMinorUnits,
  type FoodMeasureDef,
  type PriceRecord,
} from "../src";

const oats: FoodMeasureDef = { nutrientBasis: "per_100g", servings: [{ id: "cup", label: "1 cup", grams: 80 }] };
const eggs: FoodMeasureDef = { nutrientBasis: "per_serving", basisServingId: "egg", servings: [{ id: "egg", label: "1 egg" }] };
const milk: FoodMeasureDef = { nutrientBasis: "per_100ml", densityGPerMl: 1.03, servings: [] };

function price(overrides: Partial<PriceRecord>): PriceRecord {
  return {
    id: "p",
    foodId: "oats",
    packageQuantity: { amount: 1000, unit: "g" },
    priceMinor: 249,
    currency: "EUR",
    effectiveDate: "2026-01-01",
    ...overrides,
  };
}

describe("consumptionCost", () => {
  it("prices grams against a package in grams", () => {
    const r = consumptionCost(oats, { amount: 80, unit: "g" }, price({}));
    expect(r).toEqual({ ok: true, costMinor: 20, currency: "EUR" }); // 249 * 0.08 = 19.92
  });

  it("prices servings against a package in grams", () => {
    const r = consumptionCost(oats, { amount: 2, unit: "serving", servingId: "cup" }, price({}));
    expect(r.ok && r.costMinor).toBe(40); // 160 g -> 39.84
  });

  it("prices count servings against a count package", () => {
    const p = price({ foodId: "eggs", packageQuantity: { amount: 10, unit: "serving", servingId: "egg" }, priceMinor: 350 });
    const r = consumptionCost(eggs, { amount: 2, unit: "serving", servingId: "egg" }, p);
    expect(r.ok && r.costMinor).toBe(70);
  });

  it("uses density to price grams against a package in ml", () => {
    const p = price({ foodId: "milk", packageQuantity: { amount: 1000, unit: "ml" }, priceMinor: 119 });
    const r = consumptionCost(milk, { amount: 515, unit: "g" }, p); // 500 ml
    expect(r.ok && r.costMinor).toBe(60); // 59.5 -> 60
  });

  it("rejects quantities that can't be compared with the package", () => {
    const p = price({ foodId: "eggs", packageQuantity: { amount: 10, unit: "serving", servingId: "egg" } });
    const r = consumptionCost(eggs, { amount: 100, unit: "g" }, p);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("UNCONVERTIBLE");
  });
});

describe("selectPrice", () => {
  const prices: PriceRecord[] = [
    price({ id: "jan", effectiveDate: "2026-01-01", priceMinor: 249 }),
    price({ id: "mar", effectiveDate: "2026-03-01", priceMinor: 279 }),
    price({ id: "usd", effectiveDate: "2026-02-01", currency: "USD", priceMinor: 300 }),
    price({ id: "other-food", foodId: "rice", effectiveDate: "2025-01-01" }),
  ];
  const q = (logDate: string, currency = "EUR") => selectPrice(prices, { foodId: "oats", logDate, currency });

  it("uses the latest price effective on or before the log date", () => {
    expect(q("2026-02-28")).toMatchObject({ ok: true, price: { id: "jan" } });
    expect(q("2026-03-01")).toMatchObject({ ok: true, price: { id: "mar" } }); // boundary is inclusive
    expect(q("2026-12-31")).toMatchObject({ ok: true, price: { id: "mar" } });
  });

  it("reports when no price was effective yet", () => {
    expect(q("2025-12-31")).toEqual({ ok: false, reason: "NOT_YET_EFFECTIVE" });
  });

  it("does not convert currencies", () => {
    expect(selectPrice([prices[2]!], { foodId: "oats", logDate: "2026-06-01", currency: "EUR" })).toEqual({
      ok: false,
      reason: "CURRENCY_MISMATCH",
    });
    expect(q("2026-06-01", "USD")).toMatchObject({ ok: true, price: { id: "usd" } });
  });

  it("reports foods without any price", () => {
    expect(selectPrice(prices, { foodId: "beans", logDate: "2026-06-01", currency: "EUR" })).toEqual({
      ok: false,
      reason: "NO_PRICE",
    });
  });

  it("breaks same-day ties by creation time", () => {
    const tied = [
      price({ id: "first", createdAt: "2026-01-01T08:00:00Z" }),
      price({ id: "second", createdAt: "2026-01-01T09:00:00Z" }),
    ];
    expect(selectPrice(tied, { foodId: "oats", logDate: "2026-01-01", currency: "EUR" })).toMatchObject({
      price: { id: "second" },
    });
  });
});

describe("sumCosts", () => {
  it("counts missing costs and other currencies as unpriced", () => {
    const t = sumCosts(
      [
        { costMinor: 20, currency: "EUR" },
        { costMinor: 70, currency: "EUR" },
        { costMinor: null, currency: null },
        { costMinor: 100, currency: "USD" },
      ],
      "EUR",
    );
    expect(t).toEqual({ totalMinor: 90, currency: "EUR", unpricedCount: 2 });
  });
});

describe("money helpers", () => {
  it("knows currency minor units", () => {
    expect(minorUnitDigits("EUR")).toBe(2);
    expect(minorUnitDigits("JPY")).toBe(0);
    expect(toMinorUnits(2.49, "EUR")).toBe(249);
    expect(toMinorUnits(350, "JPY")).toBe(350);
  });

  it("formats minor units", () => {
    expect(formatMoney(249, "USD", "en-US")).toBe("$2.49");
    expect(formatMoney(350, "JPY", "en-US")).toBe("¥350");
  });
});
