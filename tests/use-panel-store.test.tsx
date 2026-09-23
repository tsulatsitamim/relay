// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { EMPTY_PANEL_STATE, panelReducer, type RightPanelSurface } from "../src/shared/right-panel.ts";
import { defaultCloseSurface, usePanelStore } from "../src/renderer/right-panel/usePanelStore.ts";

afterEach(cleanup);

const A = "terminal:11111111-1111-4111-8111-111111111111";
const B = "terminal:22222222-2222-4222-8222-222222222222";

function Probe({ close }: { close: (surface: RightPanelSurface) => void }) {
  const store = usePanelStore("s1", close);
  return (
    <button
      type="button"
      onClick={() => {
        store.dispatch({ type: "openTerminal", id: A, title: "Terminal 1" });
        store.dispatch({ type: "openTerminal", id: B, title: "Terminal 2" });
        store.dispatch({ type: "close", id: A });
      }}
    >
      run
    </button>
  );
}

function PreviewProbe({ close, id }: { close: (surface: RightPanelSurface) => void; id: string }) {
  const store = usePanelStore("s1", close);
  return (
    <button
      type="button"
      onClick={() => {
        store.dispatch({
          type: "openPreview",
          id: id as `preview:${string}`,
          title: "localhost:5173",
          url: "http://localhost:5173/",
        });
        store.dispatch({ type: "close", id });
      }}
    >
      run-preview
    </button>
  );
}

describe("usePanelStore terminal teardown", () => {
  it("closes the pty of every terminal surface removed by an action", async () => {
    const close = vi.fn();
    render(<Probe close={close} />);
    screen.getByRole("button", { name: "run" }).click();
    expect(close).toHaveBeenCalledWith(expect.objectContaining({ id: A, kind: "terminal" }));
    expect(close).not.toHaveBeenCalledWith(expect.objectContaining({ id: B }));
  });
});

describe("defaultCloseSurface", () => {
  it("routes each kind to its own channel", () => {
    const terminalClose = vi.fn();
    const previewClose = vi.fn();
    (window as unknown as { relay: unknown }).relay = {
      terminal: { close: terminalClose },
      preview: { close: previewClose },
    };
    defaultCloseSurface({
      id: "terminal:11111111-1111-4111-8111-111111111111",
      kind: "terminal",
      title: "Terminal 1",
    });
    defaultCloseSurface({
      id: "preview:22222222-2222-4222-8222-222222222222",
      kind: "preview",
      title: "localhost:5173",
      url: "http://localhost:5173/",
    });
    defaultCloseSurface({ id: "plan", kind: "plan" });
    expect(terminalClose).toHaveBeenCalledWith("terminal:11111111-1111-4111-8111-111111111111");
    expect(previewClose).toHaveBeenCalledWith("preview:22222222-2222-4222-8222-222222222222");
  });
});

describe("usePanelStore preview teardown", () => {
  it("closes the view of every preview surface removed by an action", async () => {
    const close = vi.fn();
    const id = "preview:22222222-2222-4222-8222-222222222222";
    render(<PreviewProbe close={close} id={id} />);
    screen.getByRole("button", { name: "run-preview" }).click();
    expect(close).toHaveBeenCalledWith(
      expect.objectContaining({ id, kind: "preview" }),
    );
  });
});

describe("right panel reducer sanity", () => {
  it("keeps the empty state reachable", () => {
    expect(panelReducer(EMPTY_PANEL_STATE, { type: "closeAll" })).toEqual(EMPTY_PANEL_STATE);
  });
});
