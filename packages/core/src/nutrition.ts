/**
 * Nutrient values. `null` (or absent) means "unknown" and is never treated as 0.
 */

export const NUTRIENT_KEYS = [
  "energyKcal",
  "proteinG",
  "carbsG",
  "fatG",
  "fiberG",
  "sugarG",
  "saturatedFatG",
  "sodiumMg",
] as const;

export type NutrientKey = (typeof NUTRIENT_KEYS)[number];

/** Nutrients every custom food must declare. */
export const REQUIRED_NUTRIENTS = ["energyKcal", "proteinG", "carbsG", "fatG"] as const satisfies readonly NutrientKey[];

export type Nutrients = { [K in NutrientKey]?: number | null };

export interface NutrientTotal {
  /** Sum of the known values. */
  value: number;
  /** Number of entries whose value for this nutrient is unknown. */
  missingCount: number;
}

export type NutrientTotals = Record<NutrientKey, NutrientTotal>;

function known(v: number | null | undefined): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

export function scaleNutrients(n: Nutrients, multiplier: number): Nutrients {
  const out: Nutrients = {};
  for (const k of NUTRIENT_KEYS) {
    const v = n[k];
    out[k] = known(v) ? v * multiplier : null;
  }
  return out;
}

export function sumNutrients(entries: readonly Nutrients[]): NutrientTotals {
  const totals = {} as NutrientTotals;
  for (const k of NUTRIENT_KEYS) totals[k] = { value: 0, missingCount: 0 };
  for (const e of entries) {
    for (const k of NUTRIENT_KEYS) {
      const v = e[k];
      if (known(v)) totals[k].value += v;
      else totals[k].missingCount += 1;
    }
  }
  return totals;
}

export function isComplete(t: NutrientTotal): boolean {
  return t.missingCount === 0;
}
