import { contextBridge, ipcRenderer } from "electron";

export type ScreenInfo = {
  id: number;
  label: string;
  bounds: { x: number; y: number; width: number; height: number };
  primary: boolean;
};

const api = {
  getInfo: () =>
    ipcRenderer.invoke("app:get-info") as Promise<{
      clientId: string;
      mainPid: number;
      version: string;
      packaged?: boolean;
      platform?: string;
    }>,
  detectScreens: () =>
    ipcRenderer.invoke("screens:detect") as Promise<ScreenInfo[]>,
  openDisplayWindows: (screenIds?: number[]) =>
    ipcRenderer.invoke("display:open-windows", screenIds) as Promise<{
      screens: ScreenInfo[];
      processes: Array<{
        screenId: number;
        processId: number;
        webContentsId: number;
        alive: boolean;
      }>;
      clientId: string;
      mainPid: number;
    }>,
  closeDisplayWindows: () =>
    ipcRenderer.invoke("display:close-windows") as Promise<{ ok: boolean }>,
  processSnapshot: () =>
    ipcRenderer.invoke("display:process-snapshot") as Promise<{
      clientId: string;
      mainPid: number;
      processes: Array<{
        screenId: number;
        processId: number;
        webContentsId: number;
        alive: boolean;
      }>;
      screens: ScreenInfo[];
    }>,
  verifyProcesses: () =>
    ipcRenderer.invoke("display:verify") as Promise<{
      ok: boolean;
      mainPid: number;
      clientId: string;
      processes: Array<{
        screenId: number;
        processId: number;
        webContentsId: number;
        alive: boolean;
      }>;
      screens: ScreenInfo[];
    }>,
  assignContent: (payload: {
    requestId: string;
    assignments: Array<{
      screenId?: number;
      materialId?: string;
      combinationId?: string;
      content?: unknown;
    }>;
  }) => ipcRenderer.invoke("display:assign", payload),
  onWindowsChanged: (cb: (payload: unknown) => void) => {
    const listener = (_: Electron.IpcRendererEvent, payload: unknown) =>
      cb(payload);
    ipcRenderer.on("display:windows-changed", listener);
    return () => ipcRenderer.removeListener("display:windows-changed", listener);
  },
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
  }) =>
    ipcRenderer.invoke("materials:download", payload) as Promise<{
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
    }>,
  publishMaterials: (payload: {
    roomId: string;
    materials: Array<{ id: string; name: string; type: string }>;
  }) =>
    ipcRenderer.invoke("materials:publish", payload) as Promise<{
      token: string;
      port: number;
      hosts: string[];
      materials: Array<{ id: string; name: string; type: string }>;
    }>,
  stopSharingMaterials: () =>
    ipcRenderer.invoke("materials:stop-sharing") as Promise<{ ok: boolean }>,
  discoverControl: (payload: { roomId: string }) =>
    ipcRenderer.invoke("materials:discover-control", payload) as Promise<{
      baseUrl: string;
      token: string;
    } | null>,
  discoverServer: () =>
    ipcRenderer.invoke("server:discover") as Promise<{
      apiBase: string;
      host: string;
      port: number;
    } | null>,
  downloadFromControl: (payload: {
    token: string;
    baseUrl?: string;
    hosts?: string[];
    port?: number;
  }) =>
    ipcRenderer.invoke("materials:download-control", payload) as Promise<{
      saved: Array<{
        id: string;
        name: string;
        type: string;
        localUrl: string;
        bytes: number;
      }>;
      failed: Array<{ id: string; error: string }>;
      directory: string;
    }>,
  paint: (requestId: string) =>
    ipcRenderer.invoke("display:paint", requestId) as Promise<{ ok: boolean }>,
  showInitiative: (board: {
    entries: Array<{ id: string; name: string; speed: number; visible: boolean }>;
    turnId: string | null;
    barVisible: boolean;
  }) => ipcRenderer.invoke("display:initiative", board) as Promise<{ ok: boolean }>,
  showMapFrame: (payload: {
    screenId: number;
    map: { columns: number; rows: number; focusCol: number; focusRow: number; zoom?: number };
  }) => ipcRenderer.invoke("display:map-frame", payload) as Promise<{ ok: boolean }>,
  showMapMeasure: (payload: {
    screenId: number;
    measure: {
      mode: "line" | "circle" | "square";
      startCol: number;
      startRow: number;
      endCol: number;
      endRow: number;
    } | null;
  }) => ipcRenderer.invoke("display:map-measure", payload) as Promise<{ ok: boolean }>,
  playSound: (payload: {
    screenIds: number[];
    channel: "bgm" | "effect";
    action: "play" | "pause" | "stop" | "seek" | "volume";
    volume: number;
    gain?: number;
    position?: number;
    material?: { id: string; name: string; localUrl: string };
  }) => ipcRenderer.invoke("display:sound", payload) as Promise<{ ok: boolean }>,
};

contextBridge.exposeInMainWorld("displayApi", api);

export type DisplayApi = typeof api;
