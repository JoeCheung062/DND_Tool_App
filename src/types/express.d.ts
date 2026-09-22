import type { AuthAdmin } from "./auth.js";

declare global {
  namespace Express {
    interface Request {
      user?: AuthAdmin;
    }
  }
}

export {};
