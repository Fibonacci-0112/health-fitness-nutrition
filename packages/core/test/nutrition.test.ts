import { describe, expect, it } from "vitest";
import { isComplete, scaleNutrients, sumNutrients } from "../src";

describe("scaleNutrients", () => {
  it("scales known values and keeps unknown values unknown", () => {
    const s = scaleNutrients({ energyKcal: 389, proteinG: 16.9, fiberG: null }, 0.5);
    expect(s.energyKcal).toBeCloseTo(194.5);
    expect(s.proteinG).toBeCloseTo(8.45);
    expect(s.fiberG).toBeNull();
    expect(s.sodiumMg).toBeNull();
  });
});

describe("sumNutrients", () => {
  it("never treats unknown as zero", () => {
    const t = sumNutrients([
      { energyKcal: 300, proteinG: 10, fiberG: 0 },
      { energyKcal: 200, proteinG: null, fiberG: 4 },
    ]);
    expect(t.energyKcal).toEqual({ value: 500, missingCount: 0 });
    expect(t.proteinG).toEqual({ value: 10, missingCount: 1 });
    expect(isComplete(t.proteinG)).toBe(false);
    // An explicit 0 is a known value.
    expect(t.fiberG).toEqual({ value: 4, missingCount: 0 });
  });

  it("returns zeroed, complete totals for an empty day", () => {
    const t = sumNutrients([]);
    expect(t.energyKcal).toEqual({ value: 0, missingCount: 0 });
  });
});
