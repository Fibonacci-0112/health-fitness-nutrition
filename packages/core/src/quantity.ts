/**
 * Quantity model.
 *
 * Canonical dimensions are mass (grams) and volume (millilitres). Household
 * measures and counts are expressed as servings that declare their gram and/or
 * millilitre equivalent. Mass <-> volume conversion is only performed when the
 * food declares a density. Anything else is rejected rather than guessed.
 */

export type NutrientBasis = "per_100g" | "per_100ml" | "per_serving";

export interface Serving {
  id: string;
  label: string;
  grams?: number | null;
  ml?: number | null;
}

export interface FoodMeasureDef {
  nutrientBasis: NutrientBasis;
  /** Required when nutrientBasis is "per_serving". */
  basisServingId?: string | null;
  densityGPerMl?: number | null;
  servings: readonly Serving[];
}

export type QuantityUnit = "g" | "ml" | "serving";

export interface Quantity {
  amount: number;
  unit: QuantityUnit;
  /** Required when unit is "serving". */
  servingId?: string | null;
}

export type QuantityErrorCode =
  | "INVALID_AMOUNT"
  | "UNKNOWN_SERVING"
  | "MISSING_BASIS_SERVING"
  | "UNCONVERTIBLE";

export type Result<T, E extends string> =
  | ({ ok: true } & T)
  | { ok: false; error: E; message: string };

export interface Measures {
  grams: number | null;
  ml: number | null;
  /** Set only when the quantity was entered as a serving. */
  serving: { id: string; count: number } | null;
}

export interface ResolvedQuantity extends Measures {
  /** How many nutrient-basis units were consumed (e.g. 1.5 for 150 g on a per_100g food). */
  basisMultiplier: number;
}

function fail(error: QuantityErrorCode, message: string): { ok: false; error: QuantityErrorCode; message: string } {
  return { ok: false, error, message };
}

function positive(n: number | null | undefined): n is number {
  return typeof n === "number" && Number.isFinite(n) && n > 0;
}

/** Express a quantity in grams and/or millilitres, using density only when declared. */
export function toMeasures(food: FoodMeasureDef, qty: Quantity): Result<Measures, QuantityErrorCode> {
  if (!positive(qty.amount)) {
    return fail("INVALID_AMOUNT", "Amount must be a positive number.");
  }
  let grams: number | null = null;
  let ml: number | null = null;
  let serving: Measures["serving"] = null;

  if (qty.unit === "g") {
    grams = qty.amount;
  } else if (qty.unit === "ml") {
    ml = qty.amount;
  } else {
    const s = food.servings.find((x) => x.id === qty.servingId);
    if (!s) return fail("UNKNOWN_SERVING", "That serving does not belong to this food.");
    serving = { id: s.id, count: qty.amount };
    if (positive(s.grams)) grams = s.grams * qty.amount;
    if (positive(s.ml)) ml = s.ml * qty.amount;
  }

  const density = positive(food.densityGPerMl) ? food.densityGPerMl : null;
  if (density !== null) {
    if (grams === null && ml !== null) grams = ml * density;
    if (ml === null && grams !== null) ml = grams / density;
  }
  return { ok: true, grams, ml, serving };
}

/** Resolve a quantity into the food's nutrient basis. */
export function resolveQuantity(food: FoodMeasureDef, qty: Quantity): Result<ResolvedQuantity, QuantityErrorCode> {
  const m = toMeasures(food, qty);
  if (!m.ok) return m;

  switch (food.nutrientBasis) {
    case "per_100g":
      if (m.grams === null) {
        return fail("UNCONVERTIBLE", "This food's nutrition is per 100 g, but the amount can't be converted to grams.");
      }
      return { ...m, basisMultiplier: m.grams / 100 };
    case "per_100ml":
      if (m.ml === null) {
        return fail("UNCONVERTIBLE", "This food's nutrition is per 100 ml, but the amount can't be converted to millilitres.");
      }
      return { ...m, basisMultiplier: m.ml / 100 };
    case "per_serving": {
      const basis = food.servings.find((x) => x.id === food.basisServingId);
      if (!basis) return fail("MISSING_BASIS_SERVING", "This food has no basis serving defined.");
      if (m.serving && m.serving.id === basis.id) {
        return { ...m, basisMultiplier: m.serving.count };
      }
      if (positive(basis.grams) && m.grams !== null) {
        return { ...m, basisMultiplier: m.grams / basis.grams };
      }
      if (positive(basis.ml) && m.ml !== null) {
        return { ...m, basisMultiplier: m.ml / basis.ml };
      }
      return fail("UNCONVERTIBLE", `The amount can't be converted to "${basis.label}".`);
    }
  }
}

/**
 * Ratio of quantity `a` to quantity `b` of the same food, compared in a shared
 * dimension (grams, then millilitres, then identical servings).
 */
export function quantityRatio(food: FoodMeasureDef, a: Quantity, b: Quantity): Result<{ ratio: number }, QuantityErrorCode> {
  const ma = toMeasures(food, a);
  if (!ma.ok) return ma;
  const mb = toMeasures(food, b);
  if (!mb.ok) return mb;
  if (ma.grams !== null && mb.grams !== null) return { ok: true, ratio: ma.grams / mb.grams };
  if (ma.ml !== null && mb.ml !== null) return { ok: true, ratio: ma.ml / mb.ml };
  if (ma.serving && mb.serving && ma.serving.id === mb.serving.id) {
    return { ok: true, ratio: ma.serving.count / mb.serving.count };
  }
  return fail("UNCONVERTIBLE", "The two amounts can't be compared in a common unit.");
}
