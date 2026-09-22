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

  if (allowed.length === 1) {
    return allowed[0]!;
  }

  return (origin, callback) => {
    if (!origin) {
      // Non-browser / same-origin / Electron file origins may omit Origin
      callback(null, true);
      return;
    }
    if (allowed.includes(origin)) {
      callback(null, origin);
      return;
    }
    callback(new Error(`Origin ${origin} not allowed`), false);
  };
}
