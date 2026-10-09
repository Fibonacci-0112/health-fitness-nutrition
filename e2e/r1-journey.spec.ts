import { expect, test, type Page } from "@playwright/test";
import { completeOnboarding, signIn, signOut, signUp, unique } from "./helpers";
import { apiUrl, openOatBranBread, serviceKey, stubUsdaFunction } from "./usda";

// The R1 acceptance journey (docs/PLAN.md): sign up -> set profile -> accept
// targets -> create a custom food with a price -> find a USDA food and add a
// price -> log in g, ml and servings -> Today shows calories, macros and
// estimated food cost with unpriced items flagged -> log weight -> a second
// user sees none of the first user's data.
//
// The user onboards as male, born 1996-01-01, 180 cm, 80 kg, moderately
// active, EUR, UTC (see helpers.ts).
//
// Hand-computed fixture:
//   Targets (goal 75 kg at 0.5 kg/week, age A on the test date)
//     BMR = 10*80 + 6.25*180 - 5*A + 5; kcal = round(BMR * 1.55 - 0.5 * 7700 / 7)
//     protein = 1.6 * 80 = 128 g; fat = round(kcal * 0.25 / 9); carbs = round((kcal - 128*4 - fat*9) / 4)
//     (A = 30 in 2026: 2209 kcal, P 128, C 287, F 61)
//   Rolled oats 80 g      389 kcal/100 g, P 16.9 C 66.3 F 6.9; EUR 2.49 per 1000 g
//                         -> 311.2 kcal, P 13.52 C 53.04 F 5.52, EUR 0.20 (19.92 cents)
//   Bread, oat bran 2 x 1 slice (30 g) = 60 g; 236 kcal/100 g, P 10.4 C 39.8 F 4.4; EUR 3.00 per 20 slices
//                         -> 141.6 kcal, P 6.24 C 23.88 F 2.64, EUR 0.30
//   Whole milk 250 ml     64 kcal/100 ml, P 3.3 C 4.8 F 3.6; no price
//                         -> 160 kcal, P 8.25 C 12 F 9, unpriced
//   Day                   612.8 kcal, P 28.01 C 88.92 F 17.16, EUR 0.50 est. + 1 item unpriced

function expectedTargets(day: string) {
  const age = Number(day.slice(0, 4)) - 1996; // birthday is 1 January, so it has always passed
  const bmr = 10 * 80 + 6.25 * 180 - 5 * age + 5;
  const kcal = Math.round(bmr * 1.55 - (0.5 * 7700) / 7);
  const fat = Math.round((kcal * 0.25) / 9);
  return { kcal, protein: 128, fat, carbs: Math.round((kcal - 128 * 4 - fat * 9) / 4) };
}

function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// The food form and the targets form share field labels, and inactive tabs stay
// mounted, so targets are set once no food form is open.
const field = (page: Page, label: string) => page.getByLabel(label, { exact: true });

async function createFood(page: Page, name: string, basis: "Per 100 g" | "Per 100 ml", n: [string, string, string, string]) {
  await page.getByRole("tab", { name: "Foods" }).click();
  await page.getByRole("button", { name: "New food" }).click();
  await page.getByLabel("Name", { exact: true }).fill(name);
  await page.getByRole("radio", { name: basis, exact: true }).click();
  await field(page, "Calories (kcal)").fill(n[0]);
  await field(page, "Protein (g)").fill(n[1]);
  await field(page, "Carbs (g)").fill(n[2]);
  await field(page, "Fat (g)").fill(n[3]);
  await page.getByRole("button", { name: "Save food" }).click();
  await expect(page.getByRole("heading", { name })).toBeVisible();
}

// Screens earlier in the Foods stack stay mounted (hidden) with their own banners.
const loggedTo = (page: Page, meal: string, day: string) =>
  page.getByText(`Logged to ${meal} on ${day}.`).filter({ visible: true });
const logUnit = (page: Page, name: string) =>
  page.getByRole("radiogroup", { name: "Amount in" }).getByRole("radio", { name, exact: true });
const logMeal = (page: Page, name: string) =>
  page.getByRole("radiogroup", { name: "Meal" }).getByRole("radio", { name, exact: true });

test("R1 journey: profile, targets, foods and prices, diary with estimated food cost, weight, isolation", async ({ page }) => {
  test.skip(!apiUrl || !serviceKey, "needs E2E_SUPABASE_URL and E2E_SERVICE_ROLE_KEY of a throwaway local stack");
  await stubUsdaFunction(page);

  const userA = unique();
  await signUp(page, userA);
  await completeOnboarding(page);
  const day = (await page.getByLabel(/^Showing \d{4}-\d{2}-\d{2}$/).getAttribute("aria-label"))!.slice("Showing ".length);
  const yesterday = addDays(day, -1);
  await expect(page.getByText("Nothing logged.")).toHaveCount(4);

  // A priced custom food and an unpriced one.
  await createFood(page, "Rolled oats", "Per 100 g", ["389", "16.9", "66.3", "6.9"]);
  await page.getByLabel("Package size (g)").fill("1000");
  await page.getByLabel("Price paid (EUR)").fill("2.49");
  await page.getByRole("button", { name: "Save price" }).click();
  await expect(page.getByText("€0.25 per 100 g")).toBeVisible();
  await createFood(page, "Whole milk", "Per 100 ml", ["64", "3.3", "4.8", "3.6"]);

  // Grams can't be converted for a per-100 ml food without a density: rejected, not guessed.
  await logUnit(page, "g").click();
  await page.getByLabel("Amount (g)").fill("250");
  await expect(page.getByText("This food's nutrition is per 100 ml, but the amount can't be converted to millilitres.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Log food" })).toBeDisabled();

  await logMeal(page, "Snacks").click();
  await logUnit(page, "ml").click();
  await page.getByLabel("Amount (ml)").fill("250");
  await expect(page.getByText("160 kcal · unpriced")).toBeVisible();
  await page.getByRole("button", { name: "Log food" }).click();
  await expect(loggedTo(page, "Snacks", day)).toBeVisible();

  // A USDA food, priced and logged by the slice.
  await openOatBranBread(page);
  await page.getByRole("radio", { name: "servings", exact: true }).click();
  await page.getByRole("radiogroup", { name: "Serving" }).getByRole("radio", { name: "1 slice", exact: true }).click();
  await page.getByLabel("Number of servings in the package").fill("20");
  await page.getByLabel("Price paid (EUR)").fill("3");
  await page.getByRole("button", { name: "Save price" }).click();
  await expect(page.getByText("€0.50 per 100 g")).toBeVisible();
  await logMeal(page, "Breakfast").click();
  await logUnit(page, "1 slice").click();
  await page.getByLabel("Number of servings", { exact: true }).fill("2");
  await expect(page.getByText("142 kcal · €0.30 est.")).toBeVisible();
  await page.getByRole("button", { name: "Log food" }).click();
  await expect(loggedTo(page, "Breakfast", day)).toBeVisible();

  // From Today: "Add to Breakfast" opens the food ready to log into breakfast.
  await page.getByRole("tab", { name: "Today" }).click();
  await page.getByRole("button", { name: "Add to Breakfast" }).click();
  await page.getByRole("link", { name: "Rolled oats" }).click();
  await expect(page.getByRole("heading", { name: "Rolled oats" })).toBeVisible();
  await expect(logMeal(page, "Breakfast")).toBeChecked();
  await page.getByLabel("Amount (g)").fill("80");
  await expect(page.getByText("311 kcal · €0.20 est.")).toBeVisible();
  await page.getByRole("button", { name: "Log food" }).click();
  // Back on the diary.
  await expect(page.getByRole("heading", { name: "Today" })).toBeVisible();
  await expect(page.getByText("80 g · 311 kcal · €0.20 est.")).toBeVisible();

  // Accept the estimated targets (manual override is covered in onboarding-targets.spec.ts).
  const t = expectedTargets(day);
  await page.getByRole("tab", { name: "Targets" }).click();
  await page.getByLabel("Goal weight (kg)").fill("75");
  await page.getByLabel("Change per week (kg)").fill("0.5");
  await expect(page.getByText(/Lose 0\.5 kg\/week/)).toBeVisible();
  await page.getByRole("button", { name: "Use these targets" }).click();
  await expect(page.getByText("Estimated · since", { exact: false })).toBeVisible();

  // Today: entries per meal and day totals; the unpriced item is flagged, not counted as free.
  await page.getByRole("tab", { name: "Today" }).click();
  await expect(page.getByText("2 × 1 slice · 142 kcal · €0.30 est.")).toBeVisible();
  await expect(page.getByText("80 g · 311 kcal · €0.20 est.")).toBeVisible();
  await expect(page.getByText("250 ml · 160 kcal · unpriced")).toBeVisible();
  await expect(page.getByText("613 kcal", { exact: true })).toBeVisible();
  await expect(page.getByText(`of ${t.kcal} kcal target`)).toBeVisible();
  await expect(page.getByText(`Protein 28 g of ${t.protein} g`)).toBeVisible();
  await expect(page.getByText(`Carbs 89 g of ${t.carbs} g`)).toBeVisible();
  await expect(page.getByText(`Fat 17 g of ${t.fat} g`)).toBeVisible();
  await expect(page.getByText("€0.50 est. · 1 item unpriced")).toBeVisible();

  // Changing a price later doesn't rewrite logged costs.
  await page.getByRole("button", { name: "Add to Lunch" }).click();
  await page.getByRole("link", { name: "Rolled oats" }).click();
  await page.getByLabel("Package size (g)").fill("1000");
  await page.getByLabel("Price paid (EUR)").fill("9.99");
  await page.getByRole("button", { name: "Save price" }).click();
  await expect(page.getByText("€1.00 per 100 g")).toBeVisible();
  await page.getByRole("tab", { name: "Today" }).click();
  await expect(page.getByText("80 g · 311 kcal · €0.20 est.")).toBeVisible();

  // Deleting the unpriced entry updates the totals.
  await page.getByRole("button", { name: "Delete Whole milk" }).click();
  await expect(page.getByText("250 ml · 160 kcal · unpriced")).toHaveCount(0);
  await expect(page.getByText("453 kcal", { exact: true })).toBeVisible();
  await expect(page.getByText("€0.50 est.", { exact: true })).toBeVisible();

  // Mark the day complete; other days are separate and stay unmarked.
  await page.getByRole("button", { name: "Mark day complete" }).click();
  await expect(page.getByText(`Marked complete: everything you ate on ${day} is logged.`)).toBeVisible();
  await page.getByRole("button", { name: "Previous day" }).click();
  await expect(page.getByText("Nothing logged.")).toHaveCount(4);
  await expect(page.getByRole("button", { name: "Mark day complete" })).toBeVisible();
  await page.getByRole("button", { name: "Back to today" }).click();
  await expect(page.getByText("453 kcal", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Mark as not complete" })).toBeVisible();

  // Weight: today's quick log replaces the onboarding weigh-in; history logs other dates.
  await page.getByLabel("Today's weight (kg)").fill("79.5");
  await page.getByRole("button", { name: "Log weight" }).click();
  await expect(page.getByText(`Latest: 79.5 kg on ${day}`)).toBeVisible();
  await page.getByRole("tab", { name: "Weight" }).click();
  await expect(page.getByText(`79.5 kg on ${day}`, { exact: true })).toBeVisible();
  await page.getByLabel("Date of weigh-in").fill(addDays(day, 1));
  await page.getByLabel("Weight (kg)", { exact: true }).fill("79");
  await expect(page.getByText("The date can't be in the future.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Save weigh-in" })).toBeDisabled();
  await page.getByLabel("Date of weigh-in").fill(yesterday);
  await page.getByRole("button", { name: "Save weigh-in" }).click();
  await expect(page.getByText(`79 kg on ${yesterday}`, { exact: true })).toBeVisible();
  await expect(page.getByText(`+0.5 kg since ${yesterday}`)).toBeVisible();
  await page.getByRole("button", { name: `Delete weigh-in on ${yesterday}` }).click();
  await expect(page.getByText(`79 kg on ${yesterday}`, { exact: true })).toHaveCount(0);

  // A second user sees none of the first user's data.
  await signOut(page);
  await signUp(page, unique());
  await completeOnboarding(page);
  await expect(page.getByText("Nothing logged.")).toHaveCount(4);
  await expect(page.getByText("0 kcal", { exact: true })).toBeVisible();
  await expect(page.getByText("€0.00 est.", { exact: true })).toBeVisible();
  await expect(page.getByText("No targets yet.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Mark day complete" })).toBeVisible();
  await page.getByRole("tab", { name: "Weight" }).click();
  await expect(page.getByText(`80 kg on ${day}`, { exact: true })).toBeVisible(); // their own onboarding weigh-in
  await expect(page.getByText(`79.5 kg on ${day}`, { exact: true })).toHaveCount(0);
  await page.getByRole("tab", { name: "Foods" }).click();
  await expect(page.getByText("No foods yet.", { exact: false })).toBeVisible();
  await signOut(page);

  // The first user's data is all still there.
  await signIn(page, userA);
  await expect(page.getByText("453 kcal", { exact: true })).toBeVisible();
  await expect(page.getByText("€0.50 est.", { exact: true })).toBeVisible();
  await expect(page.getByText(`of ${t.kcal} kcal target`)).toBeVisible();
  await expect(page.getByRole("button", { name: "Mark as not complete" })).toBeVisible();
  await expect(page.getByText(`Latest: 79.5 kg on ${day}`)).toBeVisible();
});
