import { env } from "../config/env.js";

/** Parse CLIENT_ORIGIN (comma-separated) into an allow-list. */
export function clientOrigins(): string[] {
  return env.CLIENT_ORIGIN.split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * cors / socket.io `origin` option.
 * Reflects a single matching Origin header (required when credentials: true).
 */
export function corsOriginOption():
  | boolean
  | string
  | string[]
  | ((
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean | string) => void
    ) => void) {
  const allowed = clientOrigins();

  if (allowed.includes("*")) {
    // Cannot combine `*` with credentials; reflect request origin instead.
    return (origin, callback) => {
      callback(null, origin || true);
    };
  }

  return (origin, callback) => {
    // Packaged Electron loads from file:// and sends that origin on the WebSocket
    // handshake. A normal browser sends "null" for the same page. Both must be
    // allowed or the other device fails with "websocket error".
    if (
      !origin ||
      origin === "null" ||
      isFileOrigin(origin) ||
      allowed.includes(origin) ||
      isLanOrigin(origin)
    ) {
      callback(null, origin && origin !== "null" ? origin : true);
      return;
    }
    callback(new Error(`Origin ${origin} not allowed`), false);
  };
}

function isFileOrigin(origin: string) {
  return origin === "file://" || origin.startsWith("file://");
}

function isLanOrigin(origin: string) {
  try {
    const host = new URL(origin).hostname;
    if (host === "localhost" || host === "127.0.0.1" || host === "::1") return true;
    if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
    if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
    return /^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(host);
  } catch {
    return false;
  }
}
