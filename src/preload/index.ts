import { contextBridge, ipcRenderer } from "electron";
import type { CreatePayload, RelayEvent, RelayState } from "../shared/ipc.ts";
import type { PromptAttachment, Repo, Session } from "../shared/types.ts";

contextBridge.exposeInMainWorld("relay", {
  getState: (): Promise<RelayState> => ipcRenderer.invoke("relay:getState"),
  create: (payload: CreatePayload): Promise<Session> =>
    ipcRenderer.invoke("relay:create", payload),
  send: (id: string, text: string, attachments?: PromptAttachment[]): Promise<void> =>
    ipcRenderer.invoke("relay:send", id, text, attachments),
  cancel: (id: string): Promise<void> => ipcRenderer.invoke("relay:cancel", id),
  setMode: (sessionId: string, modeId: string): Promise<void> =>
    ipcRenderer.invoke("relay:setMode", sessionId, modeId),
  permission: (requestId: string, optionId: string | null): Promise<void> =>
    ipcRenderer.invoke("relay:permission", requestId, optionId),
  restart: (id: string): Promise<void> => ipcRenderer.invoke("relay:restart", id),
  delete: (id: string): Promise<void> => ipcRenderer.invoke("relay:delete", id),
  pickDirectory: (): Promise<string | null> =>
    ipcRenderer.invoke("relay:pickDirectory"),
  listFiles: (cwd: string, query?: string): Promise<string[]> =>
    ipcRenderer.invoke("relay:listFiles", cwd, query),
  listSkills: (cwd?: string): Promise<string[]> =>
    ipcRenderer.invoke("relay:listSkills", cwd),
  pickImages: (): Promise<PromptAttachment[]> =>
    ipcRenderer.invoke("relay:pickImages"),
  addRepo: (): Promise<Repo[]> => ipcRenderer.invoke("relay:addRepo"),
  removeRepo: (path: string): Promise<Repo[]> =>
    ipcRenderer.invoke("relay:removeRepo", path),
  setPinned: (id: string, pinned: boolean): Promise<void> =>
    ipcRenderer.invoke("relay:setPinned", id, pinned),
  setArchived: (id: string, archived: boolean): Promise<void> =>
    ipcRenderer.invoke("relay:setArchived", id, archived),
  rename: (id: string, title: string): Promise<void> =>
    ipcRenderer.invoke("relay:rename", id, title),
  copyDebug: (id: string): Promise<void> =>
    ipcRenderer.invoke("relay:copyDebug", id),
  windowControl: (action: "min" | "max" | "close"): Promise<void> =>
    ipcRenderer.invoke("relay:windowControl", action),
  subscribe: (listener: (event: RelayEvent) => void) => {
    const handler = (_e: unknown, event: RelayEvent) => listener(event);
    ipcRenderer.on("relay:event", handler);
    return () => ipcRenderer.removeListener("relay:event", handler);
  },
});
