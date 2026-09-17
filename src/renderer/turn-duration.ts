import type { TranscriptEvent } from "../shared/types.ts";

export function formatDuration(ms: number): string {
  const secs = Math.max(0, Math.floor(ms / 1000));
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  const rem = secs % 60;
  return rem === 0 ? `${mins}m` : `${mins}m ${rem}s`;
}

function lastUserIndex(events: TranscriptEvent[]): number {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    if (events[index]!.kind === "user") return index;
  }
  return -1;
}

function turnEvents(events: TranscriptEvent[]): TranscriptEvent[] {
  return events.slice(lastUserIndex(events) + 1);
}

export function turnEndedAt(
  events: TranscriptEvent[],
  lastPromptAt?: number,
): number | null {
  const tail = turnEvents(events);
  let end: number | null = null;
  for (const event of tail) {
    const ts = event.createdAt;
    if (ts != null && (end == null || ts > end)) end = ts;
  }
  if (end == null) return null;
  const index = lastUserIndex(events);
  const start =
    (index >= 0 ? events[index]!.createdAt : undefined) ?? lastPromptAt;
  if (start == null) return null;
  return end;
}

export function turnDuration(
  events: TranscriptEvent[],
  lastPromptAt?: number,
): number | null {
  const end = turnEndedAt(events, lastPromptAt);
  if (end == null) return null;
  const index = lastUserIndex(events);
  const start =
    (index >= 0 ? events[index]!.createdAt : undefined) ?? lastPromptAt;
  if (start == null) return null;
  const duration = end - start;
  if (!Number.isFinite(duration) || duration < 0) return null;
  return duration;
}

export function turnText(events: TranscriptEvent[]): string {
  const parts: string[] = [];
  for (const event of turnEvents(events)) {
    if (event.kind !== "agent_message") continue;
    const text = String(event.payload.text ?? "");
    if (text) parts.push(text);
  }
  return parts.join("\n\n");
}
