import { contextBridge, ipcRenderer } from "electron";

function readScreenIdFromArgv(): number | null {
  const arg = process.argv.find((a) => a.startsWith("--screen-id="));
  if (!arg) return null;
  const n = Number(arg.split("=")[1]);
  return Number.isFinite(n) ? n : null;
}

const screenIdFromArgv = readScreenIdFromArgv();

const displayViewApi = {
  getScreenId: () => {
    const params = new URLSearchParams(window.location.search);
    const fromQuery = Number(params.get("screenId"));
    if (Number.isFinite(fromQuery)) return fromQuery;
    return screenIdFromArgv;
  },
  onShow: (
    cb: (payload: {
      requestId: string;
      screenId: number;
      materialId?: string;
      combinationId?: string;
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
        content?: unknown;
        replyChannel: string;
      }
    ) => cb(payload);
    ipcRenderer.on("display:show", listener);
    return () => ipcRenderer.removeListener("display:show", listener);
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
