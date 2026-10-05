import { useLocation } from "react-router-dom";

export type AppMode = "display" | "control";

const MODE_KEY = "dnd_app_mode";

export function getAppMode(): AppMode | null {
  const value = sessionStorage.getItem(MODE_KEY);
  return value === "display" || value === "control" ? value : null;
}

export function setAppMode(mode: AppMode) {
  sessionStorage.setItem(MODE_KEY, mode);
}

export function clearAppMode() {
  sessionStorage.removeItem(MODE_KEY);
}

export function modeHome(mode: AppMode) {
  return mode === "control" ? "/control" : "/display";
}

export function useRouteMode(): AppMode {
  const { pathname } = useLocation();
  return pathname.startsWith("/control") ? "control" : "display";
}
