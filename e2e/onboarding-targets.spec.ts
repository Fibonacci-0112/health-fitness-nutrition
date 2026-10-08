import { expect, test, type Page } from "@playwright/test";

// R1 PR 3 journey: sign up -> onboarding -> targets (estimate, guardrail, manual
// override) -> sign out clears the cache -> a second user sees none of it.

const password = "correct-horse-battery";
const unique = () => `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;

async function signUp(page: Page, email: string) {
  await page.goto("/");
  await page.getByRole("radio", { name: "Create account" }).click();
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText("About you")).toBeVisible();
}

async function signIn(page: Page, email: string) {
  await page.goto("/");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

async function completeOnboarding(page: Page) {
  await page.getByRole("radio", { name: "Male", exact: true }).click();
  await page.getByLabel("Birth date").fill("1996-01-01");
  await page.getByLabel("Height (cm)").fill("180");
  await page.getByLabel("Current weight (kg)").fill("80");
  await page.getByRole("radio", { name: "Moderate" }).click();
  await page.getByLabel("Currency").fill("EUR");
  await page.getByLabel("Time zone").fill("UTC");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "Today" })).toBeVisible();
}

async function signOut(page: Page) {
  await page.getByRole("tab", { name: "Settings" }).click();
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
}

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
