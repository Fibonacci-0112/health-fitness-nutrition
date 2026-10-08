import { expect, test } from "@playwright/test";
import { completeOnboarding, signOut, signUp, unique } from "./helpers";

// R1 PR 4: custom foods with servings, private prices, and unit-price display.
// The user onboards with EUR as their currency.

test("create custom foods, price them, and keep them private", async ({ page }) => {
  await signUp(page, unique());
  await completeOnboarding(page);
  await page.getByRole("tab", { name: "Foods" }).click();
  await expect(page.getByText("No foods yet.", { exact: false })).toBeVisible();

  // Validation: calories and macros are required.
  await page.getByRole("button", { name: "New food" }).click();
  await page.getByLabel("Name", { exact: true }).fill("Protein bar");
  await page.getByRole("button", { name: "Save food" }).click();
  await expect(page.getByText("Fix the highlighted fields.")).toBeVisible();
  await expect(page.getByText("Required.").first()).toBeVisible();

  // A per-serving food: nutrition is for "1 bar" (60 g).
  await page.getByRole("button", { name: "Add serving" }).click();
  await page.getByLabel("Serving 1 name").fill("1 bar");
  await page.getByLabel("Serving 1 amount (g)").fill("60");
  await page.getByRole("radio", { name: "Per serving", exact: true }).click();
  await page.getByLabel("Calories (kcal)", { exact: true }).fill("210");
  await page.getByLabel("Protein (g)", { exact: true }).fill("20");
  await page.getByLabel("Carbs (g)", { exact: true }).fill("22");
  await page.getByLabel("Fat (g)", { exact: true }).fill("7");
  await page.getByRole("button", { name: "Save food" }).click();

  await expect(page.getByRole("heading", { name: "Protein bar" })).toBeVisible();
  await expect(page.getByText("Nutrition per 1 bar")).toBeVisible();
  await expect(page.getByText("unknown").first()).toBeVisible(); // blank optional nutrients are unknown, not 0
  await expect(page.getByText("No price yet.", { exact: false })).toBeVisible();

  // Price a 12-pack: EUR 18.00 / 12 bars = EUR 1.50 per bar.
  await page.getByRole("radio", { name: "servings", exact: true }).click();
  await page.getByLabel("Number of servings in the package").fill("12");
  await page.getByLabel("Price paid (EUR)").fill("18");
  await page.getByRole("button", { name: "Save price" }).click();
  await expect(page.getByText("€1.50 per 1 bar")).toBeVisible();
  await expect(page.getByText(/€18\.00 for 12 × 1 bar/)).toBeVisible();

  // A per-100 g food priced by the kilo: EUR 2.49 / 1000 g -> EUR 0.25 per 100 g (24.9 cents, rounded).
  await page.getByRole("tab", { name: "Foods" }).click();
  await page.getByRole("button", { name: "New food" }).click();
  await page.getByLabel("Name", { exact: true }).fill("Rolled oats");
  await page.getByRole("radio", { name: "Raw", exact: true }).click();
  await page.getByLabel("Calories (kcal)", { exact: true }).fill("389");
  await page.getByLabel("Protein (g)", { exact: true }).fill("16.9");
  await page.getByLabel("Carbs (g)", { exact: true }).fill("66.3");
  await page.getByLabel("Fat (g)", { exact: true }).fill("6.9");
  await page.getByRole("button", { name: "Save food" }).click();
  await expect(page.getByRole("heading", { name: "Rolled oats" })).toBeVisible();
  await page.getByLabel("Package size (g)").fill("1000");
  await page.getByLabel("Price paid (EUR)").fill("2.49");
  await page.getByRole("button", { name: "Save price" }).click();
  await expect(page.getByText("€0.25 per 100 g")).toBeVisible();

  // Edit keeps the price; delete removes the food.
  await page.getByRole("button", { name: "Edit food" }).click();
  await page.getByLabel("Name", { exact: true }).fill("Rolled oats (organic)");
  await page.getByRole("button", { name: "Save food" }).click();
  await expect(page.getByRole("heading", { name: "Rolled oats (organic)" })).toBeVisible();
  await expect(page.getByText("€0.25 per 100 g")).toBeVisible();
  await page.getByRole("button", { name: "Delete food" }).click();
  await page.getByRole("button", { name: "Yes, delete food" }).click();
  await expect(page.getByRole("link", { name: "Protein bar" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Rolled oats (organic)" })).toHaveCount(0);

  // Another user sees none of these foods.
  await signOut(page);
  await signUp(page, unique());
  await completeOnboarding(page);
  await page.getByRole("tab", { name: "Foods" }).click();
  await expect(page.getByText("No foods yet.", { exact: false })).toBeVisible();
});
