/**
 * Diary entries: the snapshot stored when a food is logged, and day totals.
 *
 * A log entry copies the food's nutrition and the applicable price at log time,
 * so later edits to the food or its prices never rewrite history.
 */

import { consumptionCost, selectPrice, sumCosts, type CostTotal, type PriceRecord } from "./cost";
import { scaleNutrients, sumNutrients, type NutrientTotals, type Nutrients } from "./nutrition";
import { resolveQuantity, type FoodMeasureDef, type Quantity, type QuantityErrorCode, type Result } from "./quantity";

export const MEAL_SLOTS = ["breakfast", "lunch", "dinner", "snack"] as const;
export type MealSlot = (typeof MEAL_SLOTS)[number];

/** Why an entry has (or lacks) an estimated cost. Matches food_logs.cost_status. */
export type CostStatus = "priced" | "no_price" | "not_yet_effective" | "currency_mismatch" | "unconvertible";

export interface LogSnapshot {
  resolvedGrams: number | null;
  resolvedMl: number | null;
  nutrients: Nutrients;
  costStatus: CostStatus;
  costMinor: number | null;
  currency: string | null;
  priceId: string | null;
}

/**
 * Resolve a consumed quantity against a food and its prices. The quantity must
 * convert into the food's nutrient basis, or the entry is rejected. A missing or
 * unusable price never rejects the entry; it is recorded as unpriced instead.
 */
export function snapshotLogEntry(input: {
  foodId: string;
  food: FoodMeasureDef;
  nutrients: Nutrients;
  quantity: Quantity;
  prices: readonly PriceRecord[];
  logDate: string;
  /** The profile currency; prices in other currencies are not converted. */
  currency: string;
}): Result<{ snapshot: LogSnapshot }, QuantityErrorCode> {
  const resolved = resolveQuantity(input.food, input.quantity);
  if (!resolved.ok) return resolved;

  const base = {
    resolvedGrams: resolved.grams,
    resolvedMl: resolved.ml,
    nutrients: scaleNutrients(input.nutrients, resolved.basisMultiplier),
  };
  const unpriced = (costStatus: CostStatus): LogSnapshot => ({ ...base, costStatus, costMinor: null, currency: null, priceId: null });

  const selection = selectPrice(input.prices, { foodId: input.foodId, logDate: input.logDate, currency: input.currency });
  if (!selection.ok) {
    const status: Record<typeof selection.reason, CostStatus> = {
      NO_PRICE: "no_price",
      NOT_YET_EFFECTIVE: "not_yet_effective",
      CURRENCY_MISMATCH: "currency_mismatch",
    };
    return { ok: true, snapshot: unpriced(status[selection.reason]) };
  }

  const cost = consumptionCost(input.food, input.quantity, selection.price);
  if (!cost.ok) return { ok: true, snapshot: unpriced("unconvertible") };
  return {
    ok: true,
    snapshot: { ...base, costStatus: "priced", costMinor: cost.costMinor, currency: cost.currency, priceId: selection.price.id },
  };
}

export interface DiaryEntry {
  nutrients: Nutrients;
  costMinor: number | null;
  currency: string | null;
}

export interface DaySummary {
  entryCount: number;
  nutrients: NutrientTotals;
  cost: CostTotal;
}

/** Totals for a day. Unknown nutrients and unpriced entries are counted, never treated as 0. */
export function summarizeDay(entries: readonly DiaryEntry[], currency: string): DaySummary {
  return {
    entryCount: entries.length,
    nutrients: sumNutrients(entries.map((e) => e.nutrients)),
    cost: sumCosts(entries, currency),
  };
}
