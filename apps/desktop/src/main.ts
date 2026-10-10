import { app, BrowserWindow, net, protocol, shell } from "electron";
import { existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { APP_ORIGIN, APP_SCHEME, DEEP_LINK_SCHEME, deepLinkToAppUrl, findDeepLink, isAppUrl, resolveAssetPath } from "./routing";

// Electron shell over the Expo web export. The page runs at app://hfn (a standard, secure
// scheme) so localStorage, fetch and Expo Router's absolute paths behave as on the web build.

// Packaged: the export is copied into resources/web (see electron-builder.yml). Development:
// read apps/mobile/dist directly, so run `npm run export:web -w @hfn/mobile` first.
const webRoot = app.isPackaged ? path.join(process.resourcesPath, "web") : path.resolve(__dirname, "../../mobile/dist");

// Lets the smoke tests run against a throwaway profile (session, localStorage, query cache).
if (process.env.HFN_USER_DATA_DIR) app.setPath("userData", process.env.HFN_USER_DATA_DIR);

protocol.registerSchemesAsPrivileged([
  { scheme: APP_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } },
]);

let mainWindow: BrowserWindow | null = null;

function openExternal(url: string) {
  // Only hand web links to the browser; never launch arbitrary protocols from page content.
  if (url.startsWith("https://")) void shell.openExternal(url);
}

function openDeepLink(link: string | null) {
  const target = link ? deepLinkToAppUrl(link) : null;
  if (!target || !mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.focus();
  void mainWindow.loadURL(target);
}

function createWindow(initialUrl: string) {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 800,
    title: "Health Fitness Nutrition",
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false },
  });
  mainWindow.removeMenu();
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    openExternal(url);
    return { action: "deny" };
  });
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (isAppUrl(url)) return;
    event.preventDefault();
    openExternal(url);
  });
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
  void mainWindow.loadURL(initialUrl);
}

// One instance owns the window; a deep link opened while running arrives via "second-instance".
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  // Inside the Store (AppX) package the hfn: protocol is declared in the manifest instead.
  if (process.platform === "win32" && !process.windowsStore) {
    if (process.defaultApp) {
      app.setAsDefaultProtocolClient(DEEP_LINK_SCHEME, process.execPath, [path.resolve(process.argv[1] ?? ".")]);
    } else {
      app.setAsDefaultProtocolClient(DEEP_LINK_SCHEME);
    }
  }

  app.on("second-instance", (_event, argv) => openDeepLink(findDeepLink(argv)));
  app.on("open-url", (event, url) => {
    event.preventDefault();
    openDeepLink(url);
  });

  void app.whenReady().then(() => {
    protocol.handle(APP_SCHEME, (request) => {
      const file = resolveAssetPath(webRoot, request.url, existsSync);
      if (!file) return new Response("Not found", { status: 404 });
      return net.fetch(pathToFileURL(file).toString());
    });

    const launchLink = findDeepLink(process.argv);
    createWindow((launchLink && deepLinkToAppUrl(launchLink)) || `${APP_ORIGIN}/`);
  });

  app.on("window-all-closed", () => app.quit());
}
