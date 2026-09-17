import type { Session, TranscriptEvent } from "../shared/types.ts";
import { matchesSession } from "./search.ts";

export type PaletteEntry = {
  id: string;
  group: string;
  label: string;
  hint?: string;
  shortcut?: string;
};

const BOUNDARY = /[\s\-_/.]/;

export function fuzzyScore(query: string, target: string): number | null {
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  if (q.length === 0) return 0;
  if (q.length > t.length) return null;
  let score = 0;
  let cursor = 0;
  let prev = -2;
  for (const ch of q) {
    const found = t.indexOf(ch, cursor);
    if (found === -1) return null;
    if (found === prev + 1) score += 6;
    else score -= Math.min(found - cursor, 4);
    if (found === 0 || BOUNDARY.test(t[found - 1] ?? "")) score += 4;
    prev = found;
    cursor = found + 1;
  }
  return score + Math.max(0, 16 - t.length);
}

export function rankEntries<T extends PaletteEntry>(query: string, entries: T[]): T[] {
  const q = query.trim();
  if (!q) return entries;
  const scored: { entry: T; score: number }[] = [];
  for (const entry of entries) {
    const score = fuzzyScore(q, `${entry.label} ${entry.hint ?? ""}`);
    if (score === null) continue;
    scored.push({ entry, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.map((item) => item.entry);
}

export function paletteSessionEntries(
  query: string,
  sessions: Session[],
  transcripts: Record<string, TranscriptEvent[]>,
): PaletteEntry[] {
  const q = query.trim();
  const scored: { entry: PaletteEntry; score: number }[] = [];
  for (const session of sessions) {
    if (session.archived) continue;
    const titleScore = q ? fuzzyScore(q, session.title) : 0;
    const contentMatch =
      q.length > 0 && matchesSession(q, session.title, transcripts[session.id] ?? []);
    if (q && titleScore === null && !contentMatch) continue;
    scored.push({
      entry: {
        id: session.id,
        group: "Sessions",
        label: session.title,
        hint: session.agentName,
      },
      score: titleScore ?? -1,
    });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.map((item) => item.entry);
}
