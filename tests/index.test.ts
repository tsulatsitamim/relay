import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { RelayState } from "../src/shared/ipc.ts";

const h = vi.hoisted(() => ({
  userData: "",
  version: "9.9.9",
  handlers: new Map<string, (...args: unknown[]) => unknown>(),
}));

vi.mock("electron", () => {
  class BrowserWindow {
    webContents = { send: () => {} };
    isDestroyed() {
      return false;
    }
    isFocused() {
      return false;
    }
    isMinimized() {
      return false;
    }
    loadURL() {}
    loadFile() {}
    setWindowButtonVisibility() {}
    show() {}
    focus() {}
    restore() {}
    minimize() {}
    maximize() {}
    unmaximize() {}
    close() {}
    static getAllWindows() {
      return [];
    }
    static fromWebContents() {
      return null;
    }
    static getFocusedWindow() {
      return null;
    }
  }
  return {
    app: {
      whenReady: () => Promise.resolve(),
      getPath: () => h.userData,
      getVersion: () => h.version,
      on: () => {},
      quit: () => {},
      exit: () => {},
    },
    BrowserWindow,
    Notification: class {
      static isSupported() {
        return false;
      }
      on() {}
      show() {}
    },
    dialog: { showOpenDialog: async () => ({ canceled: true, filePaths: [] }) },
    ipcMain: {
      handle: (channel: string, fn: (...args: unknown[]) => unknown) => {
        h.handlers.set(channel, fn);
      },
    },
    clipboard: { writeText: () => {} },
    shell: { openPath: async () => "" },
  };
});

async function waitFor<T>(get: () => T | undefined, timeoutMs = 10_000): Promise<T> {
  const started = Date.now();
  for (;;) {
    const value = get();
    if (value !== undefined) return value;
    if (Date.now() - started > timeoutMs) throw new Error("timed out waiting");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

describe("main relay:getState", () => {
  it("includes the recorded agent defaults keyed by working directory", async () => {
    h.userData = mkdtempSync(join(tmpdir(), "relay-index-"));
    await import("../src/main/index.ts");

    const getState = await waitFor(() => h.handlers.get("relay:getState"));
    const state = getState() as RelayState;
    expect(state).toHaveProperty("agentDefaults");
    expect(state.agentDefaults).toEqual({});
  });

  it("exposes provider CRUD and settings handlers and reports settings plus about", async () => {
    h.userData = mkdtempSync(join(tmpdir(), "relay-index-"));
    await import("../src/main/index.ts");

    const getState = await waitFor(() => h.handlers.get("relay:getState"));
    const setSetting = await waitFor(() => h.handlers.get("relay:setSetting"));
    expect(h.handlers.has("relay:saveAgent")).toBe(true);
    expect(h.handlers.has("relay:deleteAgent")).toBe(true);

    let state = getState() as RelayState;
    expect(state.settings).toEqual({});
    expect(state.about.version).toBe(h.version);
    expect(state.about.dataPath).toContain("relay.db");

    setSetting({}, "defaultAgentId", "a1");
    state = getState() as RelayState;
    expect(state.settings.defaultAgentId).toBe("a1");
  });

  it("reports diff comments in state and registers their handlers", async () => {
    h.userData = mkdtempSync(join(tmpdir(), "relay-index-"));
    await import("../src/main/index.ts");

    const getState = await waitFor(() => h.handlers.get("relay:getState"));
    const state = getState() as RelayState;
    expect(state.diffComments).toEqual({});
    expect(h.handlers.has("relay:addDiffComment")).toBe(true);
    expect(h.handlers.has("relay:deleteDiffComment")).toBe(true);
    expect(h.handlers.has("relay:markDiffCommentsSent")).toBe(true);

    const add = h.handlers.get("relay:addDiffComment")!;
    expect(() =>
      add({}, "missing", {
        eventId: "e1",
        path: "a.ts",
        startLine: 1,
        endLine: 1,
        body: "note",
      }),
    ).toThrow();
  });
});
