import { describe, expect, it } from "vitest";
import { bmrMifflinStJeor, estimateTargets, planGoal } from "../src";

describe("bmrMifflinStJeor", () => {
  it("matches hand-computed values", () => {
    expect(bmrMifflinStJeor({ sex: "male", weightKg: 80, heightCm: 180, ageYears: 30 })).toBe(1780);
    expect(bmrMifflinStJeor({ sex: "female", weightKg: 60, heightCm: 165, ageYears: 25 })).toBeCloseTo(1345.25);
  });
});

describe("estimateTargets", () => {
  it("applies the weekly rate to maintenance calories", () => {
    const t = estimateTargets({ sex: "male", ageYears: 30, heightCm: 180, weightKg: 80, activity: "moderate", kgPerWeek: -0.5 });
    expect(t.bmr).toBe(1780);
    expect(t.tdee).toBe(2759); // 1780 * 1.55
    expect(t.kcal).toBe(2209); // 2759 - 550
    expect(t.proteinG).toBe(128); // 1.6 g/kg
    expect(t.fatG).toBe(61); // 25% of kcal / 9
    expect(t.carbsG).toBe(287); // (2209 - 512 - 549) / 4
    expect(t.warnings).toEqual([]);
  });

  it("never goes below the calorie floor and says so", () => {
    const t = estimateTargets({ sex: "female", ageYears: 25, heightCm: 165, weightKg: 60, activity: "sedentary", kgPerWeek: -1 });
    expect(t.kcal).toBe(1200);
    expect(t.warnings).toContain("CALORIE_FLOOR_APPLIED");
  });

  it("respects a custom floor", () => {
    const t = estimateTargets({
      sex: "female", ageYears: 25, heightCm: 165, weightKg: 60, activity: "sedentary", kgPerWeek: -1, calorieFloorKcal: 1500,
    });
    expect(t.kcal).toBe(1500);
  });

  it("flags macro settings that exceed the calorie target", () => {
    const t = estimateTargets({
      sex: "female", ageYears: 25, heightCm: 165, weightKg: 60, activity: "sedentary", kgPerWeek: -1, proteinGPerKg: 4,
    });
    expect(t.warnings).toContain("MACROS_EXCEED_CALORIES");
    expect(t.carbsG).toBe(0);
  });
});

describe("planGoal", () => {
  it("derives the rate from a goal date and warns when it is too aggressive", () => {
    const p = planGoal({ currentWeightKg: 90, goalWeightKg: 80, today: "2026-01-01", mode: { kind: "date", targetDate: "2026-02-26" } });
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    expect(p.direction).toBe("lose");
    expect(p.kgPerWeek).toBeCloseTo(-1.25); // 10 kg over 8 weeks
    expect(p.maxSafeKgPerWeek).toBeCloseTo(0.9); // 1% of 90 kg
    expect(p.warnings).toEqual(["RATE_ABOVE_SAFE_MAX"]);
    expect(p.dateAtSafeRate).toBe("2026-03-20"); // 10 / 0.9 weeks = 77.8 days -> 78
    expect(p.targetDate).toBe("2026-02-26"); // the user's choice is not silently changed
  });

  it("derives the date from a rate", () => {
    const p = planGoal({ currentWeightKg: 90, goalWeightKg: 80, today: "2026-01-01", mode: { kind: "rate", kgPerWeek: 0.5 } });
    expect(p).toMatchObject({ ok: true, kgPerWeek: -0.5, weeks: 20, targetDate: "2026-05-21", warnings: [] });
  });

  it("uses a lower safe maximum for gaining", () => {
    const p = planGoal({ currentWeightKg: 70, goalWeightKg: 75, today: "2026-01-01", mode: { kind: "rate", kgPerWeek: 0.5 } });
    expect(p).toMatchObject({ ok: true, direction: "gain", kgPerWeek: 0.5, warnings: ["RATE_ABOVE_SAFE_MAX"] });
  });

  it("treats a goal at the current weight as maintenance", () => {
    const p = planGoal({ currentWeightKg: 80, goalWeightKg: 80.05, today: "2026-01-01", mode: { kind: "rate", kgPerWeek: 0.5 } });
    expect(p).toMatchObject({ ok: true, direction: "maintain", kgPerWeek: 0 });
  });

  it("rejects goal dates that are not in the future", () => {
    expect(planGoal({ currentWeightKg: 90, goalWeightKg: 80, today: "2026-01-01", mode: { kind: "date", targetDate: "2026-01-01" } }))
      .toEqual({ ok: false, error: "TARGET_DATE_NOT_IN_FUTURE" });
  });

  it("rejects invalid input", () => {
    expect(planGoal({ currentWeightKg: 90, goalWeightKg: 80, today: "2026-01-01", mode: { kind: "rate", kgPerWeek: 0 } }))
      .toEqual({ ok: false, error: "INVALID_INPUT" });
    expect(planGoal({ currentWeightKg: 90, goalWeightKg: 80, today: "2026-01-01", mode: { kind: "date", targetDate: "2026-02-30" } }))
      .toEqual({ ok: false, error: "INVALID_INPUT" });
  });
});
