// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { usePanelStore } from "../src/renderer/right-panel/usePanelStore.ts";

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

function Probe({ sessionId }: { sessionId: string }) {
  const { state, dispatch, width, setWidth, removeSession } = usePanelStore(sessionId);
  return (
    <div>
      <span data-testid="open">{state.isOpen ? "open" : "closed"}</span>
      <span data-testid="active">{state.activeSurfaceId ?? "none"}</span>
      <span data-testid="count">{state.surfaces.length}</span>
      <span data-testid="width">{width}</span>
      <button type="button" onClick={() => dispatch({ type: "open", kind: "changes" })}>
        changes
      </button>
      <button type="button" onClick={() => dispatch({ type: "openFile", path: "src/a.ts", line: 9 })}>
        file
      </button>
      <button type="button" onClick={() => dispatch({ type: "closeAll" })}>
        close
      </button>
      <button type="button" onClick={() => setWidth(611, true)}>
        resize
      </button>
      <button type="button" onClick={() => removeSession(sessionId)}>
        remove
      </button>
    </div>
  );
}

describe("usePanelStore", () => {
  it("keeps panel state per session and persists it", () => {
    const { rerender } = render(<Probe sessionId="s1" />);
    fireEvent.click(screen.getByText("changes"));
    expect(screen.getByTestId("active").textContent).toBe("changes");

    rerender(<Probe sessionId="s2" />);
    expect(screen.getByTestId("open").textContent).toBe("closed");
    expect(screen.getByTestId("count").textContent).toBe("0");

    rerender(<Probe sessionId="s1" />);
    expect(screen.getByTestId("open").textContent).toBe("open");
    expect(window.localStorage.getItem("relay.rightPanel")).toContain("changes");
  });

  it("drops the stored entry when every surface closes", () => {
    render(<Probe sessionId="s1" />);
    fireEvent.click(screen.getByText("file"));
    fireEvent.click(screen.getByText("close"));
    expect(screen.getByTestId("count").textContent).toBe("0");
    expect(window.localStorage.getItem("relay.rightPanel")).not.toContain("s1");
  });

  it("persists the width only when asked", () => {
    render(<Probe sessionId="s1" />);
    expect(screen.getByTestId("width").textContent).toBe("540");
    fireEvent.click(screen.getByText("resize"));
    expect(screen.getByTestId("width").textContent).toBe("611");
    expect(window.localStorage.getItem("relay.rightPanelWidth:s1")).toBe("611");
  });

  it("prunes a deleted session's panel state and width", () => {
    render(<Probe sessionId="s1" />);
    fireEvent.click(screen.getByText("changes"));
    fireEvent.click(screen.getByText("resize"));
    expect(window.localStorage.getItem("relay.rightPanelWidth:s1")).toBe("611");
    fireEvent.click(screen.getByText("remove"));
    expect(screen.getByTestId("count").textContent).toBe("0");
    expect(window.localStorage.getItem("relay.rightPanel")).not.toContain("s1");
    expect(window.localStorage.getItem("relay.rightPanelWidth:s1")).toBeNull();
  });

  it("does not overwrite stored panels when the initial read fails", () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    const getItem = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    try {
      render(<Probe sessionId="s1" />);
      expect(setItem).not.toHaveBeenCalled();
      fireEvent.click(screen.getByText("changes"));
      expect(setItem).toHaveBeenCalledTimes(1);
    } finally {
      getItem.mockRestore();
      setItem.mockRestore();
    }
  });

  it("falls back to in-memory state when storage throws", () => {
    const getItem = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("denied");
    });
    try {
      render(<Probe sessionId="s1" />);
      fireEvent.click(screen.getByText("changes"));
      expect(screen.getByTestId("open").textContent).toBe("open");
      expect(screen.getByTestId("count").textContent).toBe("1");
      fireEvent.click(screen.getByText("resize"));
      expect(screen.getByTestId("width").textContent).toBe("611");
    } finally {
      getItem.mockRestore();
      setItem.mockRestore();
    }
  });
});
