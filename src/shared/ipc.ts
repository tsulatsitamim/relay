import type {
  AgentConfig,
  ClaudeAdapterInfo,
  PermissionRequest,
  PromptAttachment,
  Repo,
  Session,
  TranscriptEvent,
} from "./types.ts";

export type RelayState = {
  sessions: Session[];
  agents: AgentConfig[];
  recents: string[];
  repos: Repo[];
  transcripts: Record<string, TranscriptEvent[]>;
  permissions: PermissionRequest[];
  homeDir: string;
  autoApprove: string[];
  agentDefaults: Record<string, string>;
  settings: Record<string, string>;
  about: { version: string; dataPath: string };
  claudeAdapter?: ClaudeAdapterInfo;
};

export type RelayEvent =
  | { type: "sessions"; sessions: Session[] }
  | { type: "transcript"; sessionId: string; events: TranscriptEvent[] }
  | { type: "permission"; sessionId: string; request: PermissionRequest }
  | { type: "permission_resolved"; sessionId: string; requestId: string }
  | { type: "log"; sessionId?: string; message: string };

export type CreatePayload = {
  agentId: string;
  cwd: string;
  prompt: string;
  attachments?: PromptAttachment[];
};
