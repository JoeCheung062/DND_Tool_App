import { readFile } from "node:fs/promises";
import path from "node:path";
import { app, BrowserWindow, ipcMain } from "electron";
import pg from "pg";
import { applyCatalog, copyCatalogFiles, SERVER_DATABASE_URL } from "../catalog.mjs";

const preloadPath = path.join(__dirname, "preload.cjs");

type Catalog = {
  rooms: unknown[];
  campaigns: unknown[];
  tags: unknown[];
  materials: Array<{ file?: string | null; name: string }>;
  combinations: unknown[];
  missingFiles?: string[];
};

type ImportResult = {
  ok: boolean;
  message: string;
  detail?: string;
};

let mainWindow: BrowserWindow | null = null;

function snapshotDir() {
  const packaged = path.join(process.resourcesPath, "snapshot");
  const dev = path.join(app.getAppPath(), "snapshot");
  return app.isPackaged ? packaged : dev;
}

function serverUploadDir() {
  return path.join(app.getPath("appData"), "DND Server", "uploads");
}

async function readCatalog() {
  const file = path.join(snapshotDir(), "manifest.json");
  return JSON.parse(await readFile(file, "utf8")) as Catalog;
}

async function serverReady() {
  try {
    const response = await fetch("http://127.0.0.1:3000/api/health");
    if (!response.ok) return false;
    const body = (await response.json()) as { data?: { service?: string } };
    return body.data?.service === "dnd-app-server";
  } catch {
    return false;
  }
}

function summary(catalog: Catalog) {
  return [
    `${catalog.rooms.length} rooms`,
    `${catalog.campaigns.length} campaigns`,
    `${catalog.tags.length} tags`,
    `${catalog.materials.length} materials`,
    `${catalog.combinations.length} combinations`,
  ].join(", ");
}

async function inspect(): Promise<ImportResult> {
  try {
    const catalog = await readCatalog();
    const ready = await serverReady();
    const missing = catalog.missingFiles?.length
      ? ` ${catalog.missingFiles.length} material file was not in the pack and will be skipped.`
      : "";
    return {
      ok: ready,
      message: ready
        ? `Ready to import ${summary(catalog)} into the DND Server on this computer.${missing}`
        : "Open DND Server on this computer and leave it running, then click Import.",
      detail: summary(catalog),
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "The content snapshot is missing from this install.",
    };
  }
}

async function importContent(): Promise<ImportResult> {
  if (!(await serverReady())) {
    return {
      ok: false,
      message: "DND Server is not running. Open it on this computer and leave it running, then try again.",
    };
  }
  const catalog = await readCatalog();
  const uploadDir = serverUploadDir();
  const files = await copyCatalogFiles(catalog, path.join(snapshotDir(), "files"), uploadDir);
  const client = new pg.Client({ connectionString: SERVER_DATABASE_URL });
  await client.connect();
  try {
    const counts = await applyCatalog(client, catalog);
    const skipped = files.missing.length > 0 ? ` Skipped missing files: ${files.missing.join(", ")}.` : "";
    return {
      ok: true,
      message: `Imported ${counts.rooms} rooms, ${counts.campaigns} campaigns, ${counts.tags} tags, ${counts.materials} materials, and ${counts.combinations} combinations. ${files.copied.length} files are in the DND Server uploads folder.${skipped}`,
    };
  } finally {
    await client.end();
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 680,
    height: 520,
    title: "DND Content",
    backgroundColor: "#0b1016",
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  void mainWindow.loadFile(path.join(app.getAppPath(), "electron", "status.html"));
}

app.whenReady().then(() => {
  ipcMain.handle("content:inspect", () => inspect());
  ipcMain.handle("content:import", () => importContent());
  createWindow();
});

app.on("window-all-closed", () => {
  app.quit();
});
