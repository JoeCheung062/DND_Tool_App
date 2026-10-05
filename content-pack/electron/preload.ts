import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("contentHost", {
  inspect: () => ipcRenderer.invoke("content:inspect") as Promise<{ ok: boolean; message: string }>,
  importContent: () =>
    ipcRenderer.invoke("content:import") as Promise<{ ok: boolean; message: string }>,
});
