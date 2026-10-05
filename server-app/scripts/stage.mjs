import { spawn } from "node:child_process";
import { createReadStream, createWriteStream, existsSync } from "node:fs";
import { chmod, cp, rm } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import { createGunzip } from "node:zlib";

const serverApp = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repo = path.resolve(serverApp, "..");
const bundle = path.join(serverApp, "bundle");

function run(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: "inherit",
      env: process.env,
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(" ")} exited ${code}`));
    });
  });
}

const serverDir = path.join(repo, "server");
const prisma = path.join(serverDir, "node_modules", ".bin", "prisma");

await run("npm", ["run", "build"], serverDir);
await run("npm", ["run", "build"], path.join(repo, "cms"));
await run(prisma, ["generate"], serverDir);

await rm(bundle, { recursive: true, force: true });
await cp(path.join(serverDir, "dist"), path.join(bundle, "dist"), { recursive: true });
await cp(path.join(serverDir, "prisma"), path.join(bundle, "prisma"), { recursive: true });
await cp(path.join(serverDir, "package.json"), path.join(bundle, "package.json"));
await cp(path.join(serverDir, "docker-compose.yml"), path.join(bundle, "docker-compose.yml"));
await cp(path.join(repo, "cms", "dist"), path.join(bundle, "cms"), { recursive: true });
await cp(path.join(serverDir, "node_modules"), path.join(bundle, "node_modules"), {
  recursive: true,
  filter: (source) => !source.includes(`${path.sep}.cache${path.sep}`),
});

const engineCommit = "c2990dca591cba766e3b7ef5d9e8a84796e47ab7";
const engineDir = path.join(bundle, "node_modules", "@prisma", "engines");
for (const [platform, remoteName, filename] of [
  ["darwin", "schema-engine.gz", "schema-engine-darwin"],
  ["windows", "schema-engine.exe.gz", "schema-engine-windows.exe"],
]) {
  const destination = path.join(engineDir, filename);
  if (existsSync(destination)) continue;
  const compressed = `${destination}.download`;
  await run(
    "curl",
    [
      "-fL",
      "-o",
      compressed,
      `https://binaries.prisma.sh/all_commits/${engineCommit}/${platform}/${remoteName}`,
    ],
    engineDir
  );
  try {
    await pipeline(createReadStream(compressed), createGunzip(), createWriteStream(destination));
    await rm(compressed, { force: true });
  } catch {
    await rm(destination, { force: true });
    const { rename } = await import("node:fs/promises");
    await rename(compressed, destination);
  }
  await chmod(destination, 0o755);
}

console.log(`Staged DND Server bundle at ${bundle}`);
