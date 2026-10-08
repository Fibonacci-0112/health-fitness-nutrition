import { expect, test, type Page } from "@playwright/test";
import detail from "../supabase/functions/_shared/fixtures/detail-sr-legacy.json";
import searchFixture from "../supabase/functions/_shared/fixtures/search.json";
import { normalizeDetail, normalizeSearch } from "../supabase/functions/_shared/usda.ts";
import { completeOnboarding, signOut, signUp, unique } from "./helpers";

// R1 PR 5: USDA search -> import into the shared catalog -> private prices.
//
// CI doesn't call the real USDA API (no secret, rate limits). The usda-search
// Edge Function's HTTP calls are intercepted: search returns the normalized
// fixture, and import stores the normalized fixture through the real
// import_catalog_food() database function with the service role, exactly as
// the function does. The handler and normalizer are unit-tested separately.

const apiUrl = process.env.E2E_SUPABASE_URL;
const serviceKey = process.env.E2E_SERVICE_ROLE_KEY;

// The function is cross-origin to the web app, so stubbed responses need CORS headers.
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

async function stubUsdaFunction(page: Page) {
  await page.route("**/functions/v1/usda-search", async (route) => {
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 200, headers: cors });
    const body = route.request().postDataJSON() as { action: string; fdcId?: number };
    if (body.action === "search") {
      return route.fulfill({ headers: cors, json: { items: normalizeSearch(searchFixture), totalHits: 5, page: 1, totalPages: 1 } });
    }
    const normalized = normalizeDetail(detail)!;
    expect(body.fdcId).toBe(Number(normalized.food.source_id));
    const res = await fetch(`${apiUrl}/rest/v1/rpc/import_catalog_food`, {
      method: "POST",
      headers: { apikey: serviceKey!, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ p_food: normalized.food, p_servings: normalized.servings }),
    });
    expect(res.ok).toBe(true);
    return route.fulfill({ headers: cors, json: { foodId: await res.json() } });
  });
}

async function openOatBranBread(page: Page) {
  await page.getByRole("tab", { name: "Foods" }).click();
  await page.getByRole("button", { name: "Search USDA foods" }).click();
  await page.getByRole("textbox", { name: "Search USDA foods" }).fill("oats");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.getByText("5 matches", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "Rolled Oats, Malt O Meal" })).toBeVisible();
  await page.getByRole("button", { name: "Bread, oat bran", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Bread, oat bran" })).toBeVisible();
}

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
  await page.getByRole("radio", { name: "1 slice", exact: true }).click();
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
