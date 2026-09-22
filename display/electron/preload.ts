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
    }>;
  }) =>
    ipcRenderer.invoke("materials:download", payload) as Promise<{
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
};

contextBridge.exposeInMainWorld("displayApi", api);

export type DisplayApi = typeof api;
