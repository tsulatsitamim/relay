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

export type RelayBridge = {
  getState: () => Promise<RelayState>;
  create: (payload: CreatePayload) => Promise<Session>;
  send: (id: string, text: string, attachments?: PromptAttachment[]) => Promise<void>;
  cancel: (id: string) => Promise<void>;
  truncate: (id: string, fromEventId: string) => Promise<TranscriptEvent[]>;
  setMode: (sessionId: string, modeId: string) => Promise<void>;
  setConfigOption: (
    id: string,
    configId: string,
    value: string,
  ) => Promise<void>;
  forkSession: (id: string) => Promise<Session | null>;
  addDiffComment: (
    sessionId: string,
    input: DiffCommentInput,
  ) => Promise<DiffComment>;
  deleteDiffComment: (id: string) => Promise<void>;
  markDiffCommentsSent: (sessionId: string, ids: string[]) => Promise<void>;
  permission: (requestId: string, optionId: string | null) => Promise<void>;
  setAutoApprove: (id: string, enabled: boolean) => Promise<void>;
  restart: (id: string) => Promise<void>;
  authenticate: (id: string, methodId: string) => Promise<void>;
  delete: (id: string) => Promise<void>;
  pickDirectory: () => Promise<string | null>;
  listFiles: (
    cwd: string,
    query?: string,
    opts?: { limit?: number; maxDepth?: number },
  ) => Promise<string[]>;
  listSkills: (cwd?: string) => Promise<string[]>;
  branchInfo: (cwd: string) => Promise<BranchInfo | null>;
  pickImages: () => Promise<PromptAttachment[]>;
  addRepo: () => Promise<Repo[]>;
  removeRepo: (path: string) => Promise<Repo[]>;
  saveAgent: (agent: AgentConfig) => Promise<AgentConfig>;
  deleteAgent: (id: string) => Promise<void>;
  installClaudeAdapter: (
    onOutput?: (line: string) => void,
  ) => Promise<ClaudeInstallResult>;
  setSetting: (key: string, value: string) => Promise<void>;
  setMcpServers: (servers: McpServerConfig[]) => Promise<McpServerConfig[]>;
  setPinned: (id: string, pinned: boolean) => Promise<void>;
  setArchived: (id: string, archived: boolean) => Promise<void>;
  rename: (id: string, title: string) => Promise<void>;
  copyDebug: (id: string) => Promise<void>;
  openPath: (cwd: string, path: string) => Promise<boolean>;
  readFile: (cwd: string, path: string) => Promise<ReadFileResult | null>;
  gitChanges: (cwd: string) => Promise<GitChangesResult | null>;
  gitFileDiff: (cwd: string, path: string) => Promise<GitFileDiff | null>;
  availableEditors: () => Promise<EditorInfo[]>;
  openInEditor: (
    cwd: string,
    editor: string,
    path?: string,
    line?: number,
  ) => Promise<OpenInEditorResult>;
  revealInFinder: (cwd: string, path: string) => Promise<boolean>;
  windowControl: (action: "min" | "max" | "close") => Promise<void>;
  subscribe: (listener: (event: RelayEvent) => void) => () => void;
};

declare global {
  interface Window {
    relay: RelayBridge;
  }
}

export {};
