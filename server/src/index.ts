import http from "node:http";
import os from "node:os";
import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { startServerBeacon } from "./discovery.js";
import { ensureDefaultAccounts } from "./ensureAccounts.js";
import { ensureUploadDir } from "./services/upload.service.js";
import { createSocketServer } from "./sockets/index.js";

function lanAddresses() {
  const addresses: string[] = [];
  for (const entries of Object.values(os.networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (entry.family === "IPv4" && !entry.internal) addresses.push(entry.address);
    }
  }
  return addresses;
}

async function main() {
  await ensureUploadDir();
  if (process.env.ENSURE_ACCOUNTS === "1") {
    await ensureDefaultAccounts();
  }

  const app = createApp();
  const server = http.createServer(app);
  const io = createSocketServer(server);

  server.listen(env.PORT, "0.0.0.0", () => {
    console.log(`DND server listening on http://localhost:${env.PORT}`);
    for (const address of lanAddresses()) {
      console.log(`Other devices: http://${address}:${env.PORT}`);
    }
    if (process.env.CMS_DIR) {
      console.log(`CMS: http://localhost:${env.PORT}/`);
    }
    console.log(`API docs: http://localhost:${env.PORT}/api/docs`);
    console.log(`Socket.IO path: /socket.io (storage: ${process.env.S3_ENABLED === "true" ? "s3" : "local"})`);
    console.log(`Socket rooms ready: ${Boolean(io)}`);
    void startServerBeacon(env.PORT);
  });
}

main().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
