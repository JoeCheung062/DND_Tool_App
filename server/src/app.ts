import path from "node:path";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import swaggerUi from "swagger-ui-express";
import { corsOriginOption } from "./config/cors.js";
import { env } from "./config/env.js";
import { openApiDocument } from "./docs/openapi.js";
import { errorHandler, notFound } from "./middleware/errorHandler.js";
import apiRoutes from "./routes/index.js";

export function createApp() {
  const app = express();
  const cmsDir = process.env.CMS_DIR?.trim();

  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: "cross-origin" },
      ...(cmsDir
        ? { contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }
        : {}),
    })
  );
  app.use(
    cors({
      origin: corsOriginOption(),
      credentials: true,
    })
  );
  app.use(morgan(env.NODE_ENV === "production" ? "combined" : "dev"));
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: true }));

  app.use("/uploads", express.static(path.resolve(env.UPLOAD_DIR)));

  if (!cmsDir) {
    app.get("/", (_req, res) => {
      res.json({
        success: true,
        message: "DND App API",
        docs: "/api/docs",
        health: "/api/health",
        socket: "/socket.io",
      });
    });
  }

  app.use("/api/docs", swaggerUi.serve, swaggerUi.setup(openApiDocument));
  app.get("/api/docs.json", (_req, res) => {
    res.json(openApiDocument);
  });

  app.use("/api", apiRoutes);

  if (cmsDir) {
    app.use(express.static(cmsDir, { index: "index.html" }));
    app.use((req, res, next) => {
      if (req.method !== "GET" && req.method !== "HEAD") {
        next();
        return;
      }
      if (
        req.path.startsWith("/api") ||
        req.path.startsWith("/uploads") ||
        req.path.startsWith("/socket.io")
      ) {
        next();
        return;
      }
      res.sendFile(path.join(cmsDir, "index.html"), (err) => {
        if (err) next();
      });
    });
  }

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
