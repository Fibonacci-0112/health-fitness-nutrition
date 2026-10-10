import { _electron as electron, expect, test, type ElectronApplication } from "@playwright/test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { APP_ORIGIN } from "../src/routing";

// Windows spike smoke tests: the shell serves the Expo web export at app://hfn, client-side
// routes survive a reload, and (with a Supabase stack) auth works from the app:// origin and
// the session survives an app restart.

const executablePath = process.env.HFN_DESKTOP_EXECUTABLE;
let userDataDir: string;

const appDir = path.resolve(__dirname, "..");
const env = () => ({ ...process.env, HFN_USER_DATA_DIR: userDataDir }) as Record<string, string>;

// Ubuntu 24.04 runners block the unprivileged user namespaces Chromium's sandbox needs, and root
// containers refuse to start with it, so the smoke tests run Electron unsandboxed on Linux.
const sandbox = process.platform === "linux" ? ["--no-sandbox"] : [];

function launch(): Promise<ElectronApplication> {
  return executablePath
    ? electron.launch({ executablePath, args: sandbox, env: env() })
    : electron.launch({ args: [...sandbox, appDir], env: env() });
}

/** Starts a second instance with a deep link, the way Windows does when an hfn: link is opened. */
function openDeepLink(link: string) {
  const electronBinary = createRequire(__filename)("electron") as unknown as string;
  const [command, args] = executablePath ? [executablePath, [...sandbox, link]] : [electronBinary, [...sandbox, appDir, link]];
  const result = spawnSync(command, args, { env: env(), timeout: 30_000 });
  expect(result.status, result.stderr?.toString()).toBe(0);
}

test.beforeEach(() => {
  userDataDir = mkdtempSync(path.join(os.tmpdir(), "hfn-desktop-"));
});

test.afterEach(() => {
  rmSync(userDataDir, { recursive: true, force: true });
});

test("serves the web export at app://hfn and handles client-side routes", async () => {
  const app = await launch();
  const window = await app.firstWindow();
  await expect(window.getByRole("button", { name: "Sign in" })).toBeVisible();
  expect(window.url().startsWith(`${APP_ORIGIN}/`)).toBe(true);

  // A route with no file behind it falls back to index.html, and Expo Router renders it.
  await window.goto(`${APP_ORIGIN}/sign-in`);
  await expect(window.getByRole("button", { name: "Sign in" })).toBeVisible();

  // A missing asset is a 404, not the HTML shell.
  const status = await window.evaluate(async () => (await fetch("/_expo/missing.js")).status);
  expect(status).toBe(404);
  await app.close();
});

test("routes a deep link from a second instance into the running window", async () => {
  const app = await launch();
  const window = await app.firstWindow();
  await expect(window.getByRole("button", { name: "Sign in" })).toBeVisible();

  openDeepLink("hfn://sign-in?from=deep-link#state=1");
  await expect.poll(() => window.url()).toBe(`${APP_ORIGIN}/sign-in?from=deep-link#state=1`);
  await expect(window.getByRole("button", { name: "Sign in" })).toBeVisible();
  expect(app.windows()).toHaveLength(1);
  await app.close();
});

test("signs up from the app:// origin and keeps the session after a restart", async () => {
  test.skip(!process.env.DESKTOP_E2E_AUTH, "Needs a local Supabase stack baked into the web export.");
  const email = `desktop-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;

  let app = await launch();
  let window = await app.firstWindow();
  await window.getByRole("radio", { name: "Create account" }).click();
  await window.getByLabel("Email").fill(email);
  await window.getByLabel("Password").fill("correct-horse-battery");
  await window.getByRole("button", { name: "Create account" }).click();
  await expect(window.getByText("About you")).toBeVisible();
  await app.close();

  // Same profile, new process: the persisted session skips the sign-in screen.
  app = await launch();
  window = await app.firstWindow();
  await expect(window.getByText("About you")).toBeVisible();
  await expect(window.getByRole("button", { name: "Sign in" })).toHaveCount(0);
  await app.close();
});
