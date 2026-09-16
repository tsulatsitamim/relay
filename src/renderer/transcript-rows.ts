import type { TranscriptEvent } from "../shared/types.ts";
import { formatDay, formatTime } from "./time";

export type TranscriptRow = {
  event: TranscriptEvent;
  time: string | null;
  day: string | null;
  showSeparator: boolean;
};

export function buildRows(events: TranscriptEvent[]): TranscriptRow[] {
  const rows: TranscriptRow[] = [];
  let lastDay: string | null = null;
  for (const event of events) {
    const time = event.createdAt != null ? formatTime(event.createdAt) : null;
    const day = event.createdAt != null ? formatDay(event.createdAt) : null;
    const showSeparator = day != null && day !== lastDay;
    if (day != null) lastDay = day;
    rows.push({ event, time, day, showSeparator });
  }
  return rows;
}
