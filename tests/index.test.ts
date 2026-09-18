import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RelayState } from "../src/shared/ipc.ts";
import { openStore } from "../src/main/db.ts";

const h = vi.hoisted(() => ({
  userData: "",
  version: "9.9.9",
  handlers: new Map<string, (...args: unknown[]) => unknown>(),
  nativeTheme: {
    themeSource: "system" as "system" | "light" | "dark",
    shouldUseDarkColors: false,
    onUpdated: undefined as (() => void) | undefined,
    on: (event: string, listener: () => void) => {
      if (event === "updated") h.nativeTheme.onUpdated = listener;
    },
  },
  backgrounds: [] as string[],
  windows: [] as unknown[],
  windowOptions: [] as Array<Record<string, unknown>>,
  workArea: { x: 0, y: 0, width: 1920, height: 1080 },
}));

vi.mock("electron", () => {
  class BrowserWindow {
    options: Record<string, unknown>;
    webContents = { send: () => {} };
    bounds = { x: 0, y: 0, width: 0, height: 0 };
    normalBounds = { x: 0, y: 0, width: 0, height: 0 };
    private maximized = false;
    private listeners = new Map<string, Array<(...args: unknown[]) => void>>();
    constructor(options?: Record<string, unknown>) {
      this.options = options ?? {};
      h.windowOptions.push(this.options);
      h.backgrounds.push(String(options?.backgroundColor ?? ""));
      h.windows.push(this);
    }
    getBounds() {
      return this.bounds;
    }
    getNormalBounds() {
      return this.normalBounds;
    }
    isMaximized() {
      return this.maximized;
    }
    on(event: string, listener: (...args: unknown[]) => void) {
      const current = this.listeners.get(event) ?? [];
      current.push(listener);
      this.listeners.set(event, current);
      return this;
    }
    emit(event: string) {
      for (const listener of this.listeners.get(event) ?? []) listener();
    }
    setBackgroundColor(color: string) {
      h.backgrounds.push(color);
    }
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
    maximize() {
      this.maximized = true;
      this.emit("maximize");
    }
    unmaximize() {
      this.maximized = false;
      this.emit("unmaximize");
    }
    close() {
      this.emit("close");
    }
    static getAllWindows() {
      return h.windows;
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
    nativeTheme: h.nativeTheme,
    screen: {
      getPrimaryDisplay: () => ({ workArea: { ...h.workArea } }),
    },
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

describe("main appearance wiring", () => {
  it("drives the native theme source and window background from the stored theme", async () => {
    h.userData = mkdtempSync(join(tmpdir(), "relay-index-"));
    await import("../src/main/index.ts");

    const setSetting = await waitFor(() => h.handlers.get("relay:setSetting"));
    setSetting({}, "theme", "dark");
    expect(h.nativeTheme.themeSource).toBe("dark");
    expect(h.backgrounds.at(-1)).toBe("#181818");

    setSetting({}, "theme", "light");
    expect(h.nativeTheme.themeSource).toBe("light");
    expect(h.backgrounds.at(-1)).toBe("#F4F4F2");
  });

  it("re-applies the system background when the OS theme changes", async () => {
    h.userData = mkdtempSync(join(tmpdir(), "relay-index-"));
    await import("../src/main/index.ts");

    const setSetting = await waitFor(() => h.handlers.get("relay:setSetting"));
    const onUpdated = await waitFor(() => h.nativeTheme.onUpdated);

    h.nativeTheme.shouldUseDarkColors = false;
    setSetting({}, "theme", "system");
    expect(h.backgrounds.at(-1)).toBe("#F4F4F2");

    h.nativeTheme.shouldUseDarkColors = true;
    onUpdated();
    expect(h.backgrounds.at(-1)).toBe("#181818");
  });

  it("does not switch an explicit background when the OS theme changes", async () => {
    h.userData = mkdtempSync(join(tmpdir(), "relay-index-"));
    await import("../src/main/index.ts");

    const setSetting = await waitFor(() => h.handlers.get("relay:setSetting"));
    const onUpdated = await waitFor(() => h.nativeTheme.onUpdated);

    setSetting({}, "theme", "dark");
    const afterDark = h.backgrounds.length;
    h.nativeTheme.shouldUseDarkColors = false;
    onUpdated();
    expect(h.backgrounds.length).toBe(afterDark);
    expect(h.backgrounds.at(-1)).toBe("#181818");

    setSetting({}, "theme", "light");
    const afterLight = h.backgrounds.length;
    h.nativeTheme.shouldUseDarkColors = true;
    onUpdated();
    expect(h.backgrounds.length).toBe(afterLight);
    expect(h.backgrounds.at(-1)).toBe("#F4F4F2");
  });
});

type TestWindow = {
  options: Record<string, unknown>;
  bounds: { x: number; y: number; width: number; height: number };
  normalBounds: { x: number; y: number; width: number; height: number };
  isMaximized: () => boolean;
  maximize: () => void;
  unmaximize: () => void;
  emit: (event: string) => void;
};

async function seedWindowState(userData: string, value: string): Promise<void> {
  const store = await openStore(join(userData, "relay.db"));
  store.setSetting("windowState", value);
}

async function readWindowState(userData: string): Promise<string | null> {
  const store = await openStore(join(userData, "relay.db"));
  return store.getSetting("windowState");
}

async function startWindow(userData: string, stored?: string): Promise<TestWindow> {
  vi.resetModules();
  if (stored !== undefined) await seedWindowState(userData, stored);
  const index = h.windowOptions.length;
  await import("../src/main/index.ts");
  await waitFor(() => h.windowOptions[index]);
  return h.windows[index] as TestWindow;
}

describe("main window state persistence", () => {
  beforeEach(() => {
    h.workArea = { x: 0, y: 0, width: 1920, height: 1080 };
  });

  it("restores stored position and size into the new window options", async () => {
    h.userData = mkdtempSync(join(tmpdir(), "relay-index-"));
    const win = await startWindow(
      h.userData,
      '{"x":100,"y":80,"width":900,"height":700}',
    );
    expect(win.options.x).toBe(100);
    expect(win.options.y).toBe(80);
    expect(win.options.width).toBe(900);
    expect(win.options.height).toBe(700);
    expect(win.options.minWidth).toBe(800);
    expect(win.options.minHeight).toBe(520);
    expect(win.options.title).toBe("Relay");
  });

  it("falls back to default bounds when the stored state is invalid", async () => {
    h.userData = mkdtempSync(join(tmpdir(), "relay-index-"));
    const win = await startWindow(h.userData, "{ not json");
    expect(win.options.width).toBe(1200);
    expect(win.options.height).toBe(800);
    expect("x" in win.options).toBe(false);
    expect("y" in win.options).toBe(false);
  });

  it("restores a maximized window", async () => {
    h.userData = mkdtempSync(join(tmpdir(), "relay-index-"));
    const win = await startWindow(
      h.userData,
      '{"width":900,"height":700,"maximized":true}',
    );
    expect(win.isMaximized()).toBe(true);
  });

  it("clamps restored bounds to the primary work area", async () => {
    h.userData = mkdtempSync(join(tmpdir(), "relay-index-"));
    h.workArea = { x: 0, y: 0, width: 1000, height: 800 };
    const win = await startWindow(
      h.userData,
      '{"x":5000,"y":5000,"width":4000,"height":3000}',
    );
    expect(win.options.x).toBe(0);
    expect(win.options.y).toBe(0);
    expect(win.options.width).toBe(1000);
    expect(win.options.height).toBe(800);
  });

  it("persists debounced bounds after a resize", async () => {
    h.userData = mkdtempSync(join(tmpdir(), "relay-index-"));
    const win = await startWindow(h.userData, '{"width":900,"height":700}');
    win.bounds = { x: 30, y: 40, width: 1111, height: 777 };
    win.emit("resize");
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(JSON.parse((await readWindowState(h.userData))!)).toEqual({
      x: 30,
      y: 40,
      width: 1111,
      height: 777,
      maximized: false,
    });
  });

  it("persists debounced bounds after a move", async () => {
    h.userData = mkdtempSync(join(tmpdir(), "relay-index-"));
    const win = await startWindow(h.userData, '{"width":900,"height":700}');
    win.bounds = { x: 50, y: 60, width: 905, height: 605 };
    win.emit("move");
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(JSON.parse((await readWindowState(h.userData))!)).toEqual({
      x: 50,
      y: 60,
      width: 905,
      height: 605,
      maximized: false,
    });
  });

  it("persists normal bounds and the maximized flag on maximize", async () => {
    h.userData = mkdtempSync(join(tmpdir(), "relay-index-"));
    const win = await startWindow(h.userData, '{"width":900,"height":700}');
    win.normalBounds = { x: 5, y: 6, width: 901, height: 601 };
    win.maximize();
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(JSON.parse((await readWindowState(h.userData))!)).toEqual({
      x: 5,
      y: 6,
      width: 901,
      height: 601,
      maximized: true,
    });
  });

  it("persists the unmaximized state on unmaximize", async () => {
    h.userData = mkdtempSync(join(tmpdir(), "relay-index-"));
    const win = await startWindow(h.userData, '{"width":900,"height":700}');
    win.maximize();
    win.bounds = { x: 7, y: 8, width: 902, height: 602 };
    win.unmaximize();
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(JSON.parse((await readWindowState(h.userData))!)).toEqual({
      x: 7,
      y: 8,
      width: 902,
      height: 602,
      maximized: false,
    });
  });

  it("flushes the current bounds immediately on close", async () => {
    h.userData = mkdtempSync(join(tmpdir(), "relay-index-"));
    const win = await startWindow(h.userData, '{"width":900,"height":700}');
    win.bounds = { x: 11, y: 12, width: 903, height: 603 };
    win.emit("close");
    expect(JSON.parse((await readWindowState(h.userData))!)).toEqual({
      x: 11,
      y: 12,
      width: 903,
      height: 603,
      maximized: false,
    });
  });
});
