import path from "node:path";
import { fileURLToPath } from "node:url";
import esbuild from "esbuild";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

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
