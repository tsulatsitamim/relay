import type { TranscriptEvent } from "../shared/types.ts";
import { toolStatusMeta, type ToolTone } from "./toolFormat";

export function toolGroupMeta(statuses: unknown[]): { tone: ToolTone; label: string } {
  let running = false;
  let error = false;
  let pending = false;
  for (const status of statuses) {
    const { tone } = toolStatusMeta(status);
    if (tone === "error") error = true;
    else if (tone === "running") running = true;
    else if (tone === "pending") pending = true;
  }
  if (error) return { tone: "error", label: "Failed" };
  if (running) return { tone: "running", label: "Running" };
  if (pending) return { tone: "pending", label: "Pending" };
  return { tone: "done", label: "Done" };
}

function plural(count: number, singular: string, plural: string): string {
  return count === 1 ? singular : plural;
}

export function toolGroupSummary(events: TranscriptEvent[]): string {
  const counts = new Map<string, number>();
  for (const event of events) {
    const kind = String((event.payload as { kind?: unknown }).kind ?? "other");
    counts.set(kind, (counts.get(kind) ?? 0) + 1);
  }
  const phrases: string[] = [];
  const take = (kind: string): number => {
    const count = counts.get(kind) ?? 0;
    counts.delete(kind);
    return count;
  };
  const edited = take("edit");
  if (edited) phrases.push(`edited ${edited} ${plural(edited, "file", "files")}`);
  const commands = take("execute");
  if (commands) phrases.push(`ran ${commands} ${plural(commands, "command", "commands")}`);
  const read = take("read");
  if (read) phrases.push(`read ${read} ${plural(read, "file", "files")}`);
  const searched = take("search");
  if (searched) phrases.push(`searched ${searched} ${plural(searched, "time", "times")}`);
  const deleted = take("delete");
  if (deleted) phrases.push(`deleted ${deleted} ${plural(deleted, "file", "files")}`);
  const moved = take("move");
  if (moved) phrases.push(`moved ${moved} ${plural(moved, "file", "files")}`);
  const fetched = take("fetch");
  if (fetched) phrases.push(`fetched ${fetched} ${plural(fetched, "resource", "resources")}`);
  let others = 0;
  for (const count of counts.values()) others += count;
  if (others) phrases.push(`${others} other ${plural(others, "tool", "tools")}`);
  if (phrases.length === 0) return "";
  const joined = phrases.join(", ");
  return joined.charAt(0).toUpperCase() + joined.slice(1);
}
