import type { AgentConfig, Repo, Session, TranscriptEvent } from "./types.ts";

export type RelayState = {
  sessions: Session[];
  agents: AgentConfig[];
  recents: string[];
  repos: Repo[];
  transcripts: Record<string, TranscriptEvent[]>;
  homeDir: string;
};

export type RelayEvent =
  | { type: "sessions"; sessions: Session[] }
  | { type: "transcript"; sessionId: string; events: TranscriptEvent[] }
  | { type: "log"; sessionId?: string; message: string };

export type CreatePayload = {
  agentId: string;
  cwd: string;
  prompt: string;
};
