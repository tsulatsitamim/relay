import type { TranscriptEvent } from "../shared/types.ts";
import type { TranscriptRow } from "./transcript-rows.ts";
import { formatDuration, turnDuration } from "./turn-duration.ts";

export type Turn = {
  key: string;
  userEventId: string;
  rows: TranscriptRow[];
  steps: number;
  files: number;
  duration?: number;
  prompt: string;
  reply: string;
};

function rowEvents(row: TranscriptRow): TranscriptEvent[] {
  return row.group ?? [row.event];
}

function eventsOf(rows: TranscriptRow[]): TranscriptEvent[] {
  const events: TranscriptEvent[] = [];
  for (const row of rows) events.push(...rowEvents(row));
  return events;
}

function count(rows: TranscriptRow[]): { steps: number; files: number } {
  let steps = 0;
  const paths = new Set<string>();
  for (const row of rows) {
    for (const event of rowEvents(row)) {
      if (event.kind === "tool_call") steps += 1;
      else if (event.kind === "diff") paths.add(String(event.payload.path ?? ""));
    }
  }
  return { steps, files: paths.size };
}

function lastAgentText(rows: TranscriptRow[]): string {
  let reply = "";
  for (const row of rows) {
    if (row.event.kind === "agent_message") {
      reply = String(row.event.payload.text ?? "");
    }
  }
  return reply;
}

export function buildTurns(rows: TranscriptRow[]): Turn[] {
  if (rows.length === 0) return [];

  const turns: Turn[] = [];
  let chunk: TranscriptRow[] = [];
  let current: TranscriptRow | null = null;

  function flush(): void {
    if (chunk.length === 0) return;
    const { steps, files } = count(chunk);
    const duration = turnDuration(eventsOf(chunk)) ?? undefined;
    const reply = lastAgentText(chunk);
    turns.push({
      key: current === null ? "lead" : current.event.id,
      userEventId: current === null ? "" : current.event.id,
      rows: chunk,
      steps,
      files,
      duration,
      prompt: current === null ? "" : String(current.event.payload.text ?? ""),
      reply,
    });
    chunk = [];
  }

  for (const row of rows) {
    if (row.event.kind === "user") {
      flush();
      current = row;
    }
    chunk.push(row);
  }
  flush();

  return turns;
}

export function isTurnOpen(
  turns: Turn[],
  index: number,
  expanded: Set<string>,
  openCount: number,
): boolean {
  const turn = turns[index];
  if (!turn) return false;
  return index >= turns.length - openCount || expanded.has(turn.key);
}

export function turnSummary(turn: Turn): string {
  const parts: string[] = [];
  if (turn.duration != null) {
    parts.push(`Worked for ${formatDuration(turn.duration)}`);
  }
  if (turn.steps > 0) {
    parts.push(`${turn.steps} ${turn.steps === 1 ? "step" : "steps"}`);
  }
  if (turn.files > 0) {
    parts.push(`${turn.files} ${turn.files === 1 ? "file" : "files"}`);
  }
  if (parts.length === 0) return "No steps";
  return parts.join(" · ");
}