import { describe, expect, it, vi } from "vitest";
import {
  PreviewManager,
  toRect,
  type HostWindowLike,
  type Rect,
  type ViewLike,
} from "../src/main/preview-manager.ts";

const UUID = "2f1a3c4d-5b6e-4f70-8a9b-0c1d2e3f4a5b";
const LOCAL = "http://localhost:5173/";

/** Distinct, well-formed ids: the cap test needs eight separate entries. */
function idFor(index: number): `preview:${string}` {
  return `preview:${UUID.slice(0, 35)}${(index % 16).toString(16)}`;
}

class FakeSession {
  handlers = new Map<string, Array<(...args: unknown[]) => void>>();
  permissionHandler:
    | ((contents: unknown, permission: string, callback: (granted: boolean) => void) => void)
    | null = null;

  on(event: string, listener: (...args: unknown[]) => void): void {
    const current = this.handlers.get(event) ?? [];
    current.push(listener);
    this.handlers.set(event, current);
  }

  emit(event: string, ...args: unknown[]): void {
    for (const listener of this.handlers.get(event) ?? []) listener(...args);
  }

  setPermissionRequestHandler(handler: FakeSession["permissionHandler"]): void {
    this.permissionHandler = handler;
  }
}

class FakeView implements ViewLike {
  handlers = new Map<string, Array<(...args: unknown[]) => void>>();
  session = new FakeSession();
  loaded: string[] = [];
  reloads = 0;
  bounds: Rect | null = null;
  visible = false;
  destroyed = false;
  windowOpenHandler: ((details: { url: string }) => { action: "deny" }) | null = null;

  webContents = {
    loadURL: (url: string) => {
      this.loaded.push(url);
      return Promise.resolve();
    },
    reload: () => {
      this.reloads += 1;
    },
    stop: () => {},
    close: () => {
      this.destroyed = true;
    },
    isDestroyed: () => this.destroyed,
    on: (event: string, listener: (...args: unknown[]) => void) => {
      const current = this.handlers.get(event) ?? [];
      current.push(listener);
      this.handlers.set(event, current);
    },
    setWindowOpenHandler: (handler: FakeView["windowOpenHandler"]) => {
      this.windowOpenHandler = handler;
    },
    session: this.session,
  };

  setBounds(rect: Rect): void {
    this.bounds = rect;
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
  }

  emit(event: string, ...args: unknown[]): void {
    for (const listener of this.handlers.get(event) ?? []) listener(...args);
  }
}

function harness() {
  const views: FakeView[] = [];
  const added: ViewLike[] = [];
  const removed: ViewLike[] = [];
  const external: string[] = [];
  let created = 0;
  const window: HostWindowLike = {
    isDestroyed: () => false,
    addView: (view) => void added.push(view),
    removeView: (view) => void removed.push(view),
  };
  const manager = new PreviewManager({
    createView: () => {
      const view = new FakeView();
      views.push(view);
      return view;
    },
    openExternal: (url) => void external.push(url),
    getWindow: () => window,
    createId: () => idFor(created++),
  });
  const events: unknown[] = [];
  manager.onEvent((event) => void events.push(event));
  return { manager, views, added, removed, external, events, window };
}

describe("toRect", () => {
  it("accepts a real rect and refuses junk", () => {
    expect(toRect({ x: 10.4, y: 20, width: 400, height: 300 })).toEqual({
      x: 10,
      y: 20,
      width: 400,
      height: 300,
    });
    expect(toRect(null)).toBeNull();
    expect(toRect({ x: 0, y: 0, width: 0, height: 300 })).toBeNull();
    expect(toRect({ x: 0, y: 0, width: Number.NaN, height: 300 })).toBeNull();
    expect(toRect("nope")).toBeNull();
  });
});

describe("PreviewManager", () => {
  it("mints a uuid and a host:port title without constructing a view", () => {
    const { manager, views } = harness();
    const created = manager.create({ sessionId: "s1", url: LOCAL, senderId: 1 });
    expect(created).toEqual({ previewId: idFor(0), title: "localhost:5173", url: LOCAL });
    expect(views).toHaveLength(0);

    const empty = manager.create({ sessionId: "s1", url: "", senderId: 1 });
    expect(empty.title).toBe("Preview");
    expect(empty.url).toBe("");
    expect(views).toHaveLength(0);
  });

  it("refuses a non-local url and a ninth preview", () => {
    const { manager } = harness();
    expect(() =>
      manager.create({ sessionId: "s1", url: "https://example.com/", senderId: 1 }),
    ).toThrow(/example\.com/);
    let last = "";
    for (let index = 0; index < 8; index += 1) {
      last = manager.create({ sessionId: "s1", url: "", senderId: 1 }).previewId;
    }
    expect(() => manager.create({ sessionId: "s1", url: "", senderId: 1 })).toThrow(/8 previews/);
    expect(() => manager.close(last)).not.toThrow();
  });

  it("shows by creating the view once, and never reloads an existing one", () => {
    const { manager, views, added, events } = harness();
    const { previewId } = manager.create({ sessionId: "s1", url: "", senderId: 7 });

    manager.setBounds(previewId, { x: 0, y: 0, width: 400, height: 300 });
    expect(views).toHaveLength(0);

    manager.show(previewId, "s1", 7, LOCAL);
    expect(views).toHaveLength(1);
    expect(views[0]!.loaded).toEqual([LOCAL]);
    expect(added).toHaveLength(1);
    expect(views[0]!.bounds).toEqual({ x: 0, y: 0, width: 400, height: 300 });
    expect(views[0]!.visible).toBe(true);
    expect(events).toContainEqual({
      type: "previewState",
      previewId,
      state: "loading",
    });

    // A renderer reload re-shows the same view: no second load, no new view.
    manager.show(previewId, "s1", 7, LOCAL);
    expect(views).toHaveLength(1);
    expect(views[0]!.loaded).toEqual([LOCAL]);
  });

  it("hides with a null rect and shows again with a fresh one", () => {
    const { manager, views } = harness();
    const { previewId } = manager.create({ sessionId: "s1", url: LOCAL, senderId: 1 });
    manager.show(previewId, "s1", 1, LOCAL);
    const view = views[0]!;
    expect(view.visible).toBe(true);

    manager.setBounds(previewId, null);
    expect(view.visible).toBe(false);

    manager.setBounds(previewId, { x: 5, y: 6, width: 100, height: 200 });
    expect(view.visible).toBe(true);
    expect(view.bounds).toEqual({ x: 5, y: 6, width: 100, height: 200 });
  });

  it("navigates locally, refuses remotely, and materializes an empty tab", () => {
    const { manager, views } = harness();
    const { previewId } = manager.create({ sessionId: "s1", url: "", senderId: 1 });

    expect(manager.navigate(previewId, "https://example.com/")).toEqual({
      ok: false,
      reason: expect.stringContaining("example.com"),
    });
    expect(views).toHaveLength(0);

    expect(manager.navigate(previewId, "localhost:4000")).toEqual({
      ok: true,
      url: "http://localhost:4000/",
    });
    expect(views).toHaveLength(1);
    expect(views[0]!.loaded).toEqual(["http://localhost:4000/"]);

    expect(manager.navigate(previewId, LOCAL)).toEqual({ ok: true, url: LOCAL });
    expect(views[0]!.loaded).toEqual(["http://localhost:4000/", LOCAL]);
  });

  it("denies remote navigation and popups, and sends them to the browser", () => {
    const { manager, views, external } = harness();
    const { previewId } = manager.create({ sessionId: "s1", url: LOCAL, senderId: 1 });
    manager.show(previewId, "s1", 1, LOCAL);
    const view = views[0]!;

    const prevented = vi.fn();
    view.emit("will-navigate", { preventDefault: prevented }, "https://example.com/");
    expect(prevented).toHaveBeenCalledTimes(1);
    expect(external).toEqual(["https://example.com/"]);

    const localPrevented = vi.fn();
    view.emit("will-navigate", { preventDefault: localPrevented }, LOCAL);
    expect(localPrevented).not.toHaveBeenCalled();
    expect(external).toEqual(["https://example.com/"]);

    expect(view.windowOpenHandler!({ url: "https://example.com/" })).toEqual({ action: "deny" });
    expect(external).toEqual(["https://example.com/", "https://example.com/"]);

    expect(view.windowOpenHandler!({ url: "http://127.0.0.1:3000/" })).toEqual({ action: "deny" });
    expect(view.loaded).toContain("http://127.0.0.1:3000/");
  });

  it("cancels downloads and denies every permission", () => {
    const { manager, views } = harness();
    const { previewId } = manager.create({ sessionId: "s1", url: LOCAL, senderId: 1 });
    manager.show(previewId, "s1", 1, LOCAL);
    const view = views[0]!;

    const prevented = vi.fn();
    view.session.emit("will-download", { preventDefault: prevented });
    expect(prevented).toHaveBeenCalledTimes(1);

    const callback = vi.fn();
    view.session.permissionHandler!({}, "media", callback);
    expect(callback).toHaveBeenCalledWith(false);
  });

  it("reports load state and navigation", () => {
    const { manager, views, events } = harness();
    const { previewId } = manager.create({ sessionId: "s1", url: LOCAL, senderId: 1 });
    manager.show(previewId, "s1", 1, LOCAL);
    const view = views[0]!;

    view.emit("did-start-loading");
    view.emit("did-finish-load");
    view.emit("did-fail-load", {}, -3, "aborted", LOCAL);
    expect(events).toContainEqual({ type: "previewState", previewId, state: "loading" });
    expect(events).toContainEqual({ type: "previewState", previewId, state: "loaded" });
    expect(events).not.toContainEqual(
      expect.objectContaining({ state: "failed" }),
    );

    view.emit("did-fail-load", {}, -105, "NAME_NOT_RESOLVED", LOCAL);
    expect(events).toContainEqual({
      type: "previewState",
      previewId,
      state: "failed",
      message: "NAME_NOT_RESOLVED — http://localhost:5173/",
    });

    view.emit("did-navigate", {}, "http://localhost:5173/other");
    expect(events).toContainEqual({
      type: "previewNavigated",
      previewId,
      url: "http://localhost:5173/other",
    });
  });

  it("treats an unknown id as a no-op and destroys views on every removal path", () => {
    const { manager, views, removed } = harness();
    const one = manager.create({ sessionId: "s1", url: LOCAL, senderId: 1 }).previewId;
    const two = manager.create({ sessionId: "s2", url: LOCAL, senderId: 1 }).previewId;
    manager.show(one, "s1", 1, LOCAL);
    manager.show(two, "s2", 1, LOCAL);

    expect(() => manager.setBounds("preview:1", null)).not.toThrow();
    expect(() => manager.reload("preview:1")).not.toThrow();
    expect(() => manager.close("preview:1")).not.toThrow();
    expect(manager.navigate("preview:1", LOCAL)).toEqual({
      ok: false,
      reason: expect.stringContaining("no longer running"),
    });

    manager.reload(one);
    expect(views[0]!.reloads).toBe(1);

    manager.sweep(["s1"]);
    expect(views[1]!.destroyed).toBe(true);
    expect(removed).toContain(views[1]);

    manager.removeSession("s1");
    expect(views[0]!.destroyed).toBe(true);

    const three = manager.create({ sessionId: "s3", url: LOCAL, senderId: 1 }).previewId;
    manager.show(three, "s3", 1, LOCAL);
    manager.shutdown();
    expect(views[2]!.destroyed).toBe(true);
  });
});
