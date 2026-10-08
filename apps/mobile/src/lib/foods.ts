/**
 * Pure helpers that translate between database rows, the food form, and the
 * @hfn/core domain model. No React Native imports, so they can be unit-tested.
 */
import {
  consumptionCost,
  customFoodSchema,
  formatMoney,
  NUTRIENT_KEYS,
  type FoodMeasureDef,
  type NutrientBasis,
  type NutrientKey,
  type Nutrients,
  type PriceRecord,
  type Quantity,
} from "@hfn/core";
import type { Tables } from "./database.types";

export type FoodRow = Tables<"foods">;
export type ServingRow = Tables<"food_servings">;
export type PriceRow = Tables<"food_prices">;
export type FoodWithServings = FoodRow & { food_servings: ServingRow[] };

export type Preparation = "raw" | "cooked" | "as_sold" | "unspecified";

/** Database column for each core nutrient key. */
export const NUTRIENT_COLUMNS = {
  energyKcal: "energy_kcal",
  proteinG: "protein_g",
  carbsG: "carbs_g",
  fatG: "fat_g",
  fiberG: "fiber_g",
  sugarG: "sugar_g",
  saturatedFatG: "saturated_fat_g",
  sodiumMg: "sodium_mg",
} as const satisfies Record<NutrientKey, keyof FoodRow>;

export const NUTRIENT_LABELS: Record<NutrientKey, string> = {
  energyKcal: "Calories (kcal)",
  proteinG: "Protein (g)",
  carbsG: "Carbs (g)",
  fatG: "Fat (g)",
  fiberG: "Fiber (g)",
  sugarG: "Sugar (g)",
  saturatedFatG: "Saturated fat (g)",
  sodiumMg: "Sodium (mg)",
};

export function toMeasureDef(food: FoodWithServings): FoodMeasureDef {
  return {
    nutrientBasis: food.nutrient_basis as NutrientBasis,
    basisServingId: food.basis_serving_id,
    densityGPerMl: food.density_g_per_ml,
    servings: food.food_servings.map((s) => ({ id: s.id, label: s.label, grams: s.grams, ml: s.ml })),
  };
}

export function toNutrients(food: FoodRow): Nutrients {
  const out: Nutrients = {};
  for (const k of NUTRIENT_KEYS) out[k] = food[NUTRIENT_COLUMNS[k]];
  return out;
}

export function toPriceRecord(p: PriceRow): PriceRecord {
  return {
    id: p.id,
    foodId: p.food_id,
    packageQuantity: { amount: p.package_amount, unit: p.package_unit as Quantity["unit"], servingId: p.package_serving_id },
    priceMinor: p.price_minor,
    currency: p.currency,
    effectiveDate: p.effective_date,
    createdAt: p.created_at,
  };
}

/** "per 100 g", "per 100 ml" or "per 1 bar". */
export function basisLabel(food: FoodWithServings): string {
  if (food.nutrient_basis === "per_100g") return "per 100 g";
  if (food.nutrient_basis === "per_100ml") return "per 100 ml";
  const s = food.food_servings.find((x) => x.id === food.basis_serving_id);
  return s ? `per ${s.label}` : "per serving";
}

/** Describe a price package, e.g. "1000 g", "12 × 1 bar". */
export function packageLabel(food: FoodWithServings, p: PriceRow): string {
  if (p.package_unit === "serving") {
    const s = food.food_servings.find((x) => x.id === p.package_serving_id);
    return `${trimNumber(p.package_amount)} × ${s?.label ?? "serving"}`;
  }
  return `${trimNumber(p.package_amount)} ${p.package_unit}`;
}

/**
 * Unit price in the food's own basis, e.g. "€0.25 per 100 g". Null when the
 * package can't be compared with the basis (for example, a count-only serving
 * priced per package but nutrition per 100 g with no serving weight).
 */
export function unitPriceLabel(food: FoodWithServings, price: PriceRecord, locale?: string): string | null {
  const def = toMeasureDef(food);
  const basisQty: Quantity =
    food.nutrient_basis === "per_100g"
      ? { amount: 100, unit: "g" }
      : food.nutrient_basis === "per_100ml"
        ? { amount: 100, unit: "ml" }
        : { amount: 1, unit: "serving", servingId: food.basis_serving_id };
  const r = consumptionCost(def, basisQty, price);
  if (!r.ok) return null;
  return `${formatMoney(r.costMinor, r.currency, locale)} ${basisLabel(food)}`;
}

function trimNumber(n: number): string {
  return String(Math.round(n * 1000) / 1000);
}

// ---------------------------------------------------------------------------
// Food form
// ---------------------------------------------------------------------------

export interface ServingForm {
  id: string;
  label: string;
  amount: string;
  unit: "g" | "ml";
}

export interface FoodForm {
  id?: string;
  name: string;
  brand: string;
  preparation: Preparation;
  basis: NutrientBasis;
  basisServingId: string | null;
  density: string;
  servings: ServingForm[];
  nutrients: Record<NutrientKey, string>;
}

export function emptyFoodForm(): FoodForm {
  return {
    name: "",
    brand: "",
    preparation: "unspecified",
    basis: "per_100g",
    basisServingId: null,
    density: "",
    servings: [],
    nutrients: Object.fromEntries(NUTRIENT_KEYS.map((k) => [k, ""])) as Record<NutrientKey, string>,
  };
}

export function formFromFood(food: FoodWithServings): FoodForm {
  return {
    id: food.id,
    name: food.name,
    brand: food.brand ?? "",
    preparation: food.preparation as Preparation,
    basis: food.nutrient_basis as NutrientBasis,
    basisServingId: food.basis_serving_id,
    density: food.density_g_per_ml == null ? "" : String(food.density_g_per_ml),
    servings: food.food_servings.map((s) => ({
      id: s.id,
      label: s.label,
      amount: String(s.grams ?? s.ml ?? ""),
      unit: s.grams != null ? "g" : "ml",
    })),
    nutrients: Object.fromEntries(
      NUTRIENT_KEYS.map((k) => {
        const v = food[NUTRIENT_COLUMNS[k]];
        return [k, v == null ? "" : String(v)];
      }),
    ) as Record<NutrientKey, string>,
  };
}

export interface FoodPayload {
  food: Record<string, string | number | null>;
  servings: { id: string; label: string; grams: number | null; ml: number | null }[];
}

export type FoodFormResult = { ok: true; payload: FoodPayload } | { ok: false; errors: Record<string, string> };

/** Parse "12,5" or "12.5"; empty means unknown (null); anything else is NaN. */
function parseOptional(text: string): number | null {
  const t = text.trim().replace(",", ".");
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : Number.NaN;
}

/**
 * Validate the form with the shared schema and build the save_custom_food
 * payload. Error keys: "name", "basisServingId", "density", "servings.<i>",
 * "nutrients.<key>".
 */
export function buildFoodPayload(form: FoodForm): FoodFormResult {
  const errors: Record<string, string> = {};

  const servings = form.servings.map((s, i) => {
    const amount = parseOptional(s.amount);
    if (s.label.trim() === "" || amount === null || Number.isNaN(amount) || amount <= 0) {
      errors[`servings.${i}`] = "Give each serving a name and a positive amount.";
    }
    const value = amount !== null && !Number.isNaN(amount) && amount > 0 ? amount : null;
    return { id: s.id, label: s.label.trim(), grams: s.unit === "g" ? value : null, ml: s.unit === "ml" ? value : null };
  });

  const nutrients: Record<string, number | null> = {};
  for (const k of NUTRIENT_KEYS) {
    const v = parseOptional(form.nutrients[k]);
    if (Number.isNaN(v as number) || (v !== null && v < 0)) errors[`nutrients.${k}`] = "Enter a number of 0 or more.";
    nutrients[k] = v !== null && !Number.isNaN(v) && v >= 0 ? v : null;
  }

  const density = parseOptional(form.density);
  if (density !== null && (Number.isNaN(density) || density <= 0)) errors.density = "Enter a positive number, or leave it blank.";

  const parsed = customFoodSchema.safeParse({
    name: form.name,
    brand: form.brand.trim() || null,
    preparation: form.preparation,
    nutrientBasis: form.basis,
    basisServingId: form.basis === "per_serving" ? form.basisServingId : null,
    densityGPerMl: density !== null && !Number.isNaN(density) && density > 0 ? density : null,
    servings: servings.map((s) => ({ ...s, grams: s.grams ?? undefined, ml: s.ml ?? undefined })),
    nutrients,
  });
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const [head, idx] = issue.path;
      const key =
        head === "nutrients" ? `nutrients.${String(idx)}` : head === "servings" ? `servings.${String(idx)}` : String(head);
      errors[key] ??= issue.message === "Required for custom foods." ? "Required." : issue.message;
    }
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  const food: FoodPayload["food"] = {
    id: form.id ?? null,
    name: form.name.trim(),
    brand: form.brand.trim() || null,
    preparation: form.preparation,
    nutrient_basis: form.basis,
    basis_serving_id: form.basis === "per_serving" ? form.basisServingId : null,
    density_g_per_ml: density,
  };
  for (const k of NUTRIENT_KEYS) food[NUTRIENT_COLUMNS[k]] = nutrients[k] ?? null;
  return { ok: true, payload: { food, servings } };
}
