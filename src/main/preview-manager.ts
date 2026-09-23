import { randomUUID } from "node:crypto";
import {
  DEFAULT_PREVIEW_TITLE,
  MAX_PREVIEWS_PER_SESSION,
  isLocalUrl,
  isPreviewId,
  normalizePreviewUrl,
  previewTitleFromUrl,
  type PreviewCreateResult,
  type PreviewEvent,
  type PreviewNavigateResult,
} from "../shared/preview.ts";

export type Rect = { x: number; y: number; width: number; height: number };

type ViewEvents = {
  on(event: string, listener: (...args: unknown[]) => void): unknown;
};

export type ViewLike = {
  webContents: ViewEvents & {
    loadURL(url: string): Promise<void> | void;
    reload(): void;
    stop(): void;
    close(): void;
    isDestroyed(): boolean;
    setWindowOpenHandler(
      handler: (details: { url: string }) => { action: "deny" },
    ): void;
    session: ViewEvents & {
      setPermissionRequestHandler(
        handler: (
          contents: unknown,
          permission: string,
          callback: (granted: boolean) => void,
        ) => void,
      ): void;
    };
  };
  setBounds(rect: Rect): void;
  setVisible(visible: boolean): void;
};

/** The window, reduced to what this module needs. Task 4 maps it to contentView. */
export type HostWindowLike = {
  isDestroyed(): boolean;
  addView(view: ViewLike): void;
  removeView(view: ViewLike): void;
};

export type PreviewManagerDeps = {
  createView: () => ViewLike;
  openExternal: (url: string) => void;
  getWindow: (senderId: number) => HostWindowLike | null;
  createId?: () => `preview:${string}`;
};

export function toRect(value: unknown): Rect | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const parts = [record.x, record.y, record.width, record.height];
  if (!parts.every((part) => typeof part === "number" && Number.isFinite(part))) {
    return null;
  }
  const [x, y, width, height] = parts as [number, number, number, number];
  if (width < 1 || height < 1) return null;
  return {
    x: Math.max(0, Math.round(x)),
    y: Math.max(0, Math.round(y)),
    width: Math.round(width),
    height: Math.round(height),
  };
}

type Entry = {
  previewId: `preview:${string}`;
  sessionId: string;
  title: string;
  url: string;
  senderId: number;
  view: ViewLike | null;
  attached: boolean;
};

export class PreviewManager {
  private readonly entries = new Map<string, Entry>();
  private readonly rects = new Map<string, Rect>();
  private readonly listeners = new Set<(event: PreviewEvent) => void>();
  private readonly createView: () => ViewLike;
  private readonly openExternal: (url: string) => void;
  private readonly getWindow: (senderId: number) => HostWindowLike | null;
  private readonly createId: () => `preview:${string}`;

  constructor(deps: PreviewManagerDeps) {
    this.createView = deps.createView;
    this.openExternal = deps.openExternal;
    this.getWindow = deps.getWindow;
    this.createId = deps.createId ?? (() => `preview:${randomUUID()}`);
  }

  onEvent(listener: (event: PreviewEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Mints the id and title. No view exists until a local URL is shown. */
  create(input: { sessionId: string; url: string; senderId: number }): PreviewCreateResult {
    const count = [...this.entries.values()].filter(
      (entry) => entry.sessionId === input.sessionId,
    ).length;
    if (count >= MAX_PREVIEWS_PER_SESSION) {
      throw new Error(`This session already has ${MAX_PREVIEWS_PER_SESSION} previews`);
    }
    let url = "";
    if (input.url) {
      const normalized = normalizePreviewUrl(input.url);
      if (!normalized.ok) throw new Error(normalized.reason);
      url = normalized.url;
    }
    const previewId = this.createId();
    const title = url ? previewTitleFromUrl(url) : DEFAULT_PREVIEW_TITLE;
    this.entries.set(previewId, {
      previewId,
      sessionId: input.sessionId,
      title,
      url,
      senderId: input.senderId,
      view: null,
      attached: false,
    });
    return { previewId, title, url };
  }

  /**
   * Materialize and reveal. Called on mount and after a renderer reload: an
   * existing view is re-parented and re-shown, never reloaded, so page state
   * survives ⌘R. A restored tab (no view yet) is loaded here — that is the
   * "load on activation" behaviour.
   */
  show(previewId: string, sessionId: string, senderId: number, url: string): void {
    let entry = this.entries.get(previewId);
    if (!entry) {
      if (!isPreviewId(previewId)) return;
      entry = {
        previewId,
        sessionId,
        title: DEFAULT_PREVIEW_TITLE,
        url: "",
        senderId,
        view: null,
        attached: false,
      };
      this.entries.set(previewId, entry);
    }
    entry.senderId = senderId;
    if (entry.view) {
      this.place(entry);
      return;
    }
    if (!url) return;
    const normalized = normalizePreviewUrl(url);
    if (!normalized.ok) return;
    entry.url = normalized.url;
    this.materialize(entry, normalized.url);
  }

  setBounds(previewId: string, rect: Rect | null): void {
    const entry = this.entries.get(previewId);
    if (!entry) return;
    if (!rect) {
      this.rects.delete(previewId);
      if (entry.view) entry.view.setVisible(false);
      return;
    }
    this.rects.set(previewId, rect);
    this.place(entry);
  }

  navigate(previewId: string, url: string): PreviewNavigateResult {
    const entry = this.entries.get(previewId);
    if (!entry) return { ok: false, reason: "This preview is no longer running" };
    const normalized = normalizePreviewUrl(url);
    if (!normalized.ok) return { ok: false, reason: normalized.reason };
    entry.url = normalized.url;
    if (!entry.view) {
      this.materialize(entry, normalized.url);
      return { ok: true, url: normalized.url };
    }
    void entry.view.webContents.loadURL(normalized.url);
    return { ok: true, url: normalized.url };
  }

  reload(previewId: string): void {
    this.entries.get(previewId)?.view?.webContents.reload();
  }

  close(previewId: string): void {
    const entry = this.entries.get(previewId);
    if (!entry) return;
    this.destroy(entry);
    this.entries.delete(previewId);
    this.rects.delete(previewId);
  }

  removeSession(sessionId: string): void {
    for (const entry of [...this.entries.values()]) {
      if (entry.sessionId === sessionId) this.close(entry.previewId);
    }
  }

  sweep(activeSessionIds: Iterable<string>): void {
    const live = new Set(activeSessionIds);
    for (const entry of [...this.entries.values()]) {
      if (entry.sessionId && !live.has(entry.sessionId)) this.close(entry.previewId);
    }
  }

  shutdown(): void {
    for (const entry of [...this.entries.values()]) this.close(entry.previewId);
  }

  private materialize(entry: Entry, url: string): void {
    const view = this.createView();
    entry.view = view;
    this.wire(entry, view);
    this.place(entry);
    this.emit({ type: "previewState", previewId: entry.previewId, state: "loading" });
    void view.webContents.loadURL(url);
  }

  private place(entry: Entry): void {
    const view = entry.view;
    if (!view) return;
    const window = this.getWindow(entry.senderId);
    if (!window || window.isDestroyed()) return;
    if (!entry.attached) {
      window.addView(view);
      entry.attached = true;
    }
    const rect = this.rects.get(entry.previewId);
    if (rect) view.setBounds(rect);
    view.setVisible(true);
  }

  private destroy(entry: Entry): void {
    const view = entry.view;
    if (!view) return;
    entry.view = null;
    const window = this.getWindow(entry.senderId);
    if (window && !window.isDestroyed() && entry.attached) window.removeView(view);
    entry.attached = false;
    if (!view.webContents.isDestroyed()) view.webContents.close();
  }

  private wire(entry: Entry, view: ViewLike): void {
    const { webContents } = view;
    const prevent = (event: unknown): void => {
      (event as { preventDefault?: () => void }).preventDefault?.();
    };
    const guard = (event: unknown, target: unknown): void => {
      if (typeof target !== "string") return;
      if (isLocalUrl(target)) return;
      prevent(event);
      this.openExternal(target);
    };

    webContents.on("will-navigate", guard);
    webContents.on("will-redirect", guard);
    webContents.setWindowOpenHandler((details) => {
      if (isLocalUrl(details.url)) void webContents.loadURL(details.url);
      else this.openExternal(details.url);
      return { action: "deny" };
    });
    webContents.session.on("will-download", prevent);
    webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => {
      callback(false);
    });

    webContents.on("did-start-loading", () => {
      this.emit({ type: "previewState", previewId: entry.previewId, state: "loading" });
    });
    webContents.on("did-finish-load", () => {
      this.emit({ type: "previewState", previewId: entry.previewId, state: "loaded" });
    });
    webContents.on("did-fail-load", (...args: unknown[]) => {
      const errorCode = args[1];
      if (errorCode === -3) return; // aborted: a newer navigation superseded this one
      this.emit({
        type: "previewState",
        previewId: entry.previewId,
        state: "failed",
        message: `${String(args[2] ?? "Load failed")} — ${String(args[3] ?? entry.url)}`,
      });
    });
    const navigated = (_event: unknown, url: unknown): void => {
      if (typeof url !== "string") return;
      entry.url = url;
      this.emit({ type: "previewNavigated", previewId: entry.previewId, url });
    };
    webContents.on("did-navigate", navigated);
    webContents.on("did-navigate-in-page", navigated);
  }

  private emit(event: PreviewEvent): void {
    for (const listener of this.listeners) listener(event);
  }
}
