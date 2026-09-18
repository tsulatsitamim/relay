export type MemoCache<T> = {
  current: {
    length: number;
    last: unknown;
    value: T;
  } | null;
};

export function newMemoCache<T>(): MemoCache<T> {
  return { current: null };
}

export function memoByEvents<T>(
  cache: MemoCache<T>,
  events: readonly unknown[],
  compute: () => T,
): T {
  const last = events.length > 0 ? events[events.length - 1] : null;
  const cached = cache.current;
  if (cached && cached.length === events.length && cached.last === last) {
    return cached.value;
  }
  const value = compute();
  cache.current = { length: events.length, last, value };
  return value;
}
