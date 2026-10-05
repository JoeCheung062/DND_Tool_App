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
      materialIds?: string[];
      combinationId?: string;
      once?: boolean;
      map?: { columns: number; rows: number; focusCol: number; focusRow: number; zoom?: number };
      materials?: Array<{
        id: string;
        type: string;
        name: string;
        localUrl: string;
        x?: number;
        y?: number;
        scale?: number;
        flip?: boolean;
      }>;
      content?: unknown;
    }>;
  }) => Promise<{
    requestId: string;
    results: Array<{
      screenId: number;
      ok: boolean;
      processId?: number;
      processToken?: string;
      error?: string;
    }>;
    processes: ProcessInfo[];
    mainPid: number;
    clientId: string;
  }>;
  onWindowsChanged: (cb: (payload: unknown) => void) => () => void;
  downloadMaterials: (payload: {
    apiBase: string;
    token: string;
    materials: Array<{
      id: string;
      name: string;
      type: string;
      assetUrl: string;
      characterArtUrl?: string | null;
    }>;
  }) => Promise<{
    saved: Array<{
      id: string;
      name: string;
      type: string;
      localUrl: string;
      characterArtLocalUrl?: string;
      bytes: number;
    }>;
    failed: Array<{ id: string; error: string }>;
    directory: string;
  }>;
  publishMaterials: (payload: {
    roomId: string;
    materials: Array<{ id: string; name: string; type: string }>;
  }) => Promise<{
    token: string;
    port: number;
    hosts: string[];
    materials: Array<{ id: string; name: string; type: string }>;
  }>;
  stopSharingMaterials: () => Promise<{ ok: boolean }>;
  discoverControl: (payload: { roomId: string }) => Promise<{
    baseUrl: string;
    token: string;
  } | null>;
  discoverServer: () => Promise<{
    apiBase: string;
    host: string;
    port: number;
  } | null>;
  downloadFromControl: (payload: {
    token: string;
    baseUrl?: string;
    hosts?: string[];
    port?: number;
  }) => Promise<{
    saved: Array<{
      id: string;
      name: string;
      type: string;
      localUrl: string;
      bytes: number;
    }>;
    failed: Array<{ id: string; error: string }>;
    directory: string;
  }>;
  paint: (requestId: string) => Promise<{ ok: boolean }>;
  showInitiative: (board: {
    entries: Array<{ id: string; name: string; speed: number; visible: boolean }>;
    turnId: string | null;
    barVisible: boolean;
  }) => Promise<{ ok: boolean }>;
  showMapFrame: (payload: {
    screenId: number;
    map: { columns: number; rows: number; focusCol: number; focusRow: number; zoom?: number };
  }) => Promise<{ ok: boolean }>;
  showMapMeasure: (payload: {
    screenId: number;
    measure: {
      mode: "line" | "circle" | "square";
      startCol: number;
      startRow: number;
      endCol: number;
      endRow: number;
    } | null;
  }) => Promise<{ ok: boolean }>;
  playSound: (payload: {
    screenIds: number[];
    channel: "bgm" | "effect";
    action: "play" | "pause" | "stop" | "seek" | "volume";
    volume: number;
    gain?: number;
    position?: number;
    material?: { id: string; name: string; localUrl: string };
  }) => Promise<{ ok: boolean }>;
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
      "DND App is a desktop application. Launch it with Electron (npm run app:dev), not a browser."
    );
  }
  return window.displayApi;
}
