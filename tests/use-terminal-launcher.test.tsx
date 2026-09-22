// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, renderHook, act, waitFor } from "@testing-library/react";
import { useTerminalLauncher } from "../src/renderer/right-panel/useTerminalLauncher.ts";

afterEach(cleanup);

const ID = "terminal:2f1a3c4d-5b6e-4f70-8a9b-0c1d2e3f4a5b";

function bridge(create: () => Promise<unknown>) {
  const api = {
    create: vi.fn(create),
    attach: vi.fn(),
    write: vi.fn(),
    resize: vi.fn(),
    close: vi.fn(),
    restart: vi.fn(),
    onEvent: vi.fn(() => () => {}),
  };
  (window as unknown as { relay: unknown }).relay = { terminal: api };
  return api;
}

describe("useTerminalLauncher", () => {
  it("opens a tab for the created terminal", async () => {
    const api = bridge(async () => ({ terminalId: ID, title: "Terminal 1" }));
    const dispatch = vi.fn();
    const { result } = renderHook(() => useTerminalLauncher("s1", dispatch));
    await act(async () => {
      await result.current.launch();
    });
    expect(api.create).toHaveBeenCalledWith("s1", 80, 24);
    expect(dispatch).toHaveBeenCalledWith({
      type: "openTerminal",
      id: ID,
      title: "Terminal 1",
    });
    expect(result.current.error).toBeNull();
  });

  it("reports a failed create instead of opening a tab", async () => {
    bridge(async () => {
      throw new Error("/bin/zsh is missing");
    });
    const dispatch = vi.fn();
    const { result } = renderHook(() => useTerminalLauncher("s1", dispatch));
    await act(async () => {
      await result.current.launch();
    });
    await waitFor(() => expect(result.current.error).toBe("/bin/zsh is missing"));
    expect(dispatch).not.toHaveBeenCalled();
  });
});
