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
};

export type TranscriptEvent = {
  id: string;
  sessionId?: string;
  seq?: number;
  kind: "user" | "agent_message" | "tool_call" | "diff" | "status" | "error";
  payload: Record<string, unknown>;
  createdAt?: number;
};

export type PermissionOptionLike = {
  optionId: string;
  name: string;
  kind: string;
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
