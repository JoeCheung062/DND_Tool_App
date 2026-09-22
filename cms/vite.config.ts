import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import type { IncomingMessage, ServerResponse } from "node:http";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
        configure(proxy) {
          proxy.on("error", (_err, _req, res) => {
            const response = res as ServerResponse;
            if (!response.headersSent) {
              response.writeHead(502, { "Content-Type": "application/json" });
              response.end(
                JSON.stringify({
                  success: false,
                  message:
                    "API proxy failed. Start the backend with `npm run dev` on port 3000.",
                })
              );
            }
          });
          proxy.on("proxyReq", (_proxyReq, req: IncomingMessage) => {
            if (process.env.DEBUG_PROXY) {
              console.log(`[proxy] ${req.method} ${req.url}`);
            }
          });
        },
      },
      "/uploads": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
      "/socket.io": {
        target: "http://localhost:3000",
        ws: true,
        changeOrigin: true,
      },
    },
  },
});
