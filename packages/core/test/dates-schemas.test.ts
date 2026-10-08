import { describe, expect, it } from "vitest";
import { ageOn, customFoodSchema, daysBetween, isIsoDate, kgToLb, lbToKg, localDate, priceSchema } from "../src";

describe("dates", () => {
  it("validates calendar dates", () => {
    expect(isIsoDate("2026-02-28")).toBe(true);
    expect(isIsoDate("2026-02-30")).toBe(false);
    expect(isIsoDate("2026-2-3")).toBe(false);
  });

  it("counts days across month boundaries", () => {
    expect(daysBetween("2026-01-31", "2026-03-01")).toBe(29);
    expect(daysBetween("2026-03-01", "2026-01-31")).toBe(-29);
  });

  it("computes age around the birthday", () => {
    expect(ageOn("1990-06-15", "2026-06-14")).toBe(35);
    expect(ageOn("1990-06-15", "2026-06-15")).toBe(36);
  });

  it("uses the user's time zone for the calendar date", () => {
    const instant = new Date("2026-01-01T03:00:00Z");
    expect(localDate(instant, "America/Los_Angeles")).toBe("2025-12-31");
    expect(localDate(instant, "Europe/Stockholm")).toBe("2026-01-01");
  });
});

describe("units", () => {
  it("round-trips kg and lb", () => {
    expect(kgToLb(1)).toBeCloseTo(2.20462);
    expect(lbToKg(kgToLb(81.3))).toBeCloseTo(81.3, 10);
  });
});

describe("customFoodSchema", () => {
  const base = {
    name: "Rolled oats",
    nutrientBasis: "per_100g" as const,
    nutrients: { energyKcal: 389, proteinG: 16.9, carbsG: 66.3, fatG: 6.9 },
  };

  it("accepts a complete food", () => {
    expect(customFoodSchema.safeParse(base).success).toBe(true);
  });

  it("requires calories and macros", () => {
    const r = customFoodSchema.safeParse({ ...base, nutrients: { energyKcal: 389, carbsG: 66.3, fatG: 6.9 } });
    expect(r.success).toBe(false);
    expect(r.error?.issues.map((i) => i.path.join("."))).toContain("nutrients.proteinG");
  });

  it("requires a basis serving for per-serving foods", () => {
    const r = customFoodSchema.safeParse({ ...base, nutrientBasis: "per_serving", servings: [{ id: "s", label: "1 bar", grams: 40 }] });
    expect(r.success).toBe(false);
  });

  it("rejects servings without a weight or volume", () => {
    const r = customFoodSchema.safeParse({ ...base, servings: [{ id: "s", label: "1 bar" }] });
    expect(r.success).toBe(false);
  });
});

describe("priceSchema", () => {
  it("requires integer minor units and an ISO currency", () => {
    const ok = { foodId: "f", packageQuantity: { amount: 1000, unit: "g" }, priceMinor: 249, currency: "EUR", effectiveDate: "2026-01-01" };
    expect(priceSchema.safeParse(ok).success).toBe(true);
    expect(priceSchema.safeParse({ ...ok, priceMinor: 2.49 }).success).toBe(false);
    expect(priceSchema.safeParse({ ...ok, currency: "eur" }).success).toBe(false);
  });
});
