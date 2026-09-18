import { contextBridge, ipcRenderer } from "electron";
import type {
  BranchInfo,
  CreatePayload,
  DiffCommentInput,
  RelayEvent,
  RelayState,
} from "../shared/ipc.ts";
import type {
  AgentConfig,
  ClaudeInstallResult,
  DiffComment,
  PromptAttachment,
  Repo,
  Session,
  SessionConfigOption,
  TranscriptEvent,
} from "../shared/types.ts";
import type { McpServerConfig } from "../shared/mcp.ts";

contextBridge.exposeInMainWorld("relay", {
  getState: (): Promise<RelayState> => ipcRenderer.invoke("relay:getState"),
  create: (payload: CreatePayload): Promise<Session> =>
    ipcRenderer.invoke("relay:create", payload),
  send: (id: string, text: string, attachments?: PromptAttachment[]): Promise<void> =>
    ipcRenderer.invoke("relay:send", id, text, attachments),
  cancel: (id: string): Promise<void> => ipcRenderer.invoke("relay:cancel", id),
  truncate: (id: string, fromEventId: string): Promise<TranscriptEvent[]> =>
    ipcRenderer.invoke("relay:truncate", id, fromEventId),
  setMode: (sessionId: string, modeId: string): Promise<void> =>
    ipcRenderer.invoke("relay:setMode", sessionId, modeId),
  setConfigOption: (
    id: string,
    configId: string,
    value: string,
  ): Promise<SessionConfigOption[]> =>
    ipcRenderer.invoke("relay:setConfigOption", id, configId, value),
  forkSession: (id: string): Promise<Session | null> =>
    ipcRenderer.invoke("relay:forkSession", id),
  addDiffComment: (
    sessionId: string,
    input: DiffCommentInput,
  ): Promise<DiffComment> =>
    ipcRenderer.invoke("relay:addDiffComment", sessionId, input),
  deleteDiffComment: (id: string): Promise<void> =>
    ipcRenderer.invoke("relay:deleteDiffComment", id),
  markDiffCommentsSent: (sessionId: string, ids: string[]): Promise<void> =>
    ipcRenderer.invoke("relay:markDiffCommentsSent", sessionId, ids),
  permission: (requestId: string, optionId: string | null): Promise<void> =>
    ipcRenderer.invoke("relay:permission", requestId, optionId),
  setAutoApprove: (id: string, enabled: boolean): Promise<void> =>
    ipcRenderer.invoke("relay:setAutoApprove", id, enabled),
  restart: (id: string): Promise<void> => ipcRenderer.invoke("relay:restart", id),
  authenticate: (id: string, methodId: string): Promise<void> =>
    ipcRenderer.invoke("relay:authenticate", id, methodId),
  delete: (id: string): Promise<void> => ipcRenderer.invoke("relay:delete", id),
  pickDirectory: (): Promise<string | null> =>
    ipcRenderer.invoke("relay:pickDirectory"),
  listFiles: (cwd: string, query?: string): Promise<string[]> =>
    ipcRenderer.invoke("relay:listFiles", cwd, query),
  listSkills: (cwd?: string): Promise<string[]> =>
    ipcRenderer.invoke("relay:listSkills", cwd),
  branchInfo: (cwd: string): Promise<BranchInfo | null> =>
    ipcRenderer.invoke("relay:branchInfo", cwd),
  pickImages: (): Promise<PromptAttachment[]> =>
    ipcRenderer.invoke("relay:pickImages"),
  addRepo: (): Promise<Repo[]> => ipcRenderer.invoke("relay:addRepo"),
  removeRepo: (path: string): Promise<Repo[]> =>
    ipcRenderer.invoke("relay:removeRepo", path),
  saveAgent: (agent: AgentConfig): Promise<AgentConfig> =>
    ipcRenderer.invoke("relay:saveAgent", agent),
  deleteAgent: (id: string): Promise<void> =>
    ipcRenderer.invoke("relay:deleteAgent", id),
  installClaudeAdapter: (
    onOutput?: (line: string) => void,
  ): Promise<ClaudeInstallResult> => {
    const handler = (_e: unknown, line: string) => onOutput?.(line);
    if (onOutput) ipcRenderer.on("relay:claudeInstallProgress", handler);
    return ipcRenderer
      .invoke("relay:installClaudeAdapter")
      .finally(() => {
        if (onOutput) {
          ipcRenderer.removeListener("relay:claudeInstallProgress", handler);
        }
      });
  },
  setSetting: (key: string, value: string): Promise<void> =>
    ipcRenderer.invoke("relay:setSetting", key, value),
  setMcpServers: (servers: McpServerConfig[]): Promise<McpServerConfig[]> =>
    ipcRenderer.invoke("relay:setMcpServers", servers),
  setPinned: (id: string, pinned: boolean): Promise<void> =>
    ipcRenderer.invoke("relay:setPinned", id, pinned),
  setArchived: (id: string, archived: boolean): Promise<void> =>
    ipcRenderer.invoke("relay:setArchived", id, archived),
  rename: (id: string, title: string): Promise<void> =>
    ipcRenderer.invoke("relay:rename", id, title),
  copyDebug: (id: string): Promise<void> =>
    ipcRenderer.invoke("relay:copyDebug", id),
  openPath: (cwd: string, path: string): Promise<boolean> =>
    ipcRenderer.invoke("relay:openPath", cwd, path),
  windowControl: (action: "min" | "max" | "close"): Promise<void> =>
    ipcRenderer.invoke("relay:windowControl", action),
  subscribe: (listener: (event: RelayEvent) => void) => {
    const handler = (_e: unknown, event: RelayEvent) => listener(event);
    ipcRenderer.on("relay:event", handler);
    return () => ipcRenderer.removeListener("relay:event", handler);
  },
});
