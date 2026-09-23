import type { RightPanelSurface } from "../../shared/right-panel.ts";

/**
 * The surfaces that vanished between two panel states. Every removal path
 * (close, closeOthers, closeAll, removeSession) flows through the caller, so a
 * main-process resource is never leaked by a path nobody remembered.
 */
export function closedSurfaceIds(
  before: readonly RightPanelSurface[],
  after: readonly RightPanelSurface[],
): RightPanelSurface[] {
  const closed: RightPanelSurface[] = [];
  for (const surface of before) {
    if (surface.kind !== "terminal" && surface.kind !== "preview") continue;
    if (after.some((entry) => entry.id === surface.id)) continue;
    closed.push(surface);
  }
  return closed;
}
