import { describe, expect, it } from "vitest";
import {
  EMPTY_PANEL_STATE,
  fileSurfaceId,
  panelReducer,
  type SessionPanelState,
} from "../src/shared/right-panel.ts";

function openChanges(): SessionPanelState {
  return panelReducer(EMPTY_PANEL_STATE, { type: "open", kind: "changes" });
}

describe("panelReducer", () => {
  it("opens a singleton surface and activates it", () => {
    const state = openChanges();
    expect(state.isOpen).toBe(true);
    expect(state.activeSurfaceId).toBe("changes");
    expect(state.surfaces).toEqual([{ id: "changes", kind: "changes" }]);
  });

  it("keeps the same singleton surface when opened twice", () => {
    const once = openChanges();
    const twice = panelReducer(once, { type: "open", kind: "changes" });
    expect(twice.surfaces).toHaveLength(1);
  });

  it("opens a file surface and drops the files explorer", () => {
    const files = panelReducer(EMPTY_PANEL_STATE, { type: "open", kind: "files" });
    const file = panelReducer(files, { type: "openFile", path: "src/a.ts", line: 12 });
    expect(file.activeSurfaceId).toBe(fileSurfaceId("src/a.ts"));
    expect(file.surfaces).toEqual([
      {
        id: fileSurfaceId("src/a.ts"),
        kind: "file",
        path: "src/a.ts",
        revealLine: 12,
        revealRequestId: 0,
      },
    ]);
  });

  it("drops file surfaces when the files explorer opens", () => {
    const file = panelReducer(EMPTY_PANEL_STATE, { type: "openFile", path: "src/a.ts" });
    const files = panelReducer(file, { type: "open", kind: "files" });
    expect(files.surfaces).toEqual([{ id: "files", kind: "files" }]);
  });

  it("bumps revealRequestId and replaces the line when the same file is reopened", () => {
    const first = panelReducer(EMPTY_PANEL_STATE, { type: "openFile", path: "src/a.ts", line: 3 });
    const second = panelReducer(first, { type: "openFile", path: "src/a.ts", line: 40 });
    expect(second.surfaces).toHaveLength(1);
    expect(second.surfaces[0]).toEqual({
      id: fileSurfaceId("src/a.ts"),
      kind: "file",
      path: "src/a.ts",
      revealLine: 40,
      revealRequestId: 1,
    });
  });

  it("keeps the previous reveal line when reopening without one", () => {
    const first = panelReducer(EMPTY_PANEL_STATE, { type: "openFile", path: "src/a.ts", line: 3 });
    const second = panelReducer(first, { type: "openFile", path: "src/a.ts" });
    expect(second.surfaces[0]).toMatchObject({ revealLine: 3, revealRequestId: 1 });
  });

  it("activates an existing surface and ignores an unknown one", () => {
    const first = panelReducer(openChanges(), { type: "open", kind: "plan" });
    const back = panelReducer(first, { type: "activate", id: "changes" });
    expect(back.activeSurfaceId).toBe("changes");
    expect(panelReducer(first, { type: "activate", id: "nope" })).toBe(first);
  });

  it("falls back to the neighbour when the active surface closes", () => {
    const first = panelReducer(openChanges(), { type: "open", kind: "plan" });
    const closed = panelReducer(first, { type: "close", id: "plan" });
    expect(closed.isOpen).toBe(true);
    expect(closed.activeSurfaceId).toBe("changes");
  });

  it("hides the panel when the last surface closes", () => {
    const closed = panelReducer(openChanges(), { type: "close", id: "changes" });
    expect(closed).toEqual(EMPTY_PANEL_STATE);
  });

  it("closes other surfaces, closes all, and toggles", () => {
    const first = panelReducer(openChanges(), { type: "open", kind: "plan" });
    const only = panelReducer(first, { type: "closeOthers", id: "plan" });
    expect(only.surfaces).toEqual([{ id: "plan", kind: "plan" }]);
    expect(panelReducer(only, { type: "closeAll" })).toEqual(EMPTY_PANEL_STATE);

    const hidden = panelReducer(first, { type: "togglePanel" });
    expect(hidden.isOpen).toBe(false);
    expect(hidden.surfaces).toHaveLength(2);

    const shown = panelReducer(hidden, { type: "togglePanel" });
    expect(shown.isOpen).toBe(true);
    expect(shown.activeSurfaceId).toBe("plan");
  });

  it("opens changes when toggling an empty panel", () => {
    const opened = panelReducer(EMPTY_PANEL_STATE, { type: "togglePanel" });
    expect(opened.activeSurfaceId).toBe("changes");
    expect(opened.isOpen).toBe(true);
  });

  it("hides and shows without losing surfaces", () => {
    const state = openChanges();
    expect(panelReducer(state, { type: "hide" })).toMatchObject({ isOpen: false });
    expect(panelReducer(state, { type: "show" })).toMatchObject({ isOpen: true });
    expect(panelReducer(EMPTY_PANEL_STATE, { type: "show" })).toEqual(EMPTY_PANEL_STATE);
  });

  it("resets a removed session to the empty panel state", () => {
    const state = panelReducer(openChanges(), { type: "open", kind: "plan" });
    expect(panelReducer(state, { type: "removeSession" })).toEqual(EMPTY_PANEL_STATE);
  });
});
