import type { TranscriptEvent } from "../shared/types.ts";
import { formatDay, formatTime } from "./time";

export type TranscriptRow = {
  event: TranscriptEvent;
  time: string | null;
  day: string | null;
  showSeparator: boolean;
  group?: TranscriptEvent[];
};

export function buildRows(events: TranscriptEvent[]): TranscriptRow[] {
  const rows: TranscriptRow[] = [];
  let lastDay: string | null = null;

  function push(event: TranscriptEvent) {
    const time = event.createdAt != null ? formatTime(event.createdAt) : null;
    const day = event.createdAt != null ? formatDay(event.createdAt) : null;
    const showSeparator = day != null && day !== lastDay;
    if (day != null) lastDay = day;
    rows.push({ event, time, day, showSeparator });
  }

  let index = 0;
  while (index < events.length) {
    const event = events[index]!;
    if (event.kind !== "tool_call") {
      push(event);
      index += 1;
      continue;
    }
    let end = index + 1;
    while (end < events.length && events[end]!.kind === "tool_call") end += 1;
    const run = events.slice(index, end);
    push(event);
    if (run.length >= 2) rows[rows.length - 1]!.group = run;
    index = end;
  }

  return rows;
}
