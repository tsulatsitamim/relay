import { normalizePreviewUrl } from "../shared/preview.ts";
import type { TranscriptEvent } from "../shared/types.ts";

const ABSOLUTE = /\bhttps?:\/\/[^\s<>"'`)\]]+/gi;
const BARE = /\b(?:localhost|127\.0\.0\.1)(?::\d{2,5})?(?:\/[^\s<>"'`)\]]*)?/gi;
const TRAILING = /[.,;:!?'")\]]+$/;
const MAX_DETECTED = 8;

export function detectLocalUrls(text: string): string[] {
  const candidates = [...(text.match(ABSOLUTE) ?? []), ...(text.match(BARE) ?? [])];
  const found: string[] = [];
  for (const raw of candidates) {
    const normalized = normalizePreviewUrl(raw.replace(TRAILING, ""));
    if (!normalized.ok) continue;
    if (found.includes(normalized.url)) continue;
    found.push(normalized.url);
  }
  return found;
}

/**
 * A transcript payload is agent-shaped and untyped; stringifying it finds a URL
 * in any field without this module having to know every event shape.
 */
export function transcriptText(events: readonly TranscriptEvent[]): string {
  return events.map((event) => JSON.stringify(event.payload)).join("\n");
}

export class UrlStore {
  private readonly bySession = new Map<string, string[]>();

  list(sessionId: string): string[] {
    return [...(this.bySession.get(sessionId) ?? [])];
  }

  /** Returns the new list when it changed, or null when it is identical. */
  add(sessionId: string, urls: readonly string[]): string[] | null {
    const current = this.bySession.get(sessionId) ?? [];
    const merged: string[] = [];
    for (const url of [...urls, ...current]) {
      if (merged.includes(url)) continue;
      merged.push(url);
      if (merged.length === MAX_DETECTED) break;
    }
    if (merged.length === current.length && merged.every((url, i) => url === current[i])) {
      return null;
    }
    this.bySession.set(sessionId, merged);
    return merged;
  }

  remove(sessionId: string): void {
    this.bySession.delete(sessionId);
  }
}
