import path from "node:path";
import { describe, expect, it } from "vitest";
import { APP_ORIGIN, deepLinkToAppUrl, findDeepLink, isAppUrl, resolveAssetPath } from "./routing";

const root = path.resolve("/srv/web");
const files = new Set([path.join(root, "index.html"), path.join(root, "_expo/static/js/web/entry-abc.js"), path.join(root, "favicon.ico")]);
const exists = (file: string) => files.has(file);

describe("resolveAssetPath", () => {
  it.each([
    ["app://hfn/", path.join(root, "index.html")],
    ["app://hfn/index.html", path.join(root, "index.html")],
    ["app://hfn/_expo/static/js/web/entry-abc.js", path.join(root, "_expo/static/js/web/entry-abc.js")],
    ["app://hfn/favicon.ico?v=1", path.join(root, "favicon.ico")],
    // Client-side routes fall back to the single-page shell.
    ["app://hfn/sign-in", path.join(root, "index.html")],
    ["app://hfn/foods/123e4567-e89b-12d3-a456-426614174000", path.join(root, "index.html")],
    // A missing asset is a 404, never HTML.
    ["app://hfn/_expo/static/js/web/missing.js", null],
    // Traversal stays inside the web root.
    ["app://hfn/../../etc/passwd", path.join(root, "index.html")],
    ["app://hfn/%2e%2e/%2e%2e/secret.txt", null],
    ["app://hfn/a%00.js", null],
    ["app://hfn/%E0%A4%A", null],
    // Other hosts and schemes are never served.
    ["app://other/index.html", null],
    ["https://hfn/index.html", null],
    ["not a url", null],
  ])("%s", (url, expected) => {
    expect(resolveAssetPath(root, url, exists)).toBe(expected);
  });
});

describe("deepLinkToAppUrl", () => {
  it.each([
    ["hfn://auth/callback#access_token=x&type=recovery", `${APP_ORIGIN}/auth/callback#access_token=x&type=recovery`],
    ["hfn:///auth/callback?code=abc", `${APP_ORIGIN}/auth/callback?code=abc`],
    ["hfn://", `${APP_ORIGIN}/`],
    ["hfn://today", `${APP_ORIGIN}/today`],
    ["https://example.com/auth/callback", null],
    ["app://hfn/today", null],
    ["", null],
  ])("%s", (link, expected) => {
    expect(deepLinkToAppUrl(link)).toBe(expected);
  });
});

describe("findDeepLink", () => {
  it("finds the deep link among Windows launch arguments", () => {
    expect(findDeepLink(["C:\\app\\HFN.exe", "--allow-file-access", "hfn://auth/callback#x"])).toBe("hfn://auth/callback#x");
    expect(findDeepLink(["C:\\app\\HFN.exe", "HFN://today"])).toBe("HFN://today");
    expect(findDeepLink(["C:\\app\\HFN.exe"])).toBeNull();
  });
});

describe("isAppUrl", () => {
  it("accepts only the app origin", () => {
    expect(isAppUrl("app://hfn/sign-in")).toBe(true);
    expect(isAppUrl("app://evil/sign-in")).toBe(false);
    expect(isAppUrl("https://hfn.example.com/")).toBe(false);
    expect(isAppUrl("garbage")).toBe(false);
  });
});
