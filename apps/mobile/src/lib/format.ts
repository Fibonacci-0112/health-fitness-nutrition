import { cmToIn, inToCm, kgToLb, lbToKg, localDate } from "@hfn/core";

export type UnitSystem = "metric" | "imperial";

export const weightUnit = (u: UnitSystem) => (u === "imperial" ? "lb" : "kg");
export const heightUnit = (u: UnitSystem) => (u === "imperial" ? "in" : "cm");

export function displayWeight(kg: number, u: UnitSystem): number {
  return round(u === "imperial" ? kgToLb(kg) : kg, 1);
}
export function toKg(value: number, u: UnitSystem): number {
  return u === "imperial" ? lbToKg(value) : value;
}
export function displayHeight(cm: number, u: UnitSystem): number {
  return round(u === "imperial" ? cmToIn(cm) : cm, 1);
}
export function toCm(value: number, u: UnitSystem): number {
  return u === "imperial" ? inToCm(value) : value;
}

export function round(n: number, digits = 0): number {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

/** Parse a user-typed decimal ("72,5" or "72.5"); null when empty or not a finite number. */
export function parseDecimal(text: string): number | null {
  const t = text.trim().replace(",", ".");
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export function deviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

/** Today's calendar date in the user's time zone. */
export function today(timeZone: string): string {
  try {
    return localDate(new Date(), timeZone);
  } catch {
    return localDate(new Date(), "UTC");
  }
}

/** Human message for a failed save. R1 requires connectivity for writes. */
export function saveErrorMessage(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (/network|fetch|offline/i.test(msg)) return "Not saved: you appear to be offline. Your entries are kept; try again when connected.";
  return `Not saved: ${msg}`;
}
