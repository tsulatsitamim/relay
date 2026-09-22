// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import type { TerminalEvent } from "../src/shared/terminal.ts";

type KeyEventLike = { metaKey: boolean; key: string };

const mocks = vi.hoisted(() => {
  const terminal = {
    write: vi.fn(),
    reset: vi.fn(),
    focus: vi.fn(),
    dispose: vi.fn(),
    open: vi.fn(),
    loadAddon: vi.fn(),
    attachCustomKeyEventHandler: vi.fn((_handler: (event: KeyEventLike) => boolean) => {}),
    onData: vi.fn((_listener: (data: string) => void) => ({ dispose: vi.fn() })),
    onResize: vi.fn(
      (_listener: (size: { cols: number; rows: number }) => void) => ({ dispose: vi.fn() }),
    ),
    options: {} as Record<string, unknown>,
  };
  return { terminal, fit: { fit: vi.fn() } };
});

vi.mock("@xterm/xterm", () => ({
  Terminal: class {
    constructor() {
      Object.assign(this, mocks.terminal);
    }
  },
}));

vi.mock("@xterm/addon-fit", () => ({
  FitAddon: class {
    constructor() {
      Object.assign(this, mocks.fit);
    }
  },
}));

import { PanelTerminal } from "../src/renderer/right-panel/PanelTerminal.tsx";

const ID = "terminal:2f1a3c4d-5b6e-4f70-8a9b-0c1d2e3f4a5b";

function bridge(overrides: Record<string, unknown> = {}) {
  const handlers: Array<(event: TerminalEvent) => void> = [];
  const api = {
    create: vi.fn(async () => ({ terminalId: ID, title: "Terminal 1" })),
    attach: vi.fn(async () => ({
      ok: true as const,
      data: "replayed",
      exited: false,
      exitCode: null,
      signal: null,
    })),
    write: vi.fn(async () => {}),
    resize: vi.fn(async () => {}),
    close: vi.fn(async () => {}),
    restart: vi.fn(async () => {}),
    onEvent: vi.fn((listener: (event: TerminalEvent) => void) => {
      handlers.push(listener);
      return () => {};
    }),
    ...overrides,
  };
  (window as unknown as { relay: unknown }).relay = { terminal: api };
  return { api, emit: (event: TerminalEvent) => handlers.forEach((h) => h(event)) };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.terminal.options = {};
});

afterEach(cleanup);

describe("PanelTerminal", () => {
  it("attaches on mount, writes the replay and focuses", async () => {
    const { api } = bridge();
    render(
      <PanelTerminal terminalId={ID} onStartNew={() => {}} onCloseSelf={() => {}} />,
    );
    await waitFor(() => expect(api.attach).toHaveBeenCalledWith(ID));
    await waitFor(() => expect(mocks.terminal.write).toHaveBeenCalledWith("replayed"));
    expect(mocks.terminal.focus).toHaveBeenCalled();
  });

  it("routes events by terminal id", async () => {
    const { emit } = bridge();
    render(
      <PanelTerminal terminalId={ID} onStartNew={() => {}} onCloseSelf={() => {}} />,
    );
    await waitFor(() => expect(mocks.terminal.write).toHaveBeenCalledWith("replayed"));
    mocks.terminal.write.mockClear();
    emit({ type: "terminalData", terminalId: "terminal:other", data: "nope" });
    expect(mocks.terminal.write).not.toHaveBeenCalled();
    emit({ type: "terminalData", terminalId: ID, data: "yes" });
    expect(mocks.terminal.write).toHaveBeenCalledWith("yes");
  });

  it("sends writes and resizes to main", async () => {
    const { api } = bridge();
    render(
      <PanelTerminal terminalId={ID} onStartNew={() => {}} onCloseSelf={() => {}} />,
    );
    const onData = mocks.terminal.onData.mock.calls[0]![0] as (data: string) => void;
    onData("ls\r");
    expect(api.write).toHaveBeenCalledWith(ID, "ls\r");
    const onResize = mocks.terminal.onResize.mock.calls[0]![0] as (size: {
      cols: number;
      rows: number;
    }) => void;
    onResize({ cols: 100, rows: 40 });
    expect(api.resize).toHaveBeenCalledWith(ID, 100, 40);
  });

  it("keeps ⌘-combos with the app but lets ⌘C and ⌘V reach xterm", async () => {
    bridge();
    render(
      <PanelTerminal terminalId={ID} onStartNew={() => {}} onCloseSelf={() => {}} />,
    );
    const handler = mocks.terminal.attachCustomKeyEventHandler.mock.calls[0]![0];
    expect(handler({ metaKey: false, key: "c" })).toBe(true);
    expect(handler({ metaKey: true, key: "k" })).toBe(false);
    expect(handler({ metaKey: true, key: "c" })).toBe(true);
    expect(handler({ metaKey: true, key: "v" })).toBe(true);
  });

  it("shows the exit footer, restarts, and clears it on reset", async () => {
    const { api, emit } = bridge();
    render(
      <PanelTerminal terminalId={ID} onStartNew={() => {}} onCloseSelf={() => {}} />,
    );
    await waitFor(() => expect(api.attach).toHaveBeenCalled());
    emit({ type: "terminalExit", terminalId: ID, exitCode: 130, signal: null });
    expect(await screen.findByText("[process exited with code 130]")).toBeTruthy();
    screen.getByRole("button", { name: "Restart" }).click();
    expect(api.restart).toHaveBeenCalledWith(ID);
    emit({ type: "terminalReset", terminalId: ID });
    await waitFor(() =>
      expect(screen.queryByText("[process exited with code 130]")).toBeNull(),
    );
  });

  it("offers a new terminal when the restored terminal is gone", async () => {
    const onStartNew = vi.fn();
    const onCloseSelf = vi.fn();
    bridge({ attach: vi.fn(async () => ({ ok: false as const, reason: "missing" })) });
    render(
      <PanelTerminal terminalId={ID} onStartNew={onStartNew} onCloseSelf={onCloseSelf} />,
    );
    expect(
      await screen.findByText(/no longer running/),
    ).toBeTruthy();
    screen.getByRole("button", { name: "Start a new terminal" }).click();
    expect(onCloseSelf).toHaveBeenCalled();
    expect(onStartNew).toHaveBeenCalled();
  });

  it("reports an attach failure as a panel notice", async () => {
    bridge({
      attach: vi.fn(async () => {
        throw new Error("terminal bridge unavailable");
      }),
    });
    render(
      <PanelTerminal terminalId={ID} onStartNew={() => {}} onCloseSelf={() => {}} />,
    );
    expect(await screen.findByText("terminal bridge unavailable")).toBeTruthy();
  });
});
