export function timeAgo(from: number, now = Date.now()): string {
  const delta = Math.max(0, now - from);
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (delta < hour) return `${Math.max(1, Math.floor(delta / minute))}m`;
  if (delta < day) return `${Math.floor(delta / hour)}h`;
  return `${Math.floor(delta / day)}d`;
}
