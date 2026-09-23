import { contextBridge, ipcRenderer } from "electron";
import type {
  BranchInfo,
  CreatePayload,
  DiffCommentInput,
  ReadFileResult,
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
  TranscriptEvent,
} from "../shared/types.ts";
import type { McpServerConfig } from "../shared/mcp.ts";
import type { GitChangesResult, GitFileDiff } from "../shared/git.ts";
import type { EditorInfo, OpenInEditorResult } from "../shared/editors.ts";
import type {
  TerminalAttachResult,
  TerminalCreateResult,
  TerminalEvent,
} from "../shared/terminal.ts";
import type {
  PreviewCreateResult,
  PreviewEvent,
  PreviewNavigateResult,
} from "../shared/preview.ts";

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
  ): Promise<void> =>
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
  listFiles: (
    cwd: string,
    query?: string,
    opts?: { limit?: number; maxDepth?: number },
  ): Promise<string[]> => ipcRenderer.invoke("relay:listFiles", cwd, query, opts),
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
  readFile: (cwd: string, path: string): Promise<ReadFileResult | null> =>
    ipcRenderer.invoke("relay:readFile", cwd, path),
  gitChanges: (cwd: string): Promise<GitChangesResult | null> =>
    ipcRenderer.invoke("relay:gitChanges", cwd),
  gitFileDiff: (cwd: string, path: string): Promise<GitFileDiff | null> =>
    ipcRenderer.invoke("relay:gitFileDiff", cwd, path),
  availableEditors: (): Promise<EditorInfo[]> =>
    ipcRenderer.invoke("relay:availableEditors"),
  openInEditor: (
    cwd: string,
    editor: string,
    path?: string,
    line?: number,
  ): Promise<OpenInEditorResult> =>
    ipcRenderer.invoke("relay:openInEditor", cwd, editor, path, line),
  revealInFinder: (cwd: string, path: string): Promise<boolean> =>
    ipcRenderer.invoke("relay:revealInFinder", cwd, path),
  windowControl: (action: "min" | "max" | "close"): Promise<void> =>
    ipcRenderer.invoke("relay:windowControl", action),
  openExternal: (url: string): Promise<void> =>
    ipcRenderer.invoke("relay:openExternal", url),
  terminal: {
    create: (
      sessionId: string,
      cols: number,
      rows: number,
    ): Promise<TerminalCreateResult> =>
      ipcRenderer.invoke("relay:terminalCreate", sessionId, cols, rows),
    attach: (terminalId: string): Promise<TerminalAttachResult> =>
      ipcRenderer.invoke("relay:terminalAttach", terminalId),
    write: (terminalId: string, data: string): Promise<void> =>
      ipcRenderer.invoke("relay:terminalWrite", terminalId, data),
    resize: (terminalId: string, cols: number, rows: number): Promise<void> =>
      ipcRenderer.invoke("relay:terminalResize", terminalId, cols, rows),
    close: (terminalId: string): Promise<void> =>
      ipcRenderer.invoke("relay:terminalClose", terminalId),
    restart: (terminalId: string): Promise<void> =>
      ipcRenderer.invoke("relay:terminalRestart", terminalId),
    onEvent: (listener: (event: TerminalEvent) => void): (() => void) => {
      const handler = (_e: unknown, event: TerminalEvent) => listener(event);
      ipcRenderer.on("relay:terminalEvent", handler);
      return () => ipcRenderer.removeListener("relay:terminalEvent", handler);
    },
  },
  preview: {
    create: (sessionId: string, url: string): Promise<PreviewCreateResult> =>
      ipcRenderer.invoke("relay:previewCreate", sessionId, url),
    show: (previewId: string, sessionId: string, url: string): Promise<void> =>
      ipcRenderer.invoke("relay:previewShow", previewId, sessionId, url),
    layout: (
      previewId: string,
      rect: { x: number; y: number; width: number; height: number } | null,
    ): Promise<void> => ipcRenderer.invoke("relay:previewLayout", previewId, rect),
    navigate: (previewId: string, url: string): Promise<PreviewNavigateResult> =>
      ipcRenderer.invoke("relay:previewNavigate", previewId, url),
    reload: (previewId: string): Promise<void> =>
      ipcRenderer.invoke("relay:previewReload", previewId),
    close: (previewId: string): Promise<void> =>
      ipcRenderer.invoke("relay:previewClose", previewId),
    detected: (sessionId: string): Promise<string[]> =>
      ipcRenderer.invoke("relay:previewDetected", sessionId),
    onEvent: (listener: (event: PreviewEvent) => void): (() => void) => {
      const handler = (_e: unknown, event: PreviewEvent) => listener(event);
      ipcRenderer.on("relay:previewEvent", handler);
      return () => ipcRenderer.removeListener("relay:previewEvent", handler);
    },
  },
  subscribe: (listener: (event: RelayEvent) => void) => {
    const handler = (_e: unknown, event: RelayEvent) => listener(event);
    ipcRenderer.on("relay:event", handler);
    return () => ipcRenderer.removeListener("relay:event", handler);
  },
});
