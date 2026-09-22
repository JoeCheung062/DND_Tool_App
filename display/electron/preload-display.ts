import { contextBridge, ipcRenderer } from "electron";

function readArg(prefix: string): string | null {
  const arg = process.argv.find((entry) => entry.startsWith(prefix));
  if (!arg) return null;
  const value = arg.slice(prefix.length);
  return value.length > 0 ? value : null;
}

const screenIdFromArgv = (() => {
  const raw = readArg("--screen-id=");
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
})();

export type DisplayMaterial = {
  id: string;
  type: string;
  name: string;
  localUrl: string;
};

const displayViewApi = {
  getScreenId: () => {
    const search =
      (globalThis as { location?: { search?: string } }).location?.search ?? "";
    const params = new URLSearchParams(search);
    const fromQuery = Number(params.get("screenId"));
    if (Number.isFinite(fromQuery) && params.has("screenId")) return fromQuery;
    return screenIdFromArgv;
  },
  onShow: (
    cb: (payload: {
      requestId: string;
      screenId: number;
      materialId?: string;
      combinationId?: string;
      materials?: DisplayMaterial[];
      content?: unknown;
      replyChannel: string;
    }) => void
  ) => {
    const listener = (
      _: Electron.IpcRendererEvent,
      payload: {
        requestId: string;
        screenId: number;
        materialId?: string;
        combinationId?: string;
        materials?: DisplayMaterial[];
        content?: unknown;
        replyChannel: string;
      }
    ) => cb(payload);
    ipcRenderer.on("display:show", listener);
    return () => ipcRenderer.removeListener("display:show", listener);
  },
  onPaint: (cb: (payload: { requestId: string }) => void) => {
    const listener = (_: Electron.IpcRendererEvent, payload: { requestId: string }) =>
      cb(payload);
    ipcRenderer.on("display:paint", listener);
    return () => ipcRenderer.removeListener("display:paint", listener);
  },
  ackApplied: (payload: {
    replyChannel: string;
    ok: boolean;
    error?: string;
    screenId: number;
  }) => {
    ipcRenderer.send("display:ack-from-view", payload);
  },
};

contextBridge.exposeInMainWorld("displayViewApi", displayViewApi);

export type DisplayViewApi = typeof displayViewApi;
