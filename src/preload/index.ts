import { contextBridge, ipcRenderer } from "electron";
import type { CreatePayload, RelayEvent, RelayState } from "../shared/ipc.ts";
import type { Session } from "../shared/types.ts";

contextBridge.exposeInMainWorld("relay", {
  getState: (): Promise<RelayState> => ipcRenderer.invoke("relay:getState"),
  create: (payload: CreatePayload): Promise<Session> =>
    ipcRenderer.invoke("relay:create", payload),
  send: (id: string, text: string): Promise<void> =>
    ipcRenderer.invoke("relay:send", id, text),
  cancel: (id: string): Promise<void> => ipcRenderer.invoke("relay:cancel", id),
  restart: (id: string): Promise<void> => ipcRenderer.invoke("relay:restart", id),
  delete: (id: string): Promise<void> => ipcRenderer.invoke("relay:delete", id),
  pickDirectory: (): Promise<string | null> =>
    ipcRenderer.invoke("relay:pickDirectory"),
  copyDebug: (id: string): Promise<void> =>
    ipcRenderer.invoke("relay:copyDebug", id),
  subscribe: (listener: (event: RelayEvent) => void) => {
    const handler = (_e: unknown, event: RelayEvent) => listener(event);
    ipcRenderer.on("relay:event", handler);
    return () => ipcRenderer.removeListener("relay:event", handler);
  },
});
