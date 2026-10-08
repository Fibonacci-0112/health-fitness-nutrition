/**
 * Pure helpers for the food diary: build the snapshot row stored when a food is
 * logged, and describe entries and day totals. No React Native imports.
 */
import {
  formatMoney,
  NUTRIENT_KEYS,
  snapshotLogEntry,
  type CostStatus,
  type CostTotal,
  type DiaryEntry,
  type MealSlot,
  type NutrientTotal,
  type Nutrients,
  type Quantity,
} from "@hfn/core";
import type { Tables, TablesInsert } from "./database.types";
import { NUTRIENT_COLUMNS, toMeasureDef, toNutrients, toPriceRecord, type FoodWithServings, type PriceRow } from "./foods";

export type LogRow = Tables<"food_logs">;
export type LogInsert = TablesInsert<"food_logs">;

export const MEAL_LABELS: Record<MealSlot, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  snack: "Snacks",
};

/** A sensible default meal for the local hour of day. */
export function mealForHour(hour: number): MealSlot {
  if (hour < 11) return "breakfast";
  if (hour < 15) return "lunch";
  if (hour < 21) return "dinner";
  return "snack";
}

/** Round to the precision of the snapshot columns, so what we show is what is stored. */
const round = (n: number | null | undefined, digits: number) => (n == null ? null : Math.round(n * 10 ** digits) / 10 ** digits);

export type BuildLogResult = { ok: true; row: LogInsert } | { ok: false; message: string };

/**
 * Build the food_logs row for logging `quantity` of `food` on `logDate`. The
 * id is client-generated so a retried save upserts instead of duplicating.
 */
export function buildLogEntry(input: {
  id: string;
  food: FoodWithServings;
  prices: readonly PriceRow[];
  quantity: Quantity;
  logDate: string;
  mealSlot: MealSlot;
  currency: string;
}): BuildLogResult {
  const { food, quantity } = input;
  const r = snapshotLogEntry({
    foodId: food.id,
    food: toMeasureDef(food),
    nutrients: toNutrients(food),
    quantity,
    prices: input.prices.map(toPriceRecord),
    logDate: input.logDate,
    currency: input.currency,
  });
  if (!r.ok) return { ok: false, message: r.message };

  const s = r.snapshot;
  const serving = quantity.unit === "serving" ? food.food_servings.find((x) => x.id === quantity.servingId) : undefined;
  const row: LogInsert = {
    id: input.id,
    log_date: input.logDate,
    meal_slot: input.mealSlot,
    food_id: food.id,
    amount: quantity.amount,
    unit: quantity.unit,
    serving_id: serving?.id ?? null,
    food_name: food.name,
    food_brand: food.brand,
    serving_label: serving?.label ?? null,
    resolved_grams: round(s.resolvedGrams, 3),
    resolved_ml: round(s.resolvedMl, 3),
    cost_status: s.costStatus,
    cost_minor: s.costMinor,
    currency: s.currency,
    price_id: s.priceId,
  };
  for (const k of NUTRIENT_KEYS) row[NUTRIENT_COLUMNS[k]] = round(s.nutrients[k], 2);
  return { ok: true, row };
}

export function logNutrients(row: Pick<LogRow, (typeof NUTRIENT_COLUMNS)[keyof typeof NUTRIENT_COLUMNS]>): Nutrients {
  const out: Nutrients = {};
  for (const k of NUTRIENT_KEYS) out[k] = row[NUTRIENT_COLUMNS[k]];
  return out;
}

export function toDiaryEntry(row: LogRow): DiaryEntry {
  return { nutrients: logNutrients(row), costMinor: row.cost_minor, currency: row.currency };
}

const trim = (n: number) => String(Math.round(n * 1000) / 1000);

/** "150 g", "250 ml", "2 × 1 slice". */
export function amountLabel(row: Pick<LogRow, "amount" | "unit" | "serving_label">): string {
  if (row.unit === "serving") return `${trim(row.amount)} × ${row.serving_label ?? "serving"}`;
  return `${trim(row.amount)} ${row.unit}`;
}

const COST_STATUS_LABELS: Record<Exclude<CostStatus, "priced">, string> = {
  no_price: "unpriced",
  not_yet_effective: "unpriced (price starts later)",
  currency_mismatch: "unpriced (no price in your currency)",
  unconvertible: "unpriced (price package can't be compared)",
};

/** The entry's estimated cost in the display currency, or why it has none. */
export function entryCostLabel(
  row: { cost_status: string; cost_minor?: number | null; currency?: string | null },
  displayCurrency: string,
  locale?: string,
): string {
  if (row.cost_minor != null && row.currency === displayCurrency) return `${formatMoney(row.cost_minor, row.currency, locale)} est.`;
  if (row.cost_minor != null) return "unpriced (logged in another currency)";
  return COST_STATUS_LABELS[row.cost_status as Exclude<CostStatus, "priced">] ?? "unpriced";
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** "1,850 kcal", or "≥ 1,850 kcal (1 item missing data)" when some values are unknown. */
export function totalLabel(t: NutrientTotal, unit: string, locale?: string): string {
  const value = `${Math.round(t.value).toLocaleString(locale)} ${unit}`;
  if (t.missingCount === 0) return value;
  return `≥ ${value} (${plural(t.missingCount, "item", "items")} missing data)`;
}

/** "€4.12 est.", plus "· 2 items unpriced" when some entries have no cost. Never silently partial. */
export function costTotalLabel(c: CostTotal, locale?: string): string {
  const total = `${formatMoney(c.totalMinor, c.currency, locale)} est.`;
  return c.unpricedCount === 0 ? total : `${total} · ${plural(c.unpricedCount, "item", "items")} unpriced`;
}

/** Shift a YYYY-MM-DD date by whole days. */
export function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
