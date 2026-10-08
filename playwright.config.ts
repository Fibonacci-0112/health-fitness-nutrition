import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.E2E_PORT ?? 8099);

/**
 * End-to-end tests drive the exported web build (apps/mobile/dist) against the
 * Supabase instance it was built for. In CI that is a throwaway local stack
 * (`supabase start`); never point these tests at a production project.
 */
export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  retries: 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://localhost:${port}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npx serve -s apps/mobile/dist -l ${port}`,
    url: `http://localhost:${port}`,
    reuseExistingServer: !process.env.CI,
  },
});
