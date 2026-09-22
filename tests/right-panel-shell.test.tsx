// @vitest-environment jsdom
import type React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { RightPanel } from "../src/renderer/right-panel/RightPanel.tsx";
import { clampPanelWidth } from "../src/renderer/right-panel/persist.ts";
import { EMPTY_PANEL_STATE, panelReducer } from "../src/shared/right-panel.ts";
import type { RelayBridge } from "../src/renderer/env.d.ts";

beforeEach(() => {
  window.relay = {
    readFile: async () => ({
      path: "src/a.ts",
      text: "",
      truncated: false,
      binary: false,
    }),
  } as unknown as RelayBridge;
});

afterEach(() => {
  cleanup();
  delete (window as { relay?: unknown }).relay;
});

function props(
  actions: Parameters<typeof panelReducer>[1][],
  overrides: Partial<React.ComponentProps<typeof RightPanel>> = {},
) {
  const state = actions.reduce(panelReducer, EMPTY_PANEL_STATE);
  return {
    sessionId: "s1",
    cwd: "/repo",
    state,
    dispatch: vi.fn(),
    width: 540,
    setWidth: vi.fn(),
    changes: null,
    changesLoading: false,
    changesError: null,
    onRefreshChanges: vi.fn(),
    planEntries: [],
    onOpenInEditor: vi.fn(),
    ...overrides,
  };
}

describe("RightPanel", () => {
  it("renders nothing while closed", () => {
    const { container } = render(<RightPanel {...props([])} />);
    expect(container.querySelector(".right-panel")).toBeNull();
  });

  it("renders the active surface", () => {
    render(<RightPanel {...props([{ type: "open", kind: "changes" }])} />);
    expect(screen.getByText("No repository in this folder")).toBeTruthy();
  });

  it("switches surfaces when the active id changes", () => {
    render(
      <RightPanel
        {...props([
          { type: "open", kind: "files" },
          { type: "openFile", path: "src/a.ts" },
        ])}
      />,
    );
    expect(screen.getByRole("tab", { name: /a.ts/ })).toBeTruthy();
  });

  it("links the active tab and the tabpanel by id", () => {
    render(<RightPanel {...props([{ type: "open", kind: "changes" }])} />);
    const tab = screen.getByRole("tab", { name: "Changes" });
    const panel = screen.getByRole("tabpanel");
    expect(tab.getAttribute("aria-controls")).toBe(panel.id);
    expect(panel.getAttribute("aria-labelledby")).toBe(tab.id);
  });

  it("resizes with the handle and persists the dragged width on release", () => {
    const setWidth = vi.fn();
    render(
      <RightPanel {...props([{ type: "open", kind: "changes" }], { setWidth })} />,
    );
    const handle = screen.getByRole("separator", { name: "Resize panel" });
    fireEvent.pointerDown(handle, { clientX: 900, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientX: 800, pointerId: 1 });
    fireEvent.pointerUp(handle, { clientX: 800, pointerId: 1 });
    const expected = clampPanelWidth(540 - (800 - 900), window.innerWidth, 0);
    expect(setWidth.mock.calls).toEqual([[expected], [expected, true]]);
  });

  it("maximizes from the tab strip", () => {
    const { container } = render(
      <RightPanel {...props([{ type: "open", kind: "changes" }])} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Maximize panel" }));
    expect(container.querySelector(".right-panel.maximized")).toBeTruthy();
  });

  it("overlays when the container can no longer hold the panel and the chat minimum", async () => {
    const { container } = render(
      <div>
        <RightPanel {...props([{ type: "open", kind: "changes" }])} />
      </div>,
    );
    expect(container.querySelector(".right-panel.overlay")).toBeNull();
    const scope = container.firstElementChild as HTMLElement;
    Object.defineProperty(scope, "clientWidth", {
      value: 700,
      configurable: true,
    });
    fireEvent(window, new Event("resize"));
    await waitFor(() =>
      expect(container.querySelector(".right-panel.overlay")).toBeTruthy(),
    );
  });
});
