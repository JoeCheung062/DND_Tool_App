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
  x?: number;
  y?: number;
  scale?: number;
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
      once?: boolean;
      map?: { columns: number; rows: number; focusCol: number; focusRow: number; zoom?: number };
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
        once?: boolean;
        map?: { columns: number; rows: number; focusCol: number; focusRow: number; zoom?: number };
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
  onMapFrame: (
    cb: (map: { columns: number; rows: number; focusCol: number; focusRow: number; zoom?: number }) => void
  ) => {
    const listener = (
      _: Electron.IpcRendererEvent,
      map: { columns: number; rows: number; focusCol: number; focusRow: number; zoom?: number }
    ) => cb(map);
    ipcRenderer.on("display:map-frame", listener);
    return () => ipcRenderer.removeListener("display:map-frame", listener);
  },
  onMapMeasure: (
    cb: (measure: {
      mode: "line" | "circle" | "square";
      startCol: number;
      startRow: number;
      endCol: number;
      endRow: number;
    } | null) => void
  ) => {
    const listener = (
      _: Electron.IpcRendererEvent,
      measure: {
        mode: "line" | "circle" | "square";
        startCol: number;
        startRow: number;
        endCol: number;
        endRow: number;
      } | null
    ) => cb(measure);
    ipcRenderer.on("display:map-measure", listener);
    return () => ipcRenderer.removeListener("display:map-measure", listener);
  },
  onInitiative: (
    cb: (board: {
      entries: Array<{ id: string; name: string; speed: number; visible: boolean }>;
      turnId: string | null;
      barVisible: boolean;
    }) => void
  ) => {
    const listener = (
      _: Electron.IpcRendererEvent,
      board: {
        entries: Array<{ id: string; name: string; speed: number; visible: boolean }>;
        turnId: string | null;
        barVisible: boolean;
      }
    ) => cb(board);
    ipcRenderer.on("display:initiative", listener);
    return () => ipcRenderer.removeListener("display:initiative", listener);
  },
  requestInitiative: () => {
    ipcRenderer.send("display:initiative-sync");
  },
  onSound: (
    cb: (payload: {
      channel: "bgm" | "effect";
      action: "play" | "pause" | "stop" | "seek" | "volume";
      volume: number;
      gain?: number;
      position?: number;
      material?: { id: string; name: string; localUrl: string };
    }) => void
  ) => {
    const listener = (
      _: Electron.IpcRendererEvent,
      payload: {
        channel: "bgm" | "effect";
        action: "play" | "pause" | "stop" | "seek" | "volume";
        volume: number;
        gain?: number;
        position?: number;
        material?: { id: string; name: string; localUrl: string };
      }
    ) => cb(payload);
    ipcRenderer.on("display:sound", listener);
    return () => ipcRenderer.removeListener("display:sound", listener);
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
