import { expect, test } from "@playwright/test";
import { completeOnboarding, signIn, signOut, signUp, unique } from "./helpers";

// R1 PR 3 journey: sign up -> onboarding -> targets (estimate, guardrail, manual
// override) -> sign out clears the cache -> a second user sees none of it.

test("sign up, onboard, set targets, and keep accounts isolated", async ({ page }) => {
  const userA = unique();
  await signUp(page, userA);

  // Onboarding validates before saving.
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("Enter a date as YYYY-MM-DD.")).toBeVisible();

  await completeOnboarding(page);
  await expect(page.getByText("No targets yet.")).toBeVisible();
  await expect(page.getByText("Latest: 80 kg")).toBeVisible();

  // Estimate: 80 kg, 180 cm, 30 y (on any date in 2026), moderate -> maintenance ~2759 kcal.
  await page.getByRole("tab", { name: "Targets" }).click();
  await page.getByLabel("Goal weight (kg)").fill("75");
  await page.getByLabel("Change per week (kg)").fill("0.5");
  await expect(page.getByText(/Lose 0\.5 kg\/week/)).toBeVisible();

  // Guardrail: 2 kg/week is above 1% of body weight; the estimate can't be saved as-is.
  await page.getByLabel("Change per week (kg)").fill("2");
  await expect(page.getByText(/faster than the recommended maximum of 0\.8 kg\/week/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Use these targets" })).toBeDisabled();
  await page.getByRole("button", { name: "Use 0.8 kg/week" }).click();
  await expect(page.getByRole("button", { name: "Use these targets" })).toBeEnabled();
  await page.getByRole("button", { name: "Use these targets" }).click();
  await expect(page.getByText(/Saved\. These targets apply from/)).toBeVisible();
  await expect(page.getByText("Estimated · since", { exact: false })).toBeVisible();

  // Manual override wins.
  await page.getByLabel("Calories (kcal)").fill("2100");
  await page.getByLabel("Protein (g)").fill("150");
  await page.getByLabel("Carbs (g)").fill("200");
  await page.getByLabel("Fat (g)").fill("70");
  await page.getByRole("button", { name: "Save manual targets" }).click();
  await expect(page.getByText("Set manually · since", { exact: false })).toBeVisible();

  await page.getByRole("tab", { name: "Today" }).click();
  await expect(page.getByText("2100 kcal", { exact: true })).toBeVisible();

  // Sign out removes this user's persisted query cache.
  await signOut(page);
  const cacheKeys = await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("hfn-query-cache:")));
  expect(cacheKeys).toEqual([]);

  // A second user starts from scratch and sees none of A's data.
  await signUp(page, unique());
  await completeOnboarding(page);
  await expect(page.getByText("No targets yet.")).toBeVisible();
  await signOut(page);

  // A's data is still there for A.
  await signIn(page, userA);
  await expect(page.getByText("2100 kcal", { exact: true })).toBeVisible();
});
