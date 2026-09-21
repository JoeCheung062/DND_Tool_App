import http from "node:http";
import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { ensureUploadDir } from "./services/upload.service.js";
import { createSocketServer } from "./sockets/index.js";

async function main() {
  await ensureUploadDir();

  const app = createApp();
  const server = http.createServer(app);
  const io = createSocketServer(server);

  server.listen(env.PORT, () => {
    console.log(`DND server listening on http://localhost:${env.PORT}`);
    console.log(`API docs: http://localhost:${env.PORT}/api/docs`);
    console.log(`Socket.IO path: /socket.io (storage: ${process.env.S3_ENABLED === "true" ? "s3" : "local"})`);
    console.log(`Socket rooms ready: ${Boolean(io)}`);
  });
}

main().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
