// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
        onNewTerminal={() => {}}
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
        onNewTerminal={() => {}}
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
        onNewTerminal={() => {}}
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
        onNewTerminal={() => {}}
      />,
    );
    fireEvent.contextMenu(screen.getByRole("tab", { name: "Plan" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Close all" }));
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenLastCalledWith({ type: "closeAll" });
  });

  it("activates a focused tab with Enter and Space", async () => {
    const dispatch = vi.fn();
    const state = stateWith({ type: "open", kind: "changes" }, { type: "open", kind: "plan" });
    render(
      <RightPanelTabs
        state={state}
        dispatch={dispatch}
        maximized={false}
        onMaximize={() => {}}
        onNewTerminal={() => {}}
      />,
    );
    const user = userEvent.setup();
    screen.getByRole("tab", { name: "Plan" }).focus();
    await user.keyboard("{Enter}");
    await user.keyboard(" ");
    expect(dispatch).toHaveBeenCalledTimes(2);
    expect(dispatch).toHaveBeenNthCalledWith(1, { type: "activate", id: "plan" });
    expect(dispatch).toHaveBeenNthCalledWith(2, { type: "activate", id: "plan" });
  });

  it("marks the active surface and links each tab to the panel body", () => {
    const state = stateWith({ type: "open", kind: "changes" }, { type: "open", kind: "plan" });
    render(
      <RightPanelTabs
        state={state}
        dispatch={() => {}}
        maximized={false}
        onMaximize={() => {}}
        onNewTerminal={() => {}}
      />,
    );
    const changes = screen.getByRole("tab", { name: "Changes" });
    const plan = screen.getByRole("tab", { name: "Plan" });
    expect(plan.getAttribute("aria-selected")).toBe("true");
    expect(changes.getAttribute("aria-selected")).toBe("false");
    expect(plan.id).not.toBe("");
    expect(plan.getAttribute("aria-controls")).toBeTruthy();
    expect(changes.getAttribute("aria-controls")).toBe(plan.getAttribute("aria-controls"));
  });

  it("closes the tab context menu on Escape and on an outside press", () => {
    const state = stateWith({ type: "open", kind: "changes" }, { type: "open", kind: "plan" });
    const { container } = render(
      <RightPanelTabs
        state={state}
        dispatch={() => {}}
        maximized={false}
        onMaximize={() => {}}
        onNewTerminal={() => {}}
      />,
    );
    fireEvent.contextMenu(screen.getByRole("tab", { name: "Plan" }));
    expect(screen.getByRole("menuitem", { name: "Close others" })).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menuitem", { name: "Close others" })).toBeNull();

    fireEvent.contextMenu(screen.getByRole("tab", { name: "Plan" }));
    expect(screen.getByRole("menuitem", { name: "Close others" })).toBeTruthy();
    fireEvent.pointerDown(container.querySelector(".right-panel-tab-strip")!);
    expect(screen.queryByRole("menuitem", { name: "Close others" })).toBeNull();
  });

  it("keeps the tab context menu open on an inside press", () => {
    const state = stateWith({ type: "open", kind: "plan" });
    render(
      <RightPanelTabs
        state={state}
        dispatch={() => {}}
        maximized={false}
        onMaximize={() => {}}
        onNewTerminal={() => {}}
      />,
    );
    fireEvent.contextMenu(screen.getByRole("tab", { name: "Plan" }));
    const item = screen.getByRole("menuitem", { name: "Close others" });
    fireEvent.pointerDown(item);
    expect(screen.getByRole("menuitem", { name: "Close others" })).toBeTruthy();
  });

  it("closes the add-surface menu on Escape and on an outside press", () => {
    const { container } = render(
      <RightPanelTabs
        state={stateWith()}
        dispatch={() => {}}
        maximized={false}
        onMaximize={() => {}}
        onNewTerminal={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Add panel surface" }));
    expect(screen.getByRole("menuitem", { name: "Files" })).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menuitem", { name: "Files" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Add panel surface" }));
    expect(screen.getByRole("menuitem", { name: "Files" })).toBeTruthy();
    fireEvent.pointerDown(container.querySelector(".right-panel-tab-strip")!);
    expect(screen.queryByRole("menuitem", { name: "Files" })).toBeNull();
  });

  it("shows scroll buttons only when the strip overflows and scrolls on click", () => {
    const state = stateWith({ type: "open", kind: "changes" }, { type: "open", kind: "plan" });
    const { container } = render(
      <RightPanelTabs
        state={state}
        dispatch={() => {}}
        maximized={false}
        onMaximize={() => {}}
        onNewTerminal={() => {}}
      />,
    );
    const strip = container.querySelector<HTMLElement>(".right-panel-tab-strip")!;
    expect(screen.queryByRole("button", { name: "Scroll tabs left" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Scroll tabs right" })).toBeNull();

    Object.defineProperty(strip, "scrollWidth", { value: 400, configurable: true });
    Object.defineProperty(strip, "clientWidth", { value: 100, configurable: true });
    const scrollBy = vi.fn();
    (strip as unknown as { scrollBy: unknown }).scrollBy = scrollBy;
    fireEvent(window, new Event("resize"));

    fireEvent.click(screen.getByRole("button", { name: "Scroll tabs right" }));
    expect(scrollBy).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Scroll tabs left" }));
    expect(scrollBy).toHaveBeenCalledTimes(2);
  });

  it("adds a surface from the plus menu and queries files", () => {
    const dispatch = vi.fn();
    render(
      <RightPanelTabs
        state={stateWith()}
        dispatch={dispatch}
        maximized={false}
        onMaximize={() => {}}
        onNewTerminal={() => {}}
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
        onNewTerminal={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Maximize panel" }));
    expect(onMaximize).toHaveBeenCalled();
  });
});

describe("terminal tabs", () => {
  const id = "terminal:2f1a3c4d-5b6e-4f70-8a9b-0c1d2e3f4a5b";

  it("titles a terminal tab from the surface title", () => {
    expect(surfaceTitle({ id, kind: "terminal", title: "Terminal 7" })).toBe("Terminal 7");
  });

  it("offers Terminal in the add menu and calls onNewTerminal instead of dispatching", () => {
    const dispatch = vi.fn();
    const onNewTerminal = vi.fn();
    render(
      <RightPanelTabs
        state={stateWith()}
        dispatch={dispatch}
        maximized={false}
        onMaximize={() => {}}
        onNewTerminal={onNewTerminal}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Add panel surface" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Terminal" }));
    expect(onNewTerminal).toHaveBeenCalledTimes(1);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("still dispatches the singleton kinds", () => {
    const dispatch = vi.fn();
    render(
      <RightPanelTabs
        state={stateWith()}
        dispatch={dispatch}
        maximized={false}
        onMaximize={() => {}}
        onNewTerminal={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Add panel surface" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Plan" }));
    expect(dispatch).toHaveBeenCalledWith({ type: "open", kind: "plan" });
  });
});
