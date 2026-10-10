import { defineConfig } from "@playwright/test";

/**
 * Smoke tests that launch the Electron shell. By default they start `electron .` over
 * apps/mobile/dist; set HFN_DESKTOP_EXECUTABLE to test a packaged build instead
 * (CI uses release/win-unpacked/HFN.exe). Needs a display: use xvfb-run on Linux.
 */
export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
});
