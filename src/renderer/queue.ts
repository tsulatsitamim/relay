export function nextQueued(queue: string[], status: string): string | null {
  if (queue.length === 0) return null;
  return status === "idle" ? queue[0] : null;
}
