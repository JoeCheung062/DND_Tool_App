export type ScreenInfo = {
  id: number;
  label: string;
  bounds: { x: number; y: number; width: number; height: number };
  primary: boolean;
};

export type ProcessInfo = {
  screenId: number;
  processId: number;
  webContentsId: number;
  alive: boolean;
};

export type DisplayApi = {
  getInfo: () => Promise<{
    clientId: string;
    mainPid: number;
    version: string;
    packaged?: boolean;
    platform?: string;
  }>;
  detectScreens: () => Promise<ScreenInfo[]>;
  openDisplayWindows: (screenIds?: number[]) => Promise<{
    screens: ScreenInfo[];
    processes: ProcessInfo[];
    clientId: string;
    mainPid: number;
  }>;
  closeDisplayWindows: () => Promise<{ ok: boolean }>;
  processSnapshot: () => Promise<{
    clientId: string;
    mainPid: number;
    processes: ProcessInfo[];
    screens: ScreenInfo[];
  }>;
  verifyProcesses: () => Promise<{
    ok: boolean;
    mainPid: number;
    clientId: string;
    processes: ProcessInfo[];
    screens: ScreenInfo[];
  }>;
  assignContent: (payload: {
    requestId: string;
    assignments: Array<{
      screenId?: number;
      materialId?: string;
      combinationId?: string;
      content?: unknown;
    }>;
  }) => Promise<{
    requestId: string;
    results: Array<{
      screenId: number;
      ok: boolean;
      processId?: number;
      error?: string;
    }>;
    processes: ProcessInfo[];
    mainPid: number;
    clientId: string;
  }>;
  onWindowsChanged: (cb: (payload: unknown) => void) => () => void;
};

declare global {
  interface Window {
    displayApi?: DisplayApi;
  }
}

/** True only inside the Electron desktop shell (preload bridge present). */
export function isDesktopApp() {
  return typeof window !== "undefined" && Boolean(window.displayApi);
}

export function getDisplayApi(): DisplayApi {
  if (!window.displayApi) {
    throw new Error(
      "DND Display is a desktop application. Launch it with Electron (npm run display:dev), not a browser."
    );
  }
  return window.displayApi;
}
