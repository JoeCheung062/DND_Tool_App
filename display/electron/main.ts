import {
  app,
  BrowserWindow,
  Menu,
  ipcMain,
  net,
  protocol,
  screen as electronScreen,
  type Display,
} from "electron";
import { mkdir, writeFile } from "node:fs/promises";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** Dev = Vite URL provided. Packaged / production electron uses local HTML files. */
const isDev = !app.isPackaged && Boolean(process.env.VITE_DEV_SERVER_URL);
const RENDERER_URL = process.env.VITE_DEV_SERVER_URL ?? "http://127.0.0.1:5174";

app.setName("DND Display");

protocol.registerSchemesAsPrivileged([
  {
    scheme: "local-material",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      corsEnabled: true,
      bypassCSP: true,
    },
  },
]);

const materialFiles = new Map<string, string>();
const processTokens = new Map<number, string>();

export type ScreenInfo = {
  id: number;
  label: string;
  bounds: { x: number; y: number; width: number; height: number };
  primary: boolean;
};

type DisplayWindowEntry = {
  screenId: number;
  window: BrowserWindow;
  processId: number;
  webContentsId: number;
  processToken: string;
};

let setupWindow: BrowserWindow | null = null;
const displayWindows = new Map<number, DisplayWindowEntry>();
const clientId = randomUUID();

function rendererDist(...parts: string[]) {
  return path.join(__dirname, "..", "dist", ...parts);
}

function toScreenInfo(d: Display, primaryId: number): ScreenInfo {
  return {
    id: d.id,
    label: d.label || `Display ${d.id}`,
    bounds: {
      x: d.bounds.x,
      y: d.bounds.y,
      width: d.bounds.width,
      height: d.bounds.height,
    },
    primary: d.id === primaryId,
  };
}

function detectScreens(): ScreenInfo[] {
  const primary = electronScreen.getPrimaryDisplay();
  return electronScreen
    .getAllDisplays()
    .map((d) => toScreenInfo(d, primary.id))
    .sort((a, b) => a.id - b.id);
}

function processSnapshot() {
  return [...displayWindows.values()].map((entry) => ({
    screenId: entry.screenId,
    processId: entry.processId,
    webContentsId: entry.webContentsId,
    alive: !entry.window.isDestroyed() && !entry.window.webContents.isDestroyed(),
    processToken: entry.processToken,
  }));
}

function setupPreloadPath() {
  return path.join(__dirname, "preload.cjs");
}

function displayPreloadPath() {
  return path.join(__dirname, "preload-display.cjs");
}

function createSetupWindow() {
  setupWindow = new BrowserWindow({
    width: 1100,
    height: 760,
    minWidth: 880,
    minHeight: 640,
    title: "DND Display",
    show: false,
    backgroundColor: "#0f1419",
    autoHideMenuBar: true,
    webPreferences: {
      preload: setupPreloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  setupWindow.once("ready-to-show", () => {
    setupWindow?.show();
  });

  if (isDev) {
    void setupWindow.loadURL(RENDERER_URL);
  } else {
    void setupWindow.loadFile(rendererDist("index.html"));
  }

  setupWindow.on("closed", () => {
    setupWindow = null;
  });
}

async function loadDisplayPage(win: BrowserWindow, screenId: number) {
  if (isDev) {
    await win.loadURL(`${RENDERER_URL}/display.html?screenId=${screenId}`);
    return;
  }
  await win.loadFile(rendererDist("display.html"), {
    query: { screenId: String(screenId) },
  });
}

async function openDisplayWindows(screenIds?: number[]) {
  const screens = detectScreens();
  const targets =
    screenIds && screenIds.length > 0
      ? screens.filter((s) => screenIds.includes(s.id))
      : screens;

  for (const info of targets) {
    const existing = displayWindows.get(info.id);
    if (existing && !existing.window.isDestroyed()) {
      existing.window.focus();
      continue;
    }

    if (!processTokens.has(info.id)) {
      processTokens.set(info.id, randomUUID());
    }

    const win = new BrowserWindow({
      x: info.bounds.x,
      y: info.bounds.y,
      width: info.bounds.width,
      height: info.bounds.height,
      fullscreen: true,
      frame: false,
      show: false,
      backgroundColor: "#000000",
      title: `DND Display · Screen ${info.id}`,
      webPreferences: {
        preload: displayPreloadPath(),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
        additionalArguments: [
          `--screen-id=${info.id}`,
          `--process-token=${processTokens.get(info.id) ?? ""}`,
        ],
      },
    });

    win.once("ready-to-show", () => {
      win.show();
      win.setFullScreen(true);
    });

    win.on("closed", () => {
      displayWindows.delete(info.id);
      setupWindow?.webContents.send("display:windows-changed", {
        screens: detectScreens(),
        processes: processSnapshot(),
      });
    });

    await loadDisplayPage(win, info.id);

    displayWindows.set(info.id, {
      screenId: info.id,
      window: win,
      processId: win.webContents.getOSProcessId(),
      webContentsId: win.webContents.id,
      processToken: processTokens.get(info.id) ?? "",
    });
  }

  return {
    screens: detectScreens(),
    processes: processSnapshot(),
    clientId,
    mainPid: process.pid,
  };
}

function closeDisplayWindows() {
  for (const entry of displayWindows.values()) {
    if (!entry.window.isDestroyed()) entry.window.close();
  }
  displayWindows.clear();
}

async function assignContent(payload: {
  requestId: string;
  assignments: Array<{
    screenId?: number;
    materialId?: string;
    combinationId?: string;
    materials?: Array<{
      id: string;
      type: string;
      name: string;
      localUrl: string;
    }>;
    content?: unknown;
  }>;
}) {
  const results: Array<{
    screenId: number;
    ok: boolean;
    processId?: number;
    processToken?: string;
    error?: string;
  }> = [];

  for (const assignment of payload.assignments) {
    const screenId = assignment.screenId;
    if (typeof screenId !== "number") {
      for (const entry of displayWindows.values()) {
        results.push(
          await deliverToWindow(entry, payload.requestId, assignment)
        );
      }
      continue;
    }

    const entry = displayWindows.get(screenId);
    if (!entry || entry.window.isDestroyed()) {
      results.push({
        screenId,
        ok: false,
        error: `No live display window for screen ${screenId}`,
      });
      continue;
    }
    results.push(await deliverToWindow(entry, payload.requestId, assignment));
  }

  return {
    requestId: payload.requestId,
    results,
    processes: processSnapshot(),
    mainPid: process.pid,
    clientId,
  };
}

function deliverToWindow(
  entry: DisplayWindowEntry,
  requestId: string,
  assignment: {
    screenId?: number;
    materialId?: string;
    combinationId?: string;
    materials?: Array<{
      id: string;
      type: string;
      name: string;
      localUrl: string;
    }>;
    content?: unknown;
  }
): Promise<{
  screenId: number;
  ok: boolean;
  processId?: number;
  processToken?: string;
  error?: string;
}> {
  return new Promise((resolve) => {
    if (entry.window.isDestroyed() || entry.window.webContents.isDestroyed()) {
      resolve({
        screenId: entry.screenId,
        ok: false,
        processId: entry.processId,
        error: "Display process destroyed",
      });
      return;
    }

    const timeout = setTimeout(() => {
      resolve({
        screenId: entry.screenId,
        ok: false,
        processId: entry.processId,
        error: "Process verification timeout",
      });
    }, 4000);

    const channel = `display:applied:${requestId}:${entry.screenId}`;
    ipcMain.once(
      channel,
      (
        _event,
        response: { ok?: boolean; error?: string; processToken?: string }
      ) => {
        clearTimeout(timeout);
        resolve({
          screenId: entry.screenId,
          ok: response?.ok !== false,
          processId: entry.processId,
          processToken: response?.processToken,
          error: response?.error,
        });
      }
    );

    entry.window.webContents.send("display:show", {
      requestId,
      screenId: entry.screenId,
      materialId: assignment.materialId,
      combinationId: assignment.combinationId,
      materials: assignment.materials,
      content: assignment.content,
      replyChannel: channel,
    });
  });
}

function verifyProcesses() {
  const processes = processSnapshot();
  return {
    ok: processes.length > 0 && processes.every((p) => p.alive),
    mainPid: process.pid,
    clientId,
    processes,
    screens: detectScreens(),
  };
}

function registerIpc() {
  ipcMain.handle("app:get-info", () => ({
    clientId,
    mainPid: process.pid,
    version: app.getVersion(),
    packaged: app.isPackaged,
    platform: process.platform,
  }));

  ipcMain.handle("screens:detect", () => detectScreens());

  ipcMain.handle("display:open-windows", async (_e, screenIds?: number[]) => {
    return openDisplayWindows(screenIds);
  });

  ipcMain.handle("display:close-windows", () => {
    closeDisplayWindows();
    return { ok: true };
  });

  ipcMain.handle("display:process-snapshot", () => ({
    clientId,
    mainPid: process.pid,
    processes: processSnapshot(),
    screens: detectScreens(),
  }));

  ipcMain.handle("display:verify", () => verifyProcesses());

  ipcMain.handle(
    "display:assign",
    async (
      _e,
      payload: {
        requestId: string;
        assignments: Array<{
          screenId?: number;
          materialId?: string;
          combinationId?: string;
          materials?: Array<{
            id: string;
            type: string;
            name: string;
            localUrl: string;
          }>;
          content?: unknown;
        }>;
      }
    ) => assignContent(payload)
  );

  ipcMain.on(
    "display:ack-from-view",
    (
      event,
      payload: {
        replyChannel: string;
        ok: boolean;
        error?: string;
        screenId: number;
      }
    ) => {
      if (payload?.replyChannel) {
        const sender = [...displayWindows.values()].find(
          (entry) => entry.window.webContents.id === event.sender.id
        );
        ipcMain.emit(payload.replyChannel, event, {
          ok: payload.ok,
          error: payload.error,
          screenId: sender?.screenId ?? payload.screenId,
          processToken: sender?.processToken,
        });
      }
    }
  );

  ipcMain.handle(
    "materials:download",
    async (
      _e,
      payload: {
        apiBase: string;
        token: string;
        materials: Array<{
          id: string;
          name: string;
          type: string;
          assetUrl: string;
        }>;
      }
    ) => {
      const dir = path.join(app.getPath("userData"), "campaign-materials");
      await mkdir(dir, { recursive: true });
      const saved: Array<{
        id: string;
        name: string;
        type: string;
        localUrl: string;
        bytes: number;
      }> = [];
      const failed: Array<{ id: string; error: string }> = [];

      for (const material of payload.materials) {
        try {
          const remote = material.assetUrl.startsWith("http")
            ? material.assetUrl
            : `${payload.apiBase.replace(/\/api\/?$/, "")}${
                material.assetUrl.startsWith("/")
                  ? material.assetUrl
                  : `/${material.assetUrl}`
              }`;
          const response = await net.fetch(remote, {
            headers: payload.token
              ? { Authorization: `Bearer ${payload.token}` }
              : {},
          });
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
          }
          const bytes = Buffer.from(await response.arrayBuffer());
          const ext =
            path.extname(new URL(remote, "http://local").pathname) || ".bin";
          const filePath = path.join(dir, `${material.id}${ext}`);
          await writeFile(filePath, bytes);
          materialFiles.set(material.id, filePath);
          saved.push({
            id: material.id,
            name: material.name,
            type: material.type,
            localUrl: `local-material://${material.id}`,
            bytes: bytes.length,
          });
        } catch (err) {
          failed.push({
            id: material.id,
            error: err instanceof Error ? err.message : "download failed",
          });
        }
      }

      return { saved, failed, directory: dir };
    }
  );

  ipcMain.handle("display:paint", (_e, requestId: string) => {
    for (const entry of displayWindows.values()) {
      if (!entry.window.isDestroyed()) {
        entry.window.webContents.send("display:paint", { requestId });
      }
    }
    return { ok: true };
  });
}

function installAppMenu() {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: "DND Display",
      submenu: [
        { role: "about" },
        { type: "separator" },
        { role: "quit" },
      ],
    },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    {
      label: "Window",
      submenu: [{ role: "minimize" }, { role: "close" }],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (setupWindow) {
      if (setupWindow.isMinimized()) setupWindow.restore();
      setupWindow.focus();
    }
  });

  app.whenReady().then(() => {
    protocol.handle("local-material", (request) => {
      const id = new URL(request.url).hostname;
      const filePath = materialFiles.get(id);
      if (!filePath) {
        return new Response("Material not downloaded", { status: 404 });
      }
      return net.fetch(pathToFileURL(filePath).toString());
    });
    registerIpc();
    installAppMenu();
    createSetupWindow();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createSetupWindow();
    });

    if (process.env.DISPLAY_SMOKE === "1") {
      const screens = detectScreens();
      console.log(
        JSON.stringify({
          ok: true,
          smoke: "display-desktop",
          platform: process.platform,
          packaged: app.isPackaged,
          screens: screens.length,
          screenIds: screens.map((s) => s.id),
          mainPid: process.pid,
        })
      );

      const capturePng = async (win: BrowserWindow, shotPath: string) => {
        const img = await win.webContents.capturePage();
        writeFileSync(shotPath, img.toPNG());
        console.log(
          JSON.stringify({
            ok: true,
            screenshot: shotPath,
            bytes: img.toPNG().length,
          })
        );
      };

      void (async () => {
        try {
          const shotPath = process.env.DISPLAY_SMOKE_SHOT;
          if (shotPath && setupWindow && !setupWindow.isDestroyed()) {
            if (setupWindow.webContents.isLoading()) {
              await new Promise<void>((resolve) => {
                setupWindow?.webContents.once("did-finish-load", () => resolve());
              });
            }
            await new Promise((resolve) => setTimeout(resolve, 500));
            await capturePng(setupWindow, shotPath);
          }

          const canvasShot = process.env.DISPLAY_SMOKE_CANVAS;
          if (canvasShot) {
            const iconPath = path.join(__dirname, "..", "build", "icon.png");
            materialFiles.set("smoke-map", iconPath);
            materialFiles.set("smoke-fx", iconPath);
            const opened = await openDisplayWindows();
            const screenId = opened.screens[0]?.id;
            const entry =
              typeof screenId === "number" ? displayWindows.get(screenId) : undefined;
            if (!entry) throw new Error("smoke canvas: no display window");
            const requestId = "smoke-canvas";
            const channel = `display:applied:${requestId}:${entry.screenId}`;
            await new Promise<void>((resolve, reject) => {
              const timer = setTimeout(
                () => reject(new Error("smoke canvas ack timeout")),
                4000
              );
              ipcMain.once(channel, () => {
                clearTimeout(timer);
                resolve();
              });
              entry.window.webContents.send("display:show", {
                requestId,
                screenId: entry.screenId,
                materials: [
                  {
                    id: "smoke-map",
                    type: "IMAGE",
                    name: "Campaign Map",
                    localUrl: "local-material://smoke-map",
                  },
                  {
                    id: "smoke-fx",
                    type: "EFFECT",
                    name: "Smoke Overlay",
                    localUrl: "local-material://smoke-fx",
                  },
                ],
                replyChannel: channel,
              });
            });
            entry.window.webContents.send("display:paint", { requestId });
            await new Promise((resolve) => setTimeout(resolve, 800));
            await capturePng(entry.window, canvasShot);
          }
        } catch (err) {
          console.error("display smoke failed", err);
        } finally {
          setTimeout(() => app.quit(), 400);
        }
      })();
    }
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });

  app.on("before-quit", () => {
    closeDisplayWindows();
  });
}
