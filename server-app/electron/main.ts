import { spawn, type ChildProcess } from "node:child_process";
import { createConnection } from "node:net";
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { networkInterfaces } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { app, BrowserWindow, shell } from "electron";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = 3000;

let mainWindow: BrowserWindow | null = null;
let serverProcess: ChildProcess | null = null;
let quitting = false;
const logLines: string[] = [];

type Status = {
  state: "starting" | "ready" | "error";
  message: string;
  urls?: string[];
  log?: string;
};

function bundleRoot() {
  const packaged = path.join(process.resourcesPath, "bundle");
  if (existsSync(path.join(packaged, "dist", "index.js"))) return packaged;
  return path.join(app.getAppPath(), "bundle");
}

function lanHosts() {
  const hosts = ["127.0.0.1"];
  for (const entries of Object.values(networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (entry.family === "IPv4" && !entry.internal) hosts.push(entry.address);
    }
  }
  return hosts;
}

function publish(status: Status) {
  const payload = { ...status, log: logLines.slice(-12).join("\n") };
  mainWindow?.webContents.send("server:status", payload);
}

function note(line: string) {
  const text = line.trim();
  if (!text) return;
  logLines.push(text);
  if (logLines.length > 40) logLines.shift();
}

function findDocker() {
  const candidates =
    process.platform === "win32"
      ? [
          "C:\\Program Files\\Docker\\Docker\\resources\\bin\\docker.exe",
          "C:\\Program Files\\Docker\\Docker\\resources\\docker.exe",
        ]
      : [
          "/usr/local/bin/docker",
          "/opt/homebrew/bin/docker",
          "/Applications/Docker.app/Contents/Resources/bin/docker",
        ];
  return candidates.find((candidate) => existsSync(candidate)) ?? "docker";
}

function run(
  command: string,
  args: string[],
  cwd: string,
  extraEnv: Record<string, string> = {}
) {
  return new Promise<{ code: number; output: string }>((resolve) => {
    const child = spawn(command, args, {
      cwd,
      env: { ...process.env, ...extraEnv },
    });
    let output = "";
    child.stdout?.on("data", (chunk: Buffer) => {
      output += chunk.toString();
      note(chunk.toString());
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      output += chunk.toString();
      note(chunk.toString());
    });
    child.on("error", (err) => {
      output += err.message;
      note(err.message);
      resolve({ code: 1, output });
    });
    child.on("exit", (code) => resolve({ code: code ?? 1, output }));
  });
}

function portOpen(port: number, host = "127.0.0.1") {
  return new Promise<boolean>((resolve) => {
    const socket = createConnection({ port, host });
    const done = (open: boolean) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(open);
    };
    socket.setTimeout(400);
    socket.once("connect", () => done(true));
    socket.once("timeout", () => done(false));
    socket.once("error", () => done(false));
  });
}

async function waitForPort(port: number, attempts = 40) {
  for (let i = 0; i < attempts; i += 1) {
    if (await portOpen(port)) return true;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return false;
}

async function health() {
  try {
    const response = await fetch(`http://127.0.0.1:${PORT}/api/health`);
    if (!response.ok) return false;
    const body = (await response.json()) as { data?: { service?: string } };
    return body.data?.service === "dnd-app-server";
  } catch {
    return false;
  }
}

async function readSecret(file: string) {
  try {
    const existing = (await readFile(file, "utf8")).trim();
    if (existing.length >= 16) return existing;
  } catch {
    // First launch writes a new secret.
  }
  const secret = randomBytes(32).toString("hex");
  await writeFile(file, secret, "utf8");
  return secret;
}

function readyMessage() {
  const urls = lanHosts().map((host) => `http://${host}:${PORT}/`);
  publish({
    state: "ready",
    message:
      "DND Server is running. DND App on this network connects to this computer automatically. The CMS is served at the addresses below.",
    urls,
  });
}

async function boot() {
  const root = bundleRoot();
  const entry = path.join(root, "dist", "index.js");
  if (!existsSync(entry)) {
    publish({
      state: "error",
      message: "The server files are missing from this install. Rebuild the DND Server package.",
    });
    return;
  }

  publish({ state: "starting", message: "Checking the API and database…" });
  if (await health()) {
    readyMessage();
    return;
  }

  const dataDir = app.getPath("userData");
  const uploadDir = path.join(dataDir, "uploads");
  await mkdir(uploadDir, { recursive: true });
  const databaseUrl = "postgresql://postgres:postgres@127.0.0.1:5432/dnd_app?schema=public";

  if (!(await portOpen(5432))) {
    publish({ state: "starting", message: "Starting PostgreSQL with Docker…" });
    const docker = findDocker();
    const compose = await run(
      docker,
      ["compose", "--project-directory", dataDir, "-f", path.join(root, "docker-compose.yml"), "up", "-d"],
      dataDir
    );
    if (compose.code !== 0 || !(await waitForPort(5432))) {
      publish({
        state: "error",
        message:
          "PostgreSQL did not start. Install Docker Desktop, start it, then open DND Server again.",
      });
      return;
    }
  } else {
    note("PostgreSQL is already accepting connections on port 5432.");
  }

  publish({ state: "starting", message: "Applying database migrations…" });
  const prismaCli = path.join(root, "node_modules", "prisma", "build", "index.js");
  const migrated = await run(
    process.execPath,
    [prismaCli, "migrate", "deploy"],
    root,
    {
      ELECTRON_RUN_AS_NODE: "1",
      DATABASE_URL: databaseUrl,
      NODE_ENV: "production",
    }
  );
  if (migrated.code !== 0) {
    publish({
      state: "error",
      message: "Database migration failed. The log below has the Prisma error.",
    });
    return;
  }

  if (await health()) {
    readyMessage();
    return;
  }

  publish({ state: "starting", message: "Starting the API and CMS…" });
  const secret = await readSecret(path.join(dataDir, "jwt-secret"));
  serverProcess = spawn(process.execPath, [entry], {
    cwd: root,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      NODE_ENV: "production",
      PORT: String(PORT),
      DATABASE_URL: databaseUrl,
      JWT_SECRET: secret,
      JWT_EXPIRES_IN: "7d",
      CLIENT_ORIGIN: "*",
      UPLOAD_DIR: uploadDir,
      MAX_FILE_SIZE_MB: "100",
      S3_ENABLED: "false",
      CMS_DIR: path.join(root, "cms"),
      ENSURE_ACCOUNTS: "1",
    },
  });
  serverProcess.stdout?.on("data", (chunk: Buffer) => note(chunk.toString()));
  serverProcess.stderr?.on("data", (chunk: Buffer) => note(chunk.toString()));
  serverProcess.on("exit", (code) => {
    serverProcess = null;
    if (quitting) return;
    publish({
      state: "error",
      message: `The API stopped (exit ${code ?? "unknown"}).`,
    });
  });

  const up = await waitForPort(PORT, 30);
  if (!up || !(await health())) {
    publish({
      state: "error",
      message: "The API did not become ready. The log below has the server error.",
    });
    return;
  }
  readyMessage();
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 760,
    height: 680,
    title: "DND Server",
    backgroundColor: "#0b1016",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });
  await mainWindow.loadFile(path.join(app.getAppPath(), "electron", "status.html"));
  void boot();
}

app.setName("DND Server");
const locked = app.requestSingleInstanceLock();
if (!locked) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });
  app.whenReady().then(() => void createWindow());
}

app.on("before-quit", () => {
  quitting = true;
  serverProcess?.kill();
});

app.on("window-all-closed", () => {
  app.quit();
});
