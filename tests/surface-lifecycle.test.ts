import { describe, expect, it } from "vitest";
import { closedSurfaceIds } from "../src/renderer/right-panel/surface-lifecycle.ts";
import type { RightPanelSurface } from "../src/shared/right-panel.ts";

const TERMINAL: RightPanelSurface = {
  id: "terminal:11111111-1111-4111-8111-111111111111",
  kind: "terminal",
  title: "Terminal 1",
};
const PREVIEW: RightPanelSurface = {
  id: "preview:22222222-2222-4222-8222-222222222222",
  kind: "preview",
  title: "localhost:5173",
  url: "http://localhost:5173/",
};
const PLAN: RightPanelSurface = { id: "plan", kind: "plan" };

describe("closedSurfaceIds", () => {
  it("reports nothing when every surface survives", () => {
    expect(closedSurfaceIds([TERMINAL, PREVIEW], [TERMINAL, PREVIEW])).toEqual([]);
  });

  it("reports a removed terminal and a removed preview", () => {
    expect(closedSurfaceIds([TERMINAL, PREVIEW, PLAN], [PLAN])).toEqual([TERMINAL, PREVIEW]);
    expect(closedSurfaceIds([TERMINAL, PREVIEW], [TERMINAL])).toEqual([PREVIEW]);
  });

  it("ignores kinds that own no main-process resource", () => {
    expect(closedSurfaceIds([PLAN], [])).toEqual([]);
  });

  it("reports everything when the session is removed", () => {
    expect(closedSurfaceIds([TERMINAL, PREVIEW], [])).toEqual([TERMINAL, PREVIEW]);
  });
});
