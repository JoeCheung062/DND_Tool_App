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
  getInfo: () => Promise<{ clientId: string; mainPid: number; version: string }>;
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

export function getDisplayApi(): DisplayApi {
  if (!window.displayApi) {
    throw new Error(
      "Display API unavailable — run inside the Electron Display App"
    );
  }
  return window.displayApi;
}

/** Browser fallback for Vite-only UI development (no Electron). */
export function getDisplayApiOrMock(): DisplayApi {
  if (window.displayApi) return window.displayApi;

  const mockScreens: ScreenInfo[] = [
    {
      id: 1,
      label: "Mock Primary",
      bounds: { x: 0, y: 0, width: 1920, height: 1080 },
      primary: true,
    },
  ];

  return {
    getInfo: async () => ({ clientId: "browser-mock", mainPid: 0, version: "0.0.0" }),
    detectScreens: async () => mockScreens,
    openDisplayWindows: async () => ({
      screens: mockScreens,
      processes: [
        { screenId: 1, processId: 0, webContentsId: 0, alive: true },
      ],
      clientId: "browser-mock",
      mainPid: 0,
    }),
    closeDisplayWindows: async () => ({ ok: true }),
    processSnapshot: async () => ({
      clientId: "browser-mock",
      mainPid: 0,
      processes: [
        { screenId: 1, processId: 0, webContentsId: 0, alive: true },
      ],
      screens: mockScreens,
    }),
    verifyProcesses: async () => ({
      ok: true,
      mainPid: 0,
      clientId: "browser-mock",
      processes: [
        { screenId: 1, processId: 0, webContentsId: 0, alive: true },
      ],
      screens: mockScreens,
    }),
    assignContent: async (payload) => ({
      requestId: payload.requestId,
      results: payload.assignments.map((a, i) => ({
        screenId: a.screenId ?? i + 1,
        ok: true,
        processId: 0,
      })),
      processes: [
        { screenId: 1, processId: 0, webContentsId: 0, alive: true },
      ],
      mainPid: 0,
      clientId: "browser-mock",
    }),
    onWindowsChanged: () => () => undefined,
  };
}
