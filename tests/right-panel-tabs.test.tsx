// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import {
  RightPanelTabs,
  surfaceTitle,
} from "../src/renderer/right-panel/RightPanelTabs.tsx";
import { panelReducer, EMPTY_PANEL_STATE } from "../src/shared/right-panel.ts";

afterEach(cleanup);

function stateWith(...actions: Parameters<typeof panelReducer>[1][]) {
  return actions.reduce(panelReducer, EMPTY_PANEL_STATE);
}

describe("surfaceTitle", () => {
  it("names files by their base name and singletons by kind", () => {
    expect(surfaceTitle({ id: "changes", kind: "changes" })).toBe("Changes");
    expect(surfaceTitle({ id: "files", kind: "files" })).toBe("Files");
    expect(surfaceTitle({ id: "plan", kind: "plan" })).toBe("Plan");
    expect(
      surfaceTitle({
        id: "file:src/right-panel/RightPanelTabs.tsx",
        kind: "file",
        path: "src/right-panel/RightPanelTabs.tsx",
        revealLine: null,
        revealRequestId: 0,
      }),
    ).toBe("RightPanelTabs.tsx");
  });
});

describe("RightPanelTabs", () => {
  it("renders one tab per surface and activates on click", () => {
    const dispatch = vi.fn();
    const state = stateWith({ type: "open", kind: "changes" }, { type: "open", kind: "plan" });
    render(
      <RightPanelTabs
        state={state}
        dispatch={dispatch}
        maximized={false}
        onMaximize={() => {}}
      />,
    );
    expect(screen.getByRole("tab", { name: "Changes" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Plan" })).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "Changes" }));
    expect(dispatch).toHaveBeenCalledWith({ type: "activate", id: "changes" });
  });

  it("closes a tab and closes others from the context menu", () => {
    const dispatch = vi.fn();
    const state = stateWith({ type: "open", kind: "changes" }, { type: "open", kind: "plan" });
    render(
      <RightPanelTabs
        state={state}
        dispatch={dispatch}
        maximized={false}
        onMaximize={() => {}}
      />,
    );
    fireEvent.contextMenu(screen.getByRole("tab", { name: "Plan" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Close others" }));
    expect(dispatch).toHaveBeenCalledWith({ type: "closeOthers", id: "plan" });
  });

  it("closes a tab from the context menu without activating it", () => {
    const dispatch = vi.fn();
    const state = stateWith({ type: "open", kind: "changes" }, { type: "open", kind: "plan" });
    render(
      <RightPanelTabs
        state={state}
        dispatch={dispatch}
        maximized={false}
        onMaximize={() => {}}
      />,
    );
    fireEvent.contextMenu(screen.getByRole("tab", { name: "Plan" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Close" }));
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenLastCalledWith({ type: "close", id: "plan" });
  });

  it("closes all from the context menu without activating a tab", () => {
    const dispatch = vi.fn();
    const state = stateWith({ type: "open", kind: "changes" }, { type: "open", kind: "plan" });
    render(
      <RightPanelTabs
        state={state}
        dispatch={dispatch}
        maximized={false}
        onMaximize={() => {}}
      />,
    );
    fireEvent.contextMenu(screen.getByRole("tab", { name: "Plan" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Close all" }));
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenLastCalledWith({ type: "closeAll" });
  });

  it("adds a surface from the plus menu and queries files", () => {
    const dispatch = vi.fn();
    render(
      <RightPanelTabs
        state={stateWith()}
        dispatch={dispatch}
        maximized={false}
        onMaximize={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Add panel surface" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Files" }));
    expect(dispatch).toHaveBeenCalledWith({ type: "open", kind: "files" });
  });

  it("toggles maximize", () => {
    const onMaximize = vi.fn();
    render(
      <RightPanelTabs
        state={stateWith({ type: "open", kind: "changes" })}
        dispatch={() => {}}
        maximized={false}
        onMaximize={onMaximize}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Maximize panel" }));
    expect(onMaximize).toHaveBeenCalled();
  });
});
