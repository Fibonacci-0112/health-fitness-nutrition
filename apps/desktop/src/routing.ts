import path from "node:path";

// Pure URL helpers for the Electron shell, kept free of Electron imports so Vitest can test them.

/** Privileged scheme that serves the Expo web export. The page origin is `app://hfn`. */
export const APP_SCHEME = "app";
export const APP_HOST = "hfn";
export const APP_ORIGIN = `${APP_SCHEME}://${APP_HOST}`;

/** Deep-link scheme, shared with the native apps (`scheme` in apps/mobile/app.json). */
export const DEEP_LINK_SCHEME = "hfn";

export function isAppUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === `${APP_SCHEME}:` && parsed.host === APP_HOST;
  } catch {
    return false;
  }
}

/**
 * Maps an `app://hfn/...` request to a file inside `webRoot`.
 *
 * - A path with a file extension is served as that file, or `null` (404) when it doesn't exist,
 *   so a missing script never comes back as HTML.
 * - Any other path is a client-side route (the export uses `web.output: "single"`), so it gets
 *   `index.html` and Expo Router renders the route.
 * - Anything outside `webRoot` or on another host is `null`.
 */
export function resolveAssetPath(
  webRoot: string,
  requestUrl: string,
  fileExists: (file: string) => boolean,
): string | null {
  let parsed: URL;
  try {
    parsed = new URL(requestUrl);
  } catch {
    return null;
  }
  if (parsed.protocol !== `${APP_SCHEME}:` || parsed.host !== APP_HOST) return null;

  let pathname: string;
  try {
    pathname = decodeURIComponent(parsed.pathname);
  } catch {
    return null;
  }
  if (pathname.includes("\0")) return null;

  const root = path.resolve(webRoot);
  const file = path.resolve(root, `.${path.posix.normalize(`/${pathname}`)}`);
  const relative = path.relative(root, file);
  if (relative.startsWith("..") || path.isAbsolute(relative)) return null;

  if (path.extname(file) !== "") return fileExists(file) ? file : null;
  return path.join(root, "index.html");
}

/**
 * Turns an OS deep link (`hfn://auth/callback#access_token=...`) into the in-app URL
 * (`app://hfn/auth/callback#access_token=...`). Returns `null` for any other scheme.
 */
export function deepLinkToAppUrl(link: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(link);
  } catch {
    return null;
  }
  if (parsed.protocol !== `${DEEP_LINK_SCHEME}:`) return null;
  // `hfn://auth/callback` parses with host "auth"; `hfn:///auth/callback` has an empty host.
  const route = `/${[parsed.host, parsed.pathname.replace(/^\/+/, "")].filter(Boolean).join("/")}`;
  return `${APP_ORIGIN}${route}${parsed.search}${parsed.hash}`;
}

/** On Windows a deep link arrives as a command-line argument of the launched (or second) instance. */
export function findDeepLink(argv: readonly string[]): string | null {
  return argv.find((arg) => arg.toLowerCase().startsWith(`${DEEP_LINK_SCHEME}:`)) ?? null;
}
