import {
  app,
  BrowserWindow,
  ipcMain,
  screen as electronScreen,
  type Display,
} from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isDev = !app.isPackaged;
const RENDERER_URL = process.env.VITE_DEV_SERVER_URL ?? "http://localhost:5174";

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
};

let setupWindow: BrowserWindow | null = null;
const displayWindows = new Map<number, DisplayWindowEntry>();
const clientId = randomUUID();

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
    width: 960,
    height: 720,
    minWidth: 800,
    minHeight: 600,
    title: "DND Display",
    backgroundColor: "#0f1419",
    webPreferences: {
      preload: setupPreloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  if (isDev) {
    void setupWindow.loadURL(RENDERER_URL);
  } else {
    void setupWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  }

  setupWindow.on("closed", () => {
    setupWindow = null;
  });
}

function displayPageUrl(screenId: number) {
  if (isDev) {
    return `${RENDERER_URL}/display.html?screenId=${screenId}`;
  }
  return `file://${path.join(__dirname, "../dist/display.html")}?screenId=${screenId}`;
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

    const win = new BrowserWindow({
      x: info.bounds.x,
      y: info.bounds.y,
      width: info.bounds.width,
      height: info.bounds.height,
      fullscreen: true,
      frame: false,
      show: false,
      backgroundColor: "#000000",
      title: `Display ${info.id}`,
      webPreferences: {
        preload: displayPreloadPath(),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
        additionalArguments: [`--screen-id=${info.id}`],
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

    await win.loadURL(displayPageUrl(info.id));

    const entry: DisplayWindowEntry = {
      screenId: info.id,
      window: win,
      processId: win.webContents.getOSProcessId(),
      webContentsId: win.webContents.id,
    };
    displayWindows.set(info.id, entry);
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

/**
 * Route content to specific screen windows and verify each process responds.
 */
async function assignContent(payload: {
  requestId: string;
  assignments: Array<{
    screenId?: number;
    materialId?: string;
    combinationId?: string;
    content?: unknown;
  }>;
}) {
  const results: Array<{
    screenId: number;
    ok: boolean;
    processId?: number;
    error?: string;
  }> = [];

  for (const assignment of payload.assignments) {
    const screenId = assignment.screenId;
    if (typeof screenId !== "number") {
      // Broadcast to all open display windows when screenId omitted
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
    content?: unknown;
  }
): Promise<{
  screenId: number;
  ok: boolean;
  processId?: number;
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
    ipcMain.once(channel, (_event, response: { ok?: boolean; error?: string }) => {
      clearTimeout(timeout);
      resolve({
        screenId: entry.screenId,
        ok: response?.ok !== false,
        processId: entry.processId,
        error: response?.error,
      });
    });

    entry.window.webContents.send("display:show", {
      requestId,
      screenId: entry.screenId,
      materialId: assignment.materialId,
      combinationId: assignment.combinationId,
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
        ipcMain.emit(payload.replyChannel, event, {
          ok: payload.ok,
          error: payload.error,
          screenId: payload.screenId,
        });
      }
    }
  );
}

app.whenReady().then(() => {
  registerIpc();
  createSetupWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createSetupWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  closeDisplayWindows();
});
