import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("serverHost", {
  onStatus: (
    cb: (payload: {
      state: string;
      message: string;
      urls?: string[];
      log?: string;
    }) => void
  ) => {
    ipcRenderer.on("server:status", (_event, payload) => cb(payload));
  },
});
