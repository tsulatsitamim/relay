import { mkdtempSync, readFileSync } from "node:fs";
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
  errorBoxes: [] as Array<{ title: string; content: string }>,
  appListeners: new Map<string, Array<(...args: unknown[]) => void>>(),
  workArea: { x: 0, y: 0, width: 1920, height: 1080 },
  singleInstanceLock: true,
  quitCalls: 0,
  menuTemplates: [] as unknown[],
  appMenu: undefined as unknown,
  isPackaged: false,
}));

vi.mock("electron", () => {
  class BrowserWindow {
    options: Record<string, unknown>;
    webContents = { send: () => {} };
    bounds = { x: 0, y: 0, width: 0, height: 0 };
    normalBounds = { x: 0, y: 0, width: 0, height: 0 };
    minimized = false;
    restoreCalls = 0;
    showCalls = 0;
    focusCalls = 0;
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
      return this.minimized;
    }
    loadURL() {}
    loadFile() {}
    setWindowButtonVisibility() {}
    show() {
      this.showCalls += 1;
    }
    focus() {
      this.focusCalls += 1;
    }
    restore() {
      this.restoreCalls += 1;
      this.minimized = false;
    }
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
      get isPackaged() {
        return h.isPackaged;
      },
      requestSingleInstanceLock: () => h.singleInstanceLock,
      on: (event: string, listener: (...args: unknown[]) => void) => {
        const current = h.appListeners.get(event) ?? [];
        current.push(listener);
        h.appListeners.set(event, current);
      },
      quit: () => {
        h.quitCalls += 1;
      },
      exit: () => {},
    },
    Menu: {
      buildFromTemplate: (template: unknown) => {
        h.menuTemplates.push(template);
        return template;
      },
      setApplicationMenu: (menu: unknown) => {
        h.appMenu = menu;
      },
    },
    BrowserWindow,
    Notification: class {
      static isSupported() {
        return false;
      }
      on() {}
      show() {}
    },
    dialog: {
      showOpenDialog: async () => ({ canceled: true, filePaths: [] }),
      showErrorBox: (title: string, content: string) => {
        h.errorBoxes.push({ title, content });
      },
    },
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

  it("registers the set-mcp-servers handler and reports them in state", async () => {
    h.userData = mkdtempSync(join(tmpdir(), "relay-index-"));
    await import("../src/main/index.ts");

    const getState = await waitFor(() => h.handlers.get("relay:getState"));
    const setMcpServers = h.handlers.get("relay:setMcpServers");
    expect(setMcpServers).toBeTruthy();

    let state = getState() as RelayState;
    expect(state.mcpServers).toEqual([]);

    const saved = setMcpServers!({}, [
      { kind: "stdio", name: " fs ", command: " npx ", args: ["-y"], env: [] },
      { kind: "bogus", name: "x", command: "y" },
    ]);
    expect(saved).toEqual([
      { kind: "stdio", name: "fs", command: "npx", args: ["-y"], env: [] },
    ]);

    state = getState() as RelayState;
    expect(state.mcpServers).toEqual(saved);
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

  it("registers the set-config-option handler and routes it to the manager", async () => {
    h.userData = mkdtempSync(join(tmpdir(), "relay-index-"));
    await import("../src/main/index.ts");

    await waitFor(() => h.handlers.get("relay:getState"));
    const setConfigOption = h.handlers.get("relay:setConfigOption");
    expect(setConfigOption).toBeTruthy();
    await expect(
      setConfigOption!({}, "missing", "effort", "high"),
    ).rejects.toThrow(/unknown session/);
  });

  it("registers the authenticate handler and routes it to the manager", async () => {
    h.userData = mkdtempSync(join(tmpdir(), "relay-index-"));
    await import("../src/main/index.ts");

    await waitFor(() => h.handlers.get("relay:getState"));
    const authenticate = h.handlers.get("relay:authenticate");
    expect(authenticate).toBeTruthy();
    await expect(
      authenticate!({}, "missing", "fake-login"),
    ).rejects.toThrow(/unknown session/);
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
  store.flushNow();
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
    await new Promise((resolve) => setTimeout(resolve, 800));
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
    await new Promise((resolve) => setTimeout(resolve, 800));
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
    await new Promise((resolve) => setTimeout(resolve, 800));
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
    await new Promise((resolve) => setTimeout(resolve, 800));
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
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(JSON.parse((await readWindowState(h.userData))!)).toEqual({
      x: 11,
      y: 12,
      width: 903,
      height: 603,
      maximized: false,
    });
  });
});

describe("main crash handlers", () => {
  it("logs and shows exactly one error box for repeated uncaught exceptions", async () => {
    h.userData = mkdtempSync(join(tmpdir(), "relay-index-"));
    const baseline = process.listeners("uncaughtException").length;
    vi.resetModules();
    await import("../src/main/index.ts");
    const handler = await waitFor(() => {
      const list = process.listeners("uncaughtException");
      return list.length > baseline
        ? (list.at(-1) as (err: unknown) => void)
        : undefined;
    });

    const boxesBefore = h.errorBoxes.length;
    handler(new Error("boom-one"));
    handler(new Error("boom-two"));

    const entries = readFileSync(join(h.userData, "relay.log"), "utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    expect(entries.filter((e) => e.level === "error").length).toBe(2);
    expect(entries.some((e) => e.message === "boom-one")).toBe(true);
    expect(h.errorBoxes.length - boxesBefore).toBe(1);
    expect(h.errorBoxes.at(-1)?.title).toBe("Relay error");
  });

  it("logs render-process-gone details", async () => {
    h.userData = mkdtempSync(join(tmpdir(), "relay-index-"));
    const baseline = h.appListeners.get("render-process-gone")?.length ?? 0;
    vi.resetModules();
    await import("../src/main/index.ts");
    const handler = await waitFor(() => {
      const list = h.appListeners.get("render-process-gone");
      return list && list.length > baseline ? list.at(-1) : undefined;
    });
    handler({}, {}, { reason: "crashed", exitCode: 133 });

    const entries = readFileSync(join(h.userData, "relay.log"), "utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    expect(
      entries.some(
        (e) =>
          e.level === "error" &&
          e.message === "render-process-gone" &&
          e.reason === "crashed",
      ),
    ).toBe(true);
  });
});

type IntegrationWindow = TestWindow & {
  minimized: boolean;
  restoreCalls: number;
  showCalls: number;
  focusCalls: number;
};

type MenuItemLike = { role?: string; submenu?: MenuItemLike[] };

function collectRoles(items: MenuItemLike[]): string[] {
  const roles: string[] = [];
  for (const item of items) {
    if (typeof item.role === "string") roles.push(item.role);
    if (Array.isArray(item.submenu)) roles.push(...collectRoles(item.submenu));
  }
  return roles;
}

function setPlatform(value: NodeJS.Platform): void {
  Object.defineProperty(process, "platform", { value, configurable: true });
}

async function bootMain(userData: string): Promise<void> {
  vi.resetModules();
  h.singleInstanceLock = true;
  h.userData = userData;
  h.windows.length = 0;
  const index = h.windowOptions.length;
  await import("../src/main/index.ts");
  await waitFor(() => h.windowOptions[index]);
}

describe("main single instance lock", () => {
  it("quits without creating a window when the lock is not acquired", async () => {
    const userData = mkdtempSync(join(tmpdir(), "relay-index-"));
    vi.resetModules();
    h.singleInstanceLock = false;
    h.quitCalls = 0;
    const windowsBefore = h.windows.length;
    await import("../src/main/index.ts");
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(h.quitCalls).toBe(1);
    expect(h.windows.length).toBe(windowsBefore);
    h.singleInstanceLock = true;
  });

  it("restores, shows and focuses the existing window on second-instance", async () => {
    const userData = mkdtempSync(join(tmpdir(), "relay-index-"));
    await bootMain(userData);
    const win = h.windows.at(-1) as IntegrationWindow;
    const handler = await waitFor(() =>
      (h.appListeners.get("second-instance") ?? []).at(-1),
    );
    win.minimized = true;
    win.restoreCalls = 0;
    win.showCalls = 0;
    win.focusCalls = 0;
    handler({}, ["relay"], userData);
    expect(win.restoreCalls).toBe(1);
    expect(win.minimized).toBe(false);
    expect(win.showCalls).toBe(1);
    expect(win.focusCalls).toBe(1);
  });
});

describe("main macOS lifecycle", () => {
  it("creates a window on activate only when none are open", async () => {
    const userData = mkdtempSync(join(tmpdir(), "relay-index-"));
    await bootMain(userData);
    const activate = await waitFor(() =>
      (h.appListeners.get("activate") ?? []).at(-1),
    );
    const before = h.windows.length;
    activate();
    expect(h.windows.length).toBe(before);

    h.windows.length = 0;
    activate();
    expect(h.windows.length).toBe(1);
  });

  it("quits on window-all-closed off darwin but not on darwin", async () => {
    const userData = mkdtempSync(join(tmpdir(), "relay-index-"));
    await bootMain(userData);
    const handler = await waitFor(() =>
      (h.appListeners.get("window-all-closed") ?? []).at(-1),
    );
    const original = process.platform;
    try {
      setPlatform("darwin");
      h.quitCalls = 0;
      handler();
      expect(h.quitCalls).toBe(0);

      setPlatform("linux");
      handler();
      expect(h.quitCalls).toBe(1);
    } finally {
      setPlatform(original);
    }
  });
});

describe("main native menu", () => {
  it("installs a menu containing edit, view and window roles", async () => {
    const userData = mkdtempSync(join(tmpdir(), "relay-index-"));
    await bootMain(userData);
    const template = await waitFor(() =>
      h.menuTemplates.at(-1) as MenuItemLike[] | undefined,
    );
    expect(h.appMenu).toBe(template);
    const roles = collectRoles(template);
    expect(roles).toContain("appMenu");
    expect(roles).toContain("editMenu");
    expect(roles).toContain("windowMenu");
    expect(roles).toContain("reload");
    expect(roles).toContain("resetZoom");
    expect(roles).toContain("zoomIn");
    expect(roles).toContain("zoomOut");
    expect(roles).toContain("togglefullscreen");
    expect(roles).toContain("toggleDevTools");
  });
});
