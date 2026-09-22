// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { EMPTY_PANEL_STATE, panelReducer } from "../src/shared/right-panel.ts";
import { usePanelStore } from "../src/renderer/right-panel/usePanelStore.ts";

afterEach(cleanup);

const A = "terminal:11111111-1111-4111-8111-111111111111";
const B = "terminal:22222222-2222-4222-8222-222222222222";

function Probe({ close }: { close: (id: string) => void }) {
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

describe("usePanelStore terminal teardown", () => {
  it("closes the pty of every terminal surface removed by an action", async () => {
    const close = vi.fn();
    render(<Probe close={close} />);
    screen.getByRole("button", { name: "run" }).click();
    expect(close).toHaveBeenCalledWith(A);
    expect(close).not.toHaveBeenCalledWith(B);
  });
});

describe("right panel reducer sanity", () => {
  it("keeps the empty state reachable", () => {
    expect(panelReducer(EMPTY_PANEL_STATE, { type: "closeAll" })).toEqual(EMPTY_PANEL_STATE);
  });
});
