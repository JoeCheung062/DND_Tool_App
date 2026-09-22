import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import esbuild from "esbuild";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const require = createRequire(import.meta.url);

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

console.log("Electron main/preload built → dist-electron/");

// Optional: launch packaged-mode electron against built renderer
if (process.argv.includes("--run")) {
  const electronBin = require("electron");
  const { spawn } = await import("node:child_process");
  const child = spawn(String(electronBin), ["."], {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env },
  });
  child.on("exit", (code) => process.exit(code ?? 0));
}
