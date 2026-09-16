import type { SessionStatus } from "../shared/types.ts";

export function isTurnFinished(
  previous: SessionStatus | undefined,
  next: SessionStatus,
): boolean {
  return previous === "working" && next === "idle";
}

export type NotifyDeps = {
  isSupported: () => boolean;
  isFocused: () => boolean;
  notify: (options: { title: string; body: string; onClick: () => void }) => void;
  focusWindow: () => void;
};

export function notifyTurnFinished(
  deps: NotifyDeps,
  options: { title: string; body: string },
): boolean {
  if (!deps.isSupported() || deps.isFocused()) return false;
  deps.notify({
    title: options.title,
    body: options.body,
    onClick: () => deps.focusWindow(),
  });
  return true;
}
