import type { RightPanelSurface } from "../../shared/right-panel.ts";

export function closedTerminalIds(
  before: readonly RightPanelSurface[],
  after: readonly RightPanelSurface[],
): string[] {
  const closed: string[] = [];
  for (const surface of before) {
    if (surface.kind !== "terminal") continue;
    if (after.some((entry) => entry.id === surface.id)) continue;
    closed.push(surface.id);
  }
  return closed;
}
