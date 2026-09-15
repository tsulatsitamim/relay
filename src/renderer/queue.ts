export function nextQueued(queue: string[], status: string): string | null {
  if (queue.length === 0) return null;
  return status === "idle" ? queue[0] : null;
}

export function pruneQueued(
  queued: Record<string, string[]>,
  sessionIds: string[],
): Record<string, string[]> {
  const live = new Set(sessionIds);
  let changed = false;
  const next: Record<string, string[]> = {};
  for (const [id, items] of Object.entries(queued)) {
    if (!live.has(id) || items.length === 0) {
      changed = true;
      continue;
    }
    next[id] = items;
  }
  return changed ? next : queued;
}
