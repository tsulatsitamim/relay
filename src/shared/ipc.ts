import type { AgentConfig, Session, TranscriptEvent } from "./types.ts";

export type RelayState = {
  sessions: Session[];
  agents: AgentConfig[];
  recents: string[];
  transcripts: Record<string, TranscriptEvent[]>;
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
