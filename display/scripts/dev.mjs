import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import esbuild from "esbuild";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const require = createRequire(import.meta.url);

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

await buildElectron();

const electronBin = require("electron");
const child = spawn(
  String(electronBin),
  [path.join(root, "dist-electron/main.js")],
  {
    cwd: root,
    env: {
      ...process.env,
      VITE_DEV_SERVER_URL:
        process.env.VITE_DEV_SERVER_URL ?? "http://localhost:5174",
    },
    stdio: "inherit",
  }
);

child.on("exit", (code) => process.exit(code ?? 0));
