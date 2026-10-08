/** Input validation shared by forms and server functions. */

import { z } from "zod";
import { isIsoDate } from "./dates";
import { NUTRIENT_KEYS, REQUIRED_NUTRIENTS, type NutrientKey } from "./nutrition";

const nonNegative = z.number().finite().nonnegative();
const positive = z.number().finite().positive();

export const isoDateSchema = z.string().refine(isIsoDate, "Expected a date as YYYY-MM-DD.");

export const currencySchema = z.string().regex(/^[A-Z]{3}$/, "Expected a 3-letter ISO currency code.");

export const servingSchema = z
  .object({
    id: z.string().min(1),
    label: z.string().trim().min(1).max(80),
    grams: positive.nullable().optional(),
    ml: positive.nullable().optional(),
  })
  .refine((s) => s.grams != null || s.ml != null, "A serving needs a weight in grams or a volume in ml.");

const nutrientsShape = Object.fromEntries(NUTRIENT_KEYS.map((k) => [k, nonNegative.nullable().optional()])) as Record<
  NutrientKey,
  z.ZodOptional<z.ZodNullable<typeof nonNegative>>
>;

export const nutrientsSchema = z.object(nutrientsShape);

/** A user-created food: calories and the three macros are required. */
export const customFoodSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    brand: z.string().trim().max(120).nullable().optional(),
    preparation: z.enum(["raw", "cooked", "as_sold", "unspecified"]).default("unspecified"),
    nutrientBasis: z.enum(["per_100g", "per_100ml", "per_serving"]),
    basisServingId: z.string().nullable().optional(),
    densityGPerMl: positive.nullable().optional(),
    servings: z.array(servingSchema).max(20).default([]),
    nutrients: nutrientsSchema,
  })
  .superRefine((f, ctx) => {
    for (const k of REQUIRED_NUTRIENTS) {
      if (f.nutrients[k] == null) {
        ctx.addIssue({ code: "custom", path: ["nutrients", k], message: "Required for custom foods." });
      }
    }
    if (f.nutrientBasis === "per_serving" && !f.servings.some((s) => s.id === f.basisServingId)) {
      ctx.addIssue({ code: "custom", path: ["basisServingId"], message: "Choose which serving the nutrition is for." });
    }
  });

export const quantitySchema = z
  .object({
    amount: positive,
    unit: z.enum(["g", "ml", "serving"]),
    servingId: z.string().nullable().optional(),
  })
  .refine((q) => q.unit !== "serving" || !!q.servingId, "Choose a serving.");

export const priceSchema = z.object({
  foodId: z.string().min(1),
  packageQuantity: quantitySchema,
  priceMinor: z.number().int().nonnegative(),
  currency: currencySchema,
  effectiveDate: isoDateSchema,
});

export type CustomFoodInput = z.input<typeof customFoodSchema>;
export type PriceInput = z.input<typeof priceSchema>;
