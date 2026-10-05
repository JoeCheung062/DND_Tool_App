import { getApiBase, isApiBaseLocked, setApiBase, setApiBaseLocked } from "./api";
import { isDesktopApp } from "./displayApi";

let message = "Looking for the DND Server on this network.";

export function connectionMessage() {
  return message;
}

async function apiIsReachable(apiBase: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 1200);
  try {
    const response = await fetch(`${apiBase.replace(/\/$/, "")}/health`, {
      signal: controller.signal,
    });
    if (!response.ok) return false;
    const body = (await response.json()) as { data?: { service?: string } };
    return body.data?.service === "dnd-app-server";
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Prefer the computer that is advertising the backend. A typed address is
 * kept only while that address still answers.
 */
export async function connectToServer() {
  const saved = getApiBase();
  if (!isDesktopApp() || !window.displayApi?.discoverServer) {
    message = `API base ${saved}`;
    return saved;
  }

  if (isApiBaseLocked() && (await apiIsReachable(saved))) {
    message = `Using the saved DND Server at ${saved}.`;
    return saved;
  }

  const found = await window.displayApi.discoverServer();
  if (found?.apiBase) {
    setApiBase(found.apiBase);
    setApiBaseLocked(false);
    message = `Connected to the DND Server on ${found.host}.`;
    return found.apiBase;
  }

  message = "Install DND Server on the computer that should host the API, CMS, and database. This app will connect to that computer automatically.";
  return saved;
}
