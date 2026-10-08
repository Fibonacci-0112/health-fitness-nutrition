/**
 * Initial calorie/macro target estimate with guardrails.
 *
 * These are estimates; a manual target always overrides them. Adaptive
 * (data-driven) adjustments are deliberately not implemented here.
 */

import { ageOn, daysBetween } from "./dates";

export type BiologicalSex = "male" | "female";

export type ActivityLevel = "sedentary" | "light" | "moderate" | "active" | "very_active";

export const ACTIVITY_FACTORS: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
};

/** Approximate energy content of one kilogram of body-weight change. */
export const KCAL_PER_KG = 7700;
/** Max recommended loss rate as a fraction of current body weight per week. */
export const MAX_LOSS_FRACTION_PER_WEEK = 0.01;
/** Max recommended gain rate as a fraction of current body weight per week. */
export const MAX_GAIN_FRACTION_PER_WEEK = 0.005;
export const DEFAULT_CALORIE_FLOOR_KCAL = 1200;
export const DEFAULT_PROTEIN_G_PER_KG = 1.6;
export const DEFAULT_FAT_FRACTION = 0.25;
/** Goal weights within this distance of current weight are treated as maintenance. */
const MAINTAIN_TOLERANCE_KG = 0.1;

export function bmrMifflinStJeor(p: { sex: BiologicalSex; weightKg: number; heightCm: number; ageYears: number }): number {
  const base = 10 * p.weightKg + 6.25 * p.heightCm - 5 * p.ageYears;
  return p.sex === "male" ? base + 5 : base - 161;
}

export function tdee(bmr: number, activity: ActivityLevel): number {
  return bmr * ACTIVITY_FACTORS[activity];
}

export type GoalMode = { kind: "rate"; kgPerWeek: number } | { kind: "date"; targetDate: string };

export type GoalWarning = "RATE_ABOVE_SAFE_MAX";

export type GoalPlanError = "INVALID_INPUT" | "TARGET_DATE_NOT_IN_FUTURE";

export interface GoalPlan {
  direction: "lose" | "gain" | "maintain";
  /** Signed: negative for loss. */
  kgPerWeek: number;
  /** Positive magnitude of the safest recommended rate for this direction. */
  maxSafeKgPerWeek: number;
  weeks: number | null;
  targetDate: string | null;
  warnings: GoalWarning[];
  /** When the rate is above the safe max: the target date reached at the max safe rate. */
  dateAtSafeRate: string | null;
}

export type GoalPlanResult = ({ ok: true } & GoalPlan) | { ok: false; error: GoalPlanError };

function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + Math.ceil(days));
  return d.toISOString().slice(0, 10);
}

/**
 * Derive rate from a goal date, or goal date from a rate, and flag rates above
 * the recommended maximum. It never silently changes what the user asked for;
 * the caller decides between a later date, the safe rate, or a manual target.
 */
export function planGoal(input: {
  currentWeightKg: number;
  goalWeightKg: number;
  today: string;
  mode: GoalMode;
}): GoalPlanResult {
  const { currentWeightKg, goalWeightKg, today, mode } = input;
  if (!(currentWeightKg > 0) || !(goalWeightKg > 0)) return { ok: false, error: "INVALID_INPUT" };

  const deltaKg = goalWeightKg - currentWeightKg;
  if (Math.abs(deltaKg) < MAINTAIN_TOLERANCE_KG) {
    return {
      ok: true,
      direction: "maintain",
      kgPerWeek: 0,
      maxSafeKgPerWeek: 0,
      weeks: null,
      targetDate: null,
      warnings: [],
      dateAtSafeRate: null,
    };
  }
  const direction = deltaKg < 0 ? "lose" : "gain";
  const maxSafe = currentWeightKg * (direction === "lose" ? MAX_LOSS_FRACTION_PER_WEEK : MAX_GAIN_FRACTION_PER_WEEK);

  let rateMagnitude: number;
  let weeks: number;
  let targetDate: string;
  if (mode.kind === "rate") {
    if (!(mode.kgPerWeek > 0)) return { ok: false, error: "INVALID_INPUT" };
    rateMagnitude = mode.kgPerWeek;
    weeks = Math.abs(deltaKg) / rateMagnitude;
    targetDate = addDays(today, weeks * 7);
  } else {
    const days = daysBetween(today, mode.targetDate);
    if (days === null) return { ok: false, error: "INVALID_INPUT" };
    if (days <= 0) return { ok: false, error: "TARGET_DATE_NOT_IN_FUTURE" };
    weeks = days / 7;
    rateMagnitude = Math.abs(deltaKg) / weeks;
    targetDate = mode.targetDate;
  }

  const tooFast = rateMagnitude > maxSafe + 1e-9;
  return {
    ok: true,
    direction,
    kgPerWeek: direction === "lose" ? -rateMagnitude : rateMagnitude,
    maxSafeKgPerWeek: maxSafe,
    weeks,
    targetDate,
    warnings: tooFast ? ["RATE_ABOVE_SAFE_MAX"] : [],
    dateAtSafeRate: tooFast ? addDays(today, (Math.abs(deltaKg) / maxSafe) * 7) : null,
  };
}

export type TargetWarning = "CALORIE_FLOOR_APPLIED" | "MACROS_EXCEED_CALORIES";

export interface TargetEstimate {
  bmr: number;
  tdee: number;
  kcal: number;
  proteinG: number;
  fatG: number;
  carbsG: number;
  warnings: TargetWarning[];
}

export function estimateTargets(input: {
  sex: BiologicalSex;
  ageYears: number;
  heightCm: number;
  weightKg: number;
  activity: ActivityLevel;
  /** Signed weekly rate: negative to lose. */
  kgPerWeek: number;
  calorieFloorKcal?: number;
  proteinGPerKg?: number;
  fatFraction?: number;
}): TargetEstimate {
  const floor = input.calorieFloorKcal ?? DEFAULT_CALORIE_FLOOR_KCAL;
  const proteinPerKg = input.proteinGPerKg ?? DEFAULT_PROTEIN_G_PER_KG;
  const fatFraction = input.fatFraction ?? DEFAULT_FAT_FRACTION;
  const warnings: TargetWarning[] = [];

  const bmr = bmrMifflinStJeor(input);
  const maintenance = tdee(bmr, input.activity);
  let kcal = Math.round(maintenance + (input.kgPerWeek * KCAL_PER_KG) / 7);
  if (kcal < floor) {
    kcal = floor;
    warnings.push("CALORIE_FLOOR_APPLIED");
  }

  const proteinG = Math.round(proteinPerKg * input.weightKg);
  const fatG = Math.round((kcal * fatFraction) / 9);
  const remainingKcal = kcal - proteinG * 4 - fatG * 9;
  if (remainingKcal < 0) warnings.push("MACROS_EXCEED_CALORIES");
  const carbsG = Math.max(0, Math.round(remainingKcal / 4));

  return { bmr: Math.round(bmr), tdee: Math.round(maintenance), kcal, proteinG, fatG, carbsG, warnings };
}

export interface TargetProfile {
  sex: BiologicalSex | null;
  birthDate: string | null;
  heightCm: number | null;
  activity: ActivityLevel | null;
  calorieFloorKcal?: number;
}

export type TargetProposal =
  | { ok: true; plan: GoalPlan; estimate: TargetEstimate; ageYears: number }
  | { ok: false; error: "PROFILE_INCOMPLETE"; missing: (keyof TargetProfile)[] }
  | { ok: false; error: "NO_CURRENT_WEIGHT" | GoalPlanError };

/**
 * Combine a profile, the latest weight and a goal into a goal plan plus an
 * initial target estimate. The estimate uses the user's chosen rate; any
 * guardrail warnings are returned for the UI to present, not applied silently.
 */
export function proposeTargets(input: {
  profile: TargetProfile;
  currentWeightKg: number | null;
  goalWeightKg: number;
  mode: GoalMode;
  today: string;
}): TargetProposal {
  const { profile } = input;
  const missing = (["sex", "birthDate", "heightCm", "activity"] as const).filter((k) => profile[k] == null);
  if (missing.length > 0) return { ok: false, error: "PROFILE_INCOMPLETE", missing: [...missing] };
  if (input.currentWeightKg == null) return { ok: false, error: "NO_CURRENT_WEIGHT" };

  const ageYears = ageOn(profile.birthDate!, input.today);
  if (ageYears === null || ageYears < 0) return { ok: false, error: "INVALID_INPUT" };

  const plan = planGoal({
    currentWeightKg: input.currentWeightKg,
    goalWeightKg: input.goalWeightKg,
    today: input.today,
    mode: input.mode,
  });
  if (!plan.ok) return plan;

  const estimate = estimateTargets({
    sex: profile.sex!,
    ageYears,
    heightCm: profile.heightCm!,
    weightKg: input.currentWeightKg,
    activity: profile.activity!,
    kgPerWeek: plan.kgPerWeek,
    calorieFloorKcal: profile.calorieFloorKcal,
  });
  return { ok: true, plan, estimate, ageYears };
}
