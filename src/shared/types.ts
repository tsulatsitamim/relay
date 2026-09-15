export type SessionStatus =
  | "starting"
  | "working"
  | "idle"
  | "cancelling"
  | "error"
  | "exited";

export type Repo = {
  path: string;
  name: string;
  addedAt: number;
  branch?: string | null;
};

export type AgentConfig = {
  id: string;
  name: string;
  command: string;
  args: string[];
  env?: Record<string, string>;
};

export type Session = {
  id: string;
  title: string;
  agentConfigId: string;
  agentName: string;
  workingDirectory: string;
  acpSessionId?: string;
  status: SessionStatus;
  error?: string;
  createdAt: number;
  updatedAt: number;
  lastPromptAt?: number;
  pinned?: boolean;
  archived?: boolean;
};

export type PlanEntry = {
  content: string;
  priority?: string;
  status?: string;
};

export type TranscriptEvent = {
  id: string;
  sessionId?: string;
  seq?: number;
  kind:
    | "user"
    | "agent_message"
    | "thinking"
    | "plan"
    | "tool_call"
    | "diff"
    | "commands"
    | "status"
    | "error";
  payload: Record<string, unknown>;
  createdAt?: number;
};

export type AvailableCommandLike = {
  name: string;
  description: string;
  inputHint?: string;
};

export type PermissionOptionLike = {
  optionId: string;
  name: string;
  kind: string;
};

export type PermissionRequest = {
  id: string;
  sessionId: string;
  toolCallId?: string;
  title?: string;
  kind?: string;
  options: PermissionOptionLike[];
};

export type SessionUpdateLike = {
  sessionUpdate: string;
  toolCallId?: string;
  title?: string;
  kind?: string;
  status?: string;
  locations?: Array<{ path: string; line?: number }>;
  rawInput?: unknown;
  rawOutput?: unknown;
  content?: unknown;
};
