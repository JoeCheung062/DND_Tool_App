import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import esbuild from "esbuild";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const require = createRequire(import.meta.url);
const DEV_URL = process.env.VITE_DEV_SERVER_URL ?? "http://localhost:5174";

async function buildElectron() {
  await esbuild.build({
    entryPoints: [path.join(root, "electron/main.ts")],
    outfile: path.join(root, "dist-electron/main.js"),
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node20",
    packages: "external",
    sourcemap: true,
    external: ["electron"],
  });

  await esbuild.build({
    entryPoints: [
      path.join(root, "electron/preload.ts"),
      path.join(root, "electron/preload-display.ts"),
    ],
    outdir: path.join(root, "dist-electron"),
    bundle: true,
    platform: "node",
    format: "cjs",
    target: "node20",
    sourcemap: true,
    external: ["electron"],
    outExtension: { ".js": ".cjs" },
  });
}

function waitForUrl(url, timeoutMs = 60000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tick = async () => {
      try {
        const res = await fetch(url, { method: "GET" });
        if (res.ok || res.status === 404) {
          resolve(undefined);
          return;
        }
      } catch {
        // keep waiting
      }
      if (Date.now() - start > timeoutMs) {
        reject(new Error(`Timed out waiting for ${url}`));
        return;
      }
      setTimeout(tick, 250);
    };
    void tick();
  });
}

await buildElectron();

const vite = spawn(
  process.platform === "win32" ? "npx.cmd" : "npx",
  ["vite", "--host", "127.0.0.1", "--port", "5174", "--strictPort"],
  {
    cwd: root,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env },
  }
);

vite.stdout?.on("data", (buf) => process.stdout.write(buf));
vite.stderr?.on("data", (buf) => process.stderr.write(buf));

try {
  await waitForUrl(DEV_URL);
} catch (err) {
  vite.kill("SIGTERM");
  throw err;
}

const electronBin = require("electron");
const electron = spawn(
  String(electronBin),
  [path.join(root, "dist-electron/main.js")],
  {
    cwd: root,
    env: {
      ...process.env,
      VITE_DEV_SERVER_URL: DEV_URL,
      ELECTRON_DISABLE_SECURITY_WARNINGS: "true",
    },
    stdio: "inherit",
  }
);

function shutdown(code = 0) {
  if (!vite.killed) vite.kill("SIGTERM");
  if (!electron.killed) electron.kill("SIGTERM");
  process.exit(code);
}

electron.on("exit", (code) => shutdown(code ?? 0));
vite.on("exit", (code) => {
  if (code && code !== 0) shutdown(code);
});
process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
