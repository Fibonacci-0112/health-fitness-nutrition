/**
 * Estimated consumption cost: consumed quantity x unit price from the user's
 * applicable price record. This is NOT grocery spend.
 *
 * Money is always integer minor units (e.g. cents) plus an ISO 4217 code.
 * Dates are local calendar dates as "YYYY-MM-DD" strings.
 */

import { quantityRatio, type FoodMeasureDef, type Quantity, type QuantityErrorCode, type Result } from "./quantity";

export interface PriceRecord {
  id: string;
  foodId: string;
  packageQuantity: Quantity;
  priceMinor: number;
  currency: string;
  effectiveDate: string;
  /** ISO timestamp; breaks ties between records with the same effective date. */
  createdAt?: string;
}

export type PriceSelectionReason = "NO_PRICE" | "NOT_YET_EFFECTIVE" | "CURRENCY_MISMATCH";

export type PriceSelection = { ok: true; price: PriceRecord } | { ok: false; reason: PriceSelectionReason };

/**
 * Pick the price in effect on `logDate`: same food, same currency, latest
 * effective date on or before the log date. No currency conversion.
 */
export function selectPrice(
  prices: readonly PriceRecord[],
  query: { foodId: string; logDate: string; currency: string },
): PriceSelection {
  const forFood = prices.filter((p) => p.foodId === query.foodId);
  if (forFood.length === 0) return { ok: false, reason: "NO_PRICE" };

  const effective = forFood.filter((p) => p.effectiveDate <= query.logDate);
  if (effective.length === 0) return { ok: false, reason: "NOT_YET_EFFECTIVE" };

  const sameCurrency = effective.filter((p) => p.currency === query.currency);
  if (sameCurrency.length === 0) return { ok: false, reason: "CURRENCY_MISMATCH" };

  const best = sameCurrency.reduce((a, b) => {
    if (a.effectiveDate !== b.effectiveDate) return a.effectiveDate > b.effectiveDate ? a : b;
    return (a.createdAt ?? "") >= (b.createdAt ?? "") ? a : b;
  });
  return { ok: true, price: best };
}

/** Cost of consuming `consumed` of a food bought at `price`, rounded to whole minor units. */
export function consumptionCost(
  food: FoodMeasureDef,
  consumed: Quantity,
  price: PriceRecord,
): Result<{ costMinor: number; currency: string }, QuantityErrorCode> {
  const r = quantityRatio(food, consumed, price.packageQuantity);
  if (!r.ok) return r;
  return { ok: true, costMinor: Math.round(price.priceMinor * r.ratio), currency: price.currency };
}

export interface CostEntry {
  costMinor: number | null;
  currency: string | null;
}

export interface CostTotal {
  totalMinor: number;
  currency: string;
  /** Entries with no cost, or a cost in another currency. */
  unpricedCount: number;
}

/** Sum snapshot costs in the display currency. Other currencies count as unpriced. */
export function sumCosts(entries: readonly CostEntry[], currency: string): CostTotal {
  let totalMinor = 0;
  let unpricedCount = 0;
  for (const e of entries) {
    if (e.costMinor !== null && e.currency === currency) totalMinor += e.costMinor;
    else unpricedCount += 1;
  }
  return { totalMinor, currency, unpricedCount };
}

/** Number of minor-unit digits for a currency (2 for EUR/USD, 0 for JPY). */
export function minorUnitDigits(currency: string): number {
  return new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions().maximumFractionDigits ?? 2;
}

export function toMinorUnits(major: number, currency: string): number {
  return Math.round(major * 10 ** minorUnitDigits(currency));
}

export function formatMoney(minor: number, currency: string, locale?: string): string {
  const major = minor / 10 ** minorUnitDigits(currency);
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(major);
}
