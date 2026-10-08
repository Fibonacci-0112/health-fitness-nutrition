/**
 * Normalize USDA FoodData Central (FDC) responses into catalog rows.
 *
 * Pure TypeScript with no Deno or Node APIs, so it runs in the Edge Function
 * and in Vitest. Rules (docs/PLAN.md §3):
 * - Foundation and SR Legacy nutrients are per 100 g (liquids too).
 * - Branded nutrients are per 100 g, or per 100 ml when the serving is in ml.
 * - A nutrient FDC doesn't report is null (unknown), never 0.
 * - Energy uses nutrient 1008 (kcal) and falls back to the Atwater values
 *   2047 then 2048, which Foundation foods report instead.
 *
 * FDC data is public domain (CC0); the app credits "USDA FoodData Central".
 */

export type NutrientBasis = "per_100g" | "per_100ml";

export interface CatalogNutrients {
  energy_kcal: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  fiber_g: number | null;
  sugar_g: number | null;
  saturated_fat_g: number | null;
  sodium_mg: number | null;
}

export interface CatalogFood extends CatalogNutrients {
  source: "usda";
  source_id: string;
  name: string;
  brand: string | null;
  preparation: "raw" | "cooked" | "as_sold" | "unspecified";
  nutrient_basis: NutrientBasis;
}

export interface CatalogServing {
  label: string;
  grams: number | null;
  ml: number | null;
}

export interface SearchItem extends CatalogNutrients {
  fdcId: number;
  name: string;
  brand: string | null;
  dataType: string;
  nutrient_basis: NutrientBasis;
  serving: string | null;
}

/** FDC nutrient ids, each with the unit we expect it in. */
const NUTRIENTS: Record<Exclude<keyof CatalogNutrients, "energy_kcal">, { ids: number[]; unit: string }> = {
  protein_g: { ids: [1003], unit: "g" },
  carbs_g: { ids: [1005], unit: "g" },
  fat_g: { ids: [1004], unit: "g" },
  fiber_g: { ids: [1079], unit: "g" },
  sugar_g: { ids: [2000, 1063], unit: "g" },
  saturated_fat_g: { ids: [1258], unit: "g" },
  sodium_mg: { ids: [1093], unit: "mg" },
};
const ENERGY_IDS = [1008, 2047, 2048];

type NutrientReading = { id: number; unit: string; value: number | null };

function readNutrients(readings: NutrientReading[]): CatalogNutrients {
  const pick = (ids: number[], unit: string): number | null => {
    for (const id of ids) {
      const r = readings.find((x) => x.id === id && x.unit === unit && typeof x.value === "number" && Number.isFinite(x.value));
      if (r) return round(r.value as number, 2);
    }
    return null;
  };
  const out = { energy_kcal: pick(ENERGY_IDS, "kcal") } as CatalogNutrients;
  for (const [key, spec] of Object.entries(NUTRIENTS) as [keyof typeof NUTRIENTS, (typeof NUTRIENTS)[keyof typeof NUTRIENTS]][]) {
    out[key] = pick(spec.ids, spec.unit);
  }
  return out;
}

function round(n: number, digits: number): number {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

const unitOf = (u: unknown) => (typeof u === "string" ? u.trim().toLowerCase() : "");

/** "GRM"/"g" -> g, "MLT"/"ml" -> ml, anything else -> null. */
function servingUnit(u: unknown): "g" | "ml" | null {
  const s = unitOf(u);
  if (s === "g" || s === "grm" || s === "gram" || s === "grams") return "g";
  if (s === "ml" || s === "mlt" || s === "milliliter" || s === "millilitre") return "ml";
  return null;
}

function titleCase(s: string): string {
  // FDC branded descriptions are often ALL CAPS.
  if (s !== s.toUpperCase()) return s;
  return s.toLowerCase().replace(/\b\p{L}/gu, (c) => c.toUpperCase());
}

function brandOf(f: Record<string, unknown>): string | null {
  const b = (f.brandName as string) || (f.brandOwner as string) || "";
  return b.trim() ? titleCase(b.trim()).slice(0, 200) : null;
}

function basisOf(f: Record<string, unknown>): NutrientBasis {
  return f.dataType === "Branded" && servingUnit(f.servingSizeUnit) === "ml" ? "per_100ml" : "per_100g";
}

function preparationOf(f: Record<string, unknown>, name: string): CatalogFood["preparation"] {
  if (f.dataType === "Branded") return "as_sold";
  const n = name.toLowerCase();
  if (/\b(cooked|boiled|baked|roasted|fried|grilled|steamed|braised|stewed|broiled|microwaved)\b/.test(n)) return "cooked";
  if (/\braw\b/.test(n)) return "raw";
  return "unspecified";
}

function brandedServing(f: Record<string, unknown>): CatalogServing | null {
  const size = typeof f.servingSize === "number" && f.servingSize > 0 ? f.servingSize : null;
  const unit = servingUnit(f.servingSizeUnit);
  if (!size || !unit) return null;
  const rawHousehold = typeof f.householdServingFullText === "string" ? f.householdServingFullText.trim() : "";
  // Label text is often ALL CAPS ("1 CONTAINER"); show it in lower case.
  const household = rawHousehold === rawHousehold.toUpperCase() ? rawHousehold.toLowerCase() : rawHousehold;
  const label = (household ? `${household} (${round(size, 1)} ${unit})` : `1 serving (${round(size, 1)} ${unit})`).slice(0, 80);
  return { label, grams: unit === "g" ? size : null, ml: unit === "ml" ? size : null };
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

export function normalizeSearch(json: unknown): SearchItem[] {
  const foods = (json as { foods?: unknown[] })?.foods;
  if (!Array.isArray(foods)) return [];
  return foods.flatMap((raw) => {
    const f = raw as Record<string, unknown>;
    if (typeof f.fdcId !== "number" || typeof f.description !== "string") return [];
    const readings = (Array.isArray(f.foodNutrients) ? f.foodNutrients : []).map((n: Record<string, unknown>) => ({
      id: Number(n.nutrientId),
      unit: unitOf(n.unitName),
      value: typeof n.value === "number" ? n.value : null,
    }));
    const serving = f.dataType === "Branded" ? brandedServing(f) : null;
    return [
      {
        fdcId: f.fdcId,
        name: titleCase(f.description).slice(0, 200),
        brand: brandOf(f),
        dataType: String(f.dataType ?? ""),
        nutrient_basis: basisOf(f),
        serving: serving?.label ?? null,
        ...readNutrients(readings),
      },
    ];
  });
}

// ---------------------------------------------------------------------------
// Single food
// ---------------------------------------------------------------------------

export function portionLabel(p: Record<string, unknown>): string | null {
  const desc = typeof p.portionDescription === "string" ? p.portionDescription.trim() : "";
  if (desc && !/quantity not specified/i.test(desc)) return desc.slice(0, 80);
  const amount = typeof p.amount === "number" && p.amount > 0 ? round(p.amount, 2) : 1;
  const unitName = typeof (p.measureUnit as Record<string, unknown>)?.name === "string" ? ((p.measureUnit as Record<string, unknown>).name as string) : "";
  const unit = /^(undetermined|racc)$/i.test(unitName) ? "" : unitName;
  const modifier = typeof p.modifier === "string" ? p.modifier.trim() : "";
  if (!unit && !modifier) return /racc/i.test(unitName) ? `${amount} serving` : null;
  return [String(amount), unit, modifier].filter(Boolean).join(" ").slice(0, 80);
}

export function normalizeDetail(json: unknown): { food: CatalogFood; servings: CatalogServing[] } | null {
  const f = json as Record<string, unknown>;
  if (!f || typeof f.fdcId !== "number" || typeof f.description !== "string") return null;

  const readings = (Array.isArray(f.foodNutrients) ? f.foodNutrients : []).map((n: Record<string, unknown>) => {
    const nutrient = (n.nutrient ?? {}) as Record<string, unknown>;
    return { id: Number(nutrient.id), unit: unitOf(nutrient.unitName), value: typeof n.amount === "number" ? n.amount : null };
  });

  const name = titleCase(f.description).slice(0, 200);
  const food: CatalogFood = {
    source: "usda",
    source_id: String(f.fdcId),
    name,
    brand: brandOf(f),
    preparation: preparationOf(f, name),
    nutrient_basis: basisOf(f),
    ...readNutrients(readings),
  };

  const servings: CatalogServing[] = [];
  const seen = new Set<string>();
  const add = (s: CatalogServing | null) => {
    if (!s || seen.has(s.label.toLowerCase())) return;
    seen.add(s.label.toLowerCase());
    servings.push(s);
  };

  if (f.dataType === "Branded") {
    add(brandedServing(f));
  } else {
    const portions = (Array.isArray(f.foodPortions) ? f.foodPortions : []) as Record<string, unknown>[];
    [...portions]
      .sort((a, b) => Number(a.sequenceNumber ?? 0) - Number(b.sequenceNumber ?? 0))
      .forEach((p) => {
        const grams = typeof p.gramWeight === "number" && p.gramWeight > 0 ? round(p.gramWeight, 3) : null;
        const label = portionLabel(p);
        if (grams && label) add({ label, grams, ml: null });
      });
  }

  return { food, servings: servings.slice(0, 20) };
}
