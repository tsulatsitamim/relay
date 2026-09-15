import type { TranscriptEvent } from "../shared/types.ts";

const TEXT_KEYS = [
  "text",
  "title",
  "kind",
  "path",
  "name",
  "content",
  "entries",
  "command",
  "rawInput",
  "rawOutput",
] as const;

function collect(value: unknown, out: string[]): void {
  if (typeof value === "string") {
    out.push(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collect(item, out);
    return;
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    for (const key of TEXT_KEYS) {
      const nested = record[key];
      if (nested === undefined || nested === null) continue;
      if (typeof nested === "string") out.push(nested);
      else out.push(JSON.stringify(nested));
    }
  }
}

export function eventText(event: TranscriptEvent): string {
  const out: string[] = [];
  collect(event.payload, out);
  return out.join(" ").toLowerCase();
}

export function matchesSession(
  query: string,
  title: string,
  events: TranscriptEvent[],
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  if (title.toLowerCase().includes(q)) return true;
  return events.some((event) => eventText(event).includes(q));
}
