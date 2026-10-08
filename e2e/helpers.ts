import { expect, type Page } from "@playwright/test";

// Shared steps for the end-to-end journeys.

export const password = "correct-horse-battery";
export const unique = () => `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;

export async function signUp(page: Page, email: string) {
  await page.goto("/");
  await page.getByRole("radio", { name: "Create account" }).click();
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText("About you")).toBeVisible();
}

export async function signIn(page: Page, email: string) {
  await page.goto("/");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

export async function completeOnboarding(page: Page) {
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

export async function signOut(page: Page) {
  await page.getByRole("tab", { name: "Settings" }).click();
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
}

