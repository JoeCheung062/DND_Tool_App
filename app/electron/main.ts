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
import {
  discoverControlSource,
  downloadControlMaterials,
  startControlPublisher,
  type ControlPublisher,
} from "./materialPeer.js";
import { discoverApiServer } from "./serverDiscovery.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** Dev = Vite URL provided. Packaged / production electron uses local HTML files. */
const isDev = !app.isPackaged && Boolean(process.env.VITE_DEV_SERVER_URL);
const RENDERER_URL = process.env.VITE_DEV_SERVER_URL ?? "http://127.0.0.1:5174";

app.setName("DND App");
app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");

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

const materialFiles = new Map<
  string,
  { filePath: string; name: string; type: string }
>();
let controlPublisher: ControlPublisher | null = null;
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
let latestInitiative: {
  entries: Array<{ id: string; name: string; speed: number; visible: boolean }>;
  turnId: string | null;
  barVisible: boolean;
} | null = null;
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
    title: "DND App",
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
    setupWindow?.maximize();
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
      title: `DND App · Screen ${info.id}`,
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
    if (latestInitiative) win.webContents.send("display:initiative", latestInitiative);

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
    once?: boolean;
    map?: { columns: number; rows: number; focusCol: number; focusRow: number; zoom?: number };
    materials?: Array<{
      id: string;
      type: string;
      name: string;
      localUrl: string;
      x?: number;
      y?: number;
      scale?: number;
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
    once?: boolean;
    map?: { columns: number; rows: number; focusCol: number; focusRow: number; zoom?: number };
    materials?: Array<{
      id: string;
      type: string;
      name: string;
      localUrl: string;
      x?: number;
      y?: number;
      scale?: number;
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
      once: assignment.once,
      map: assignment.map,
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
          once?: boolean;
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
          characterArtUrl?: string | null;
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
        characterArtLocalUrl?: string;
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
          materialFiles.set(material.id, {
            filePath,
            name: material.name,
            type: material.type,
          });
          let characterArtLocalUrl: string | undefined;
          if (material.characterArtUrl) {
            const artRemote = material.characterArtUrl.startsWith("http")
              ? material.characterArtUrl
              : `${payload.apiBase.replace(/\/api\/?$/, "")}${
                  material.characterArtUrl.startsWith("/")
                    ? material.characterArtUrl
                    : `/${material.characterArtUrl}`
                }`;
            const artResponse = await net.fetch(artRemote, {
              headers: payload.token ? { Authorization: `Bearer ${payload.token}` } : {},
            });
            if (artResponse.ok) {
              const artBytes = Buffer.from(await artResponse.arrayBuffer());
              const artExt = path.extname(new URL(artRemote, "http://local").pathname) || ".png";
              const artId = `${material.id}--art`;
              const artPath = path.join(dir, `${artId}${artExt}`);
              await writeFile(artPath, artBytes);
              materialFiles.set(artId, {
                filePath: artPath,
                name: `${material.name} character art`,
                type: "IMAGE",
              });
              characterArtLocalUrl = `local-material://${material.id}/art`;
            }
          }
          saved.push({
            id: material.id,
            name: material.name,
            type: material.type,
            localUrl: `local-material://${material.id}`,
            ...(characterArtLocalUrl ? { characterArtLocalUrl } : {}),
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

  ipcMain.handle(
    "materials:publish",
    async (
      _e,
      payload: {
        roomId: string;
        materials: Array<{ id: string; name: string; type: string }>;
      }
    ) => {
      await controlPublisher?.close();
      controlPublisher = null;
      const materials = payload.materials.flatMap((material) => {
        const stored = materialFiles.get(material.id);
        if (!stored) return [];
        const art = materialFiles.get(`${material.id}--art`);
        return [
          {
            id: material.id,
            name: material.name || stored.name,
            type: material.type || stored.type,
            filePath: stored.filePath,
          },
          ...(art
            ? [
                {
                  id: `${material.id}--art`,
                  name: `${material.name || stored.name} character art`,
                  type: "IMAGE",
                  filePath: art.filePath,
                },
              ]
            : []),
        ];
      });
      controlPublisher = await startControlPublisher({
        roomId: payload.roomId,
        materials,
      });
      return {
        token: controlPublisher.token,
        port: controlPublisher.port,
        hosts: controlPublisher.hosts,
        materials: materials.map(({ id, name, type }) => ({ id, name, type })),
      };
    }
  );

  ipcMain.handle("materials:stop-sharing", async () => {
    await controlPublisher?.close();
    controlPublisher = null;
    return { ok: true };
  });

  ipcMain.handle("server:discover", async () => discoverApiServer());

  ipcMain.handle(
    "materials:discover-control",
    async (_e, payload: { roomId: string }) => {
      return discoverControlSource(payload.roomId);
    }
  );

  ipcMain.handle(
    "materials:download-control",
    async (
      _e,
      payload: {
        token: string;
        baseUrl?: string;
        hosts?: string[];
        port?: number;
      }
    ) => {
      const dir = path.join(app.getPath("userData"), "campaign-materials");
      const pack = await downloadControlMaterials({ ...payload, directory: dir });
      for (const item of pack.saved) {
        materialFiles.set(item.id, {
          filePath: item.filePath,
          name: item.name,
          type: item.type,
        });
      }
      const saved = pack.saved.flatMap(({ filePath: _filePath, ...item }) => {
        if (item.id.endsWith("--art")) return [];
        const artId = `${item.id}--art`;
        const art = pack.saved.find((entry) => entry.id === artId);
        return [
          art
            ? { ...item, characterArtLocalUrl: `local-material://${item.id}/art` }
            : item,
        ];
      });
      return {
        saved,
        failed: pack.failed,
        directory: pack.directory,
      };
    }
  );

  ipcMain.handle(
    "display:map-frame",
    (
      _event,
      payload: {
        screenId: number;
        map: { columns: number; rows: number; focusCol: number; focusRow: number; zoom?: number };
      }
    ) => {
      const entry = displayWindows.get(payload.screenId);
      if (!entry || entry.window.isDestroyed()) return { ok: false };
      entry.window.webContents.send("display:map-frame", payload.map);
      return { ok: true };
    }
  );

  ipcMain.handle(
    "display:map-measure",
    (
      _event,
      payload: {
        screenId: number;
        measure: {
          mode: "line" | "circle" | "square";
          startCol: number;
          startRow: number;
          endCol: number;
          endRow: number;
        } | null;
      }
    ) => {
      const entry = displayWindows.get(payload.screenId);
      if (!entry || entry.window.isDestroyed()) return { ok: false };
      entry.window.webContents.send("display:map-measure", payload.measure);
      return { ok: true };
    }
  );

  ipcMain.handle(
    "display:initiative",
    (
      _e,
      board: {
        entries: Array<{ id: string; name: string; speed: number; visible: boolean }>;
        turnId: string | null;
        barVisible: boolean;
      }
    ) => {
      latestInitiative = board;
      for (const entry of displayWindows.values()) {
        if (!entry.window.isDestroyed()) entry.window.webContents.send("display:initiative", board);
      }
      return { ok: true };
    }
  );

  ipcMain.on("display:initiative-sync", (event) => {
    if (latestInitiative) event.sender.send("display:initiative", latestInitiative);
  });

  ipcMain.handle(
    "display:sound",
    (
      _e,
      payload: {
        screenIds: number[];
        channel: "bgm" | "effect";
        action: "play" | "pause" | "stop" | "seek" | "volume";
        volume: number;
        gain?: number;
        position?: number;
        material?: { id: string; name: string; localUrl: string };
      }
    ) => {
      const ids = new Set(payload.screenIds);
      for (const entry of displayWindows.values()) {
        if (!ids.has(entry.screenId) || entry.window.isDestroyed()) continue;
        entry.window.webContents.send("display:sound", payload);
      }
      return { ok: true };
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
      label: "DND App",
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

// A second process is allowed so Display Mode and Control Mode can run together.
app.whenReady().then(() => {
    protocol.handle("local-material", (request) => {
      const url = new URL(request.url);
      const id = url.pathname === "/art" ? `${url.hostname}--art` : url.hostname;
      const stored = materialFiles.get(id);
      const filePath = stored?.filePath;
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
            materialFiles.set("smoke-map", {
              filePath: iconPath,
              name: "smoke-map",
              type: "IMAGE",
            });
            materialFiles.set("smoke-fx", {
              filePath: iconPath,
              name: "smoke-fx",
              type: "EFFECT",
            });
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
    void controlPublisher?.close();
  });
