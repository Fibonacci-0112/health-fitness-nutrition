import { expect, test } from "@playwright/test";
import { completeOnboarding, signOut, signUp, unique } from "./helpers";
import { apiUrl, openOatBranBread, serviceKey, stubUsdaFunction } from "./usda";

// R1 PR 5: USDA search -> import into the shared catalog -> private prices.
// The usda-search Edge Function is stubbed; see ./usda.ts.

test("search USDA, import once, and price a shared food privately", async ({ page }) => {
  test.skip(!apiUrl || !serviceKey, "needs E2E_SUPABASE_URL and E2E_SERVICE_ROLE_KEY of a throwaway local stack");
  await stubUsdaFunction(page);

  await signUp(page, unique());
  await completeOnboarding(page);
  await openOatBranBread(page);

  // Catalog food: attribution, servings from USDA portions, not editable.
  await expect(page.getByText(/Source: U\.S\. Department of Agriculture, FoodData Central \(FDC ID 172676\)/)).toBeVisible();
  await expect(page.getByText("Servings: 1 oz = 28.35 g, 1 slice = 30 g")).toBeVisible();
  await expect(page.getByRole("button", { name: "Edit food" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Delete food" })).toHaveCount(0);

  // 20 slices x 30 g = 600 g for EUR 3.00 -> EUR 0.50 per 100 g.
  await page.getByRole("radio", { name: "servings", exact: true }).click();
  await page.getByRole("radiogroup", { name: "Serving" }).getByRole("radio", { name: "1 slice", exact: true }).click();
  await page.getByLabel("Number of servings in the package").fill("20");
  await page.getByLabel("Price paid (EUR)").fill("3");
  await page.getByRole("button", { name: "Save price" }).click();
  await expect(page.getByText("€0.50 per 100 g")).toBeVisible();

  // A second user gets the same catalog row but none of the first user's prices.
  await signOut(page);
  await signUp(page, unique());
  await completeOnboarding(page);
  await openOatBranBread(page);
  await expect(page.getByText("No price yet.", { exact: false })).toBeVisible();
});
