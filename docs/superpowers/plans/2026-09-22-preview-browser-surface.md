# Preview/Browser Surface Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user watch a local dev server inside a session's right panel as a real embedded `WebContentsView`, one tab per target, with local-only URLs, detected-link chips, ⌘R-surviving page state, and honest failure states.

**Architecture:** Main owns every view in a new `PreviewManager`, keyed by a main-minted `preview:<uuid>`; the renderer's panel stores preview tabs as instance surfaces alongside terminals and reports the measure of the element the page must occupy over a dedicated layout channel, which is the sole positioning and hiding mechanism. Creation is lazy: `previewCreate` mints id and title, and a view is born only when a valid local URL is shown. Removal flows through one generalized surface-closer; a main-side URL store feeds detected-URL chips from terminal output and transcript text.

**Tech Stack:** Electron 37.10.3 (`WebContentsView`, `View`, `BaseView.contentView`, `shell.openExternal`), React 19, TypeScript 5.9, Vitest 3. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-22-preview-browser-surface-design.md`

## Global Constraints

- No new dependencies. `WebContentsView`, `contentView`, `View` and `shell.openExternal` are all in the installed Electron 37.10.3.
- TDD for every unit of production logic. Vitest, `environment: "node"` by default; renderer component tests opt into jsdom with `// @vitest-environment jsdom` as the first line.
- `npm test`, `npm run typecheck` and `npm run build` must all stay green. There is no lint script in this repo.
- All IPC input is validated in the main process. **Main is the authority on what may load**; the renderer's check is only for instant feedback. A missing preview is a normal state, never an exception.
- **A real `WebContentsView` must never be constructed in a test.** `PreviewManager` takes an injected `createView`, and `tests/index.test.ts` mocks `src/main/preview-view.ts` wholesale, because that file imports `electron` and the test's electron mock has no `WebContentsView`.
- Renderer reload (⌘R) must not destroy any view or reload any page. Views live in main; `show` on an existing view re-parents and re-reveals it.
- Preview ids are main-minted UUIDs matching `^preview:[0-9a-fA-F-]{36}$`.
- Local-only policy: `localhost`, `127.0.0.0/8`, `::1`/`[::1]`, `*.local`, `10/8`, `172.16/12`, `192.168/16`, `169.254/16`. Everything else is refused.
- Partition is `persist:relay-preview`; per-view `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, `webSecurity: true`, no preload.
- Cap: 8 previews per session, refused by `previewCreate` with a message the panel renders as a `panel-note`.

## Review Focus

Inputs and failure modes the spec implies but whose owning task is easy to under-test. Each line is pinned to a test in the task named:

1. **A remote address typed into the address bar** (`https://example.com`, `file:///etc/passwd`, `javascript:alert(1)`). It must be refused in the renderer *and* re-refused in main: `loadURL` is never reached, and the chrome shows the refusal reason. *(Tasks 0, 3, 7 — `tests/preview.test.ts`, `tests/preview-manager.test.ts` "navigate never reaches loadURL for a non-local URL", `tests/panel-preview.test.tsx`.)*
2. **A restored tab whose dev server is gone.** `previewShow` creates a view, the load fails, and the tab shows the failure notice with Retry — never a blank panel and never an app-level crash dialog. *(Tasks 3, 7 — `did-fail-load` → `previewState failed`, plus the Retry path.)*
3. **A URL printed by the agent's dev server while no preview exists.** Terminal output must reach the detector, a `previews` `RelayEvent` must carry the URL, and the `+` menu must then open exactly that URL. *(Tasks 2, 4 — `detectLocalUrls`, the `sessionIdOf` feed, and the broadcast assertion in `tests/index.test.ts`.)*
4. **A panel menu or a drag over a live preview.** The view must be hidden (`rect: null`) so the menu is visible and clickable, and restored after. *(Task 6 — `tests/use-preview-layout.test.tsx`.)*
5. **A ninth preview in one session.** Refused with a message and no view constructed; the first eight keep working. *(Tasks 3, 4 — `tests/preview-manager.test.ts` cap case and the handler's rejection.)*
6. **A renderer reload (⌘R) with a live preview.** Nothing is destroyed and nothing is reloaded: `show` on an existing view neither calls `loadURL` nor `close`, so page scroll and SPA route survive. *(Task 3 — "show re-shows an existing view without reloading".)*

---

### Task 0: Shared preview contract

**Files:**
- Create: `src/shared/preview.ts`
- Modify: `src/shared/ipc.ts:38-43` (the `RelayEvent` union)
- Test: `tests/preview.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `PREVIEW_PARTITION = "persist:relay-preview"`, `MAX_PREVIEWS_PER_SESSION = 8`, `DEFAULT_PREVIEW_TITLE = "Preview"`, `isPreviewId(value): value is \`preview:${string}\``, `isLocalHostname(host): boolean`, `isLocalUrl(url): boolean`, `normalizePreviewUrl(input): { ok: true; url: string } | { ok: false; reason: string }`, `previewTitleFromUrl(url): string`, `PreviewEvent`, `PreviewCreateResult`, `PreviewNavigateResult`; and `RelayEvent` gains `| { type: "previews"; sessionId: string; urls: string[] }`.

- [ ] **Step 1: Write the failing test**

`tests/preview.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  DEFAULT_PREVIEW_TITLE,
  isLocalUrl,
  isPreviewId,
  normalizePreviewUrl,
  PREVIEW_PARTITION,
  previewTitleFromUrl,
} from "../src/shared/preview.ts";

const UUID = "2f1a3c4d-5b6e-4f70-8a9b-0c1d2e3f4a5b";

describe("isPreviewId", () => {
  it("accepts a uuid id and rejects counters and non-strings", () => {
    expect(isPreviewId(`preview:${UUID}`)).toBe(true);
    expect(isPreviewId("preview:1")).toBe(false);
    expect(isPreviewId("terminal:1")).toBe(false);
    expect(isPreviewId(null)).toBe(false);
  });
});

describe("normalizePreviewUrl", () => {
  it("defaults a bare host and port to http", () => {
    expect(normalizePreviewUrl("localhost:5173")).toEqual({
      ok: true,
      url: "http://localhost:5173/",
    });
    expect(normalizePreviewUrl("  127.0.0.1:3000/app  ")).toEqual({
      ok: true,
      url: "http://127.0.0.1:3000/app",
    });
  });

  it("keeps an explicit scheme and accepts private and .local hosts", () => {
    expect(normalizePreviewUrl("https://localhost:5173/x")).toEqual({
      ok: true,
      url: "https://localhost:5173/x",
    });
    expect(normalizePreviewUrl("http://192.168.1.20:8080/")).toEqual({
      ok: true,
      url: "http://192.168.1.20:8080/",
    });
    expect(normalizePreviewUrl("http://dev-box.local:4000/")).toEqual({
      ok: true,
      url: "http://dev-box.local:4000/",
    });
    expect(normalizePreviewUrl("http://172.31.0.4:9000/")).toEqual({
      ok: true,
      url: "http://172.31.0.4:9000/",
    });
  });

  it("refuses remote hosts with a reason naming the host", () => {
    const refused = normalizePreviewUrl("https://example.com/");
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.reason).toContain("example.com");
  });

  it("refuses non-http schemes, javascript and empty input", () => {
    expect(normalizePreviewUrl("file:///etc/passwd").ok).toBe(false);
    expect(normalizePreviewUrl("javascript:alert(1)").ok).toBe(false);
    expect(normalizePreviewUrl("   ").ok).toBe(false);
    expect(normalizePreviewUrl("http://172.15.0.4:9000/").ok).toBe(false);
    expect(normalizePreviewUrl("http://localhost:5173/a b").ok).toBe(false);
  });
});

describe("isLocalUrl", () => {
  it("answers for already-absolute urls", () => {
    expect(isLocalUrl("http://localhost:5173/")).toBe(true);
    expect(isLocalUrl("https://10.0.0.5/")).toBe(true);
    expect(isLocalUrl("https://example.com/")).toBe(false);
    expect(isLocalUrl("not a url")).toBe(false);
  });
});

describe("previewTitleFromUrl", () => {
  it("uses host and port, falling back to a generic label", () => {
    expect(previewTitleFromUrl("http://localhost:5173/")).toBe("localhost:5173");
    expect(previewTitleFromUrl("http://127.0.0.1:3000/app")).toBe("127.0.0.1:3000");
    expect(previewTitleFromUrl("")).toBe(DEFAULT_PREVIEW_TITLE);
  });
});

describe("constants", () => {
  it("names the partition and the cap", () => {
    expect(PREVIEW_PARTITION).toBe("persist:relay-preview");
    expect(DEFAULT_PREVIEW_TITLE).toBe("Preview");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/preview.test.ts`
Expected: FAIL — `Failed to resolve import "../src/shared/preview.ts"`.

- [ ] **Step 3: Write `src/shared/preview.ts`**

```ts
export const PREVIEW_PARTITION = "persist:relay-preview";
export const MAX_PREVIEWS_PER_SESSION = 8;
export const DEFAULT_PREVIEW_TITLE = "Preview";

const PREVIEW_ID = /^preview:[0-9a-fA-F-]{36}$/;

// Loopback, link-local and the RFC 1918 ranges. A dev server binds to one of
// these or to *.local; anything else is not a preview and goes to the browser.
const LOCAL_V4 =
  /^(127\.\d{1,3}\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|169\.254\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})$/;

export type PreviewEvent =
  | {
      type: "previewState";
      previewId: string;
      state: "loading" | "loaded" | "failed";
      message?: string;
    }
  | { type: "previewNavigated"; previewId: string; url: string };

export type PreviewCreateResult = {
  previewId: `preview:${string}`;
  title: string;
  url: string;
};

export type PreviewNavigateResult =
  | { ok: true; url: string }
  | { ok: false; reason: string };

export function isPreviewId(value: unknown): value is `preview:${string}` {
  return typeof value === "string" && PREVIEW_ID.test(value);
}

export function isLocalHostname(host: string): boolean {
  const value = host.toLowerCase();
  if (value === "localhost" || value === "::1" || value === "[::1]") return true;
  if (value.endsWith(".local")) return true;
  return LOCAL_V4.test(value);
}

export function isLocalUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
  return isLocalHostname(parsed.hostname);
}

export function normalizePreviewUrl(
  input: string,
): { ok: true; url: string } | { ok: false; reason: string } {
  const trimmed = input.trim();
  if (!trimmed) {
    return { ok: false, reason: "Enter a local address, for example localhost:5173" };
  }
  if (/\s/.test(trimmed)) {
    return { ok: false, reason: "That is not a valid address" };
  }
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(trimmed)
    ? trimmed
    : `http://${trimmed}`;
  let parsed: URL;
  try {
    parsed = new URL(withScheme);
  } catch {
    return { ok: false, reason: "That is not a valid address" };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { ok: false, reason: "Only http and https local addresses can be previewed" };
  }
  if (!isLocalHostname(parsed.hostname)) {
    return {
      ok: false,
      reason: `${parsed.hostname} is not a local address — opening it in your browser`,
    };
  }
  return { ok: true, url: parsed.toString() };
}

export function previewTitleFromUrl(url: string): string {
  if (!url) return DEFAULT_PREVIEW_TITLE;
  try {
    return new URL(url).host || DEFAULT_PREVIEW_TITLE;
  } catch {
    return DEFAULT_PREVIEW_TITLE;
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/preview.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Add the detected-URL event to the relay union**

In `src/shared/ipc.ts`, extend the union that currently ends with the `log` member:

```ts
export type RelayEvent =
  | { type: "sessions"; sessions: Session[] }
  | { type: "transcript"; sessionId: string; events: TranscriptEvent[] }
  | { type: "permission"; sessionId: string; request: PermissionRequest }
  | { type: "permission_resolved"; sessionId: string; requestId: string }
  | { type: "previews"; sessionId: string; urls: string[] }
  | { type: "log"; sessionId?: string; message: string };
```

This is a type-only change; nothing consumes the variant until Task 4.

- [ ] **Step 6: Commit**

```bash
git add src/shared/preview.ts src/shared/ipc.ts tests/preview.test.ts
git commit -m "Add the shared preview contract and URL policy"
```

---

### Task 1: Preview surface in the panel model

**Files:**
- Modify: `src/shared/right-panel.ts:1-22,36-47,108-119`
- Test: `tests/right-panel.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `RightPanelKind` gains `"preview"`; `PreviewSurface = { id: \`preview:${string}\`; kind: "preview"; title: string; url: string }`; `RightPanelSurface` gains it; `PanelAction` gains `{ type: "openPreview"; id: \`preview:${string}\`; title: string; url: string }`; `panelReducer` gains an `openPreview` case that upserts, activates and opens the panel.

- [ ] **Step 1: Write the failing test**

Append to `tests/right-panel.test.ts`, inside the existing `panelReducer` describe, mirroring the `openTerminal` cases already there:

```ts
  it("opens a preview beside other surfaces and activates it", () => {
    const withChanges = panelReducer(EMPTY_PANEL_STATE, { type: "open", kind: "changes" });
    const withPreview = panelReducer(withChanges, {
      type: "openPreview",
      id: "preview:2f1a3c4d-5b6e-4f70-8a9b-0c1d2e3f4a5b",
      title: "localhost:5173",
      url: "http://localhost:5173/",
    });
    expect(withPreview.isOpen).toBe(true);
    expect(withPreview.activeSurfaceId).toBe(
      "preview:2f1a3c4d-5b6e-4f70-8a9b-0c1d2e3f4a5b",
    );
    expect(withPreview.surfaces.map((surface) => surface.kind)).toEqual([
      "changes",
      "preview",
    ]);
  });

  it("upserts a preview by id instead of duplicating it", () => {
    const id = "preview:2f1a3c4d-5b6e-4f70-8a9b-0c1d2e3f4a5b";
    const first = panelReducer(EMPTY_PANEL_STATE, {
      type: "openPreview",
      id,
      title: "localhost:5173",
      url: "http://localhost:5173/",
    });
    const second = panelReducer(first, {
      type: "openPreview",
      id,
      title: "localhost:5174",
      url: "http://localhost:5174/",
    });
    expect(second.surfaces).toHaveLength(1);
    expect(second.surfaces[0]).toEqual({
      id,
      kind: "preview",
      title: "localhost:5174",
      url: "http://localhost:5174/",
    });
  });

  it("leaves the files and file exclusion rules alone when opening a preview", () => {
    const state = panelReducer(EMPTY_PANEL_STATE, {
      type: "openFile",
      path: "src/a.ts",
    });
    const next = panelReducer(state, {
      type: "openPreview",
      id: "preview:2f1a3c4d-5b6e-4f70-8a9b-0c1d2e3f4a5b",
      title: "Preview",
      url: "",
    });
    expect(next.surfaces.map((surface) => surface.kind)).toEqual(["file", "preview"]);
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/right-panel.test.ts`
Expected: FAIL — the three new tests fail with a TypeScript error / no matching reducer case (`openPreview` falls through to `default`, so `activeSurfaceId` stays unchanged and the surfaces array is empty or missing the preview).

- [ ] **Step 3: Add the surface and the action**

In `src/shared/right-panel.ts`:

```ts
export type RightPanelKind =
  | "changes"
  | "files"
  | "plan"
  | "file"
  | "terminal"
  | "preview";
```

after `TerminalSurface`:

```ts
export type PreviewSurface = {
  id: `preview:${string}`;
  kind: "preview";
  title: string;
  url: string;
};
```

widen the union:

```ts
export type RightPanelSurface =
  | SingletonSurface
  | FileSurface
  | TerminalSurface
  | PreviewSurface;
```

add the action after `openTerminal`:

```ts
  | { type: "openTerminal"; id: `terminal:${string}`; title: string }
  | {
      type: "openPreview";
      id: `preview:${string}`;
      title: string;
      url: string;
    }
```

and the reducer case immediately after `case "openTerminal"`:

```ts
    case "openPreview": {
      const surface: PreviewSurface = {
        id: action.id,
        kind: "preview",
        title: action.title,
        url: action.url,
      };
      return {
        isOpen: true,
        activeSurfaceId: surface.id,
        surfaces: upsert(state.surfaces, surface),
      };
    }
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/right-panel.test.ts`
Expected: PASS, and the pre-existing terminal and file cases still pass.

- [ ] **Step 5: Commit**

```bash
git add src/shared/right-panel.ts tests/right-panel.test.ts
git commit -m "Add the preview surface to the panel model"
```

---

### Task 2: URL detection

**Files:**
- Create: `src/main/preview-detect.ts`
- Test: `tests/preview-detect.test.ts`

**Interfaces:**
- Consumes: `normalizePreviewUrl` (Task 0).
- Produces: `detectLocalUrls(text: string): string[]`, `transcriptText(events: readonly TranscriptEvent[]): string`, and `class UrlStore` with `list(sessionId): string[]`, `add(sessionId, urls): string[] | null` (null when nothing changed) and `remove(sessionId): void`.

- [ ] **Step 1: Write the failing test**

`tests/preview-detect.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { detectLocalUrls, transcriptText, UrlStore } from "../src/main/preview-detect.ts";

describe("detectLocalUrls", () => {
  it("finds the vite and next banner shapes", () => {
    expect(detectLocalUrls("  ➜  Local:   http://localhost:5173/")).toEqual([
      "http://localhost:5173/",
    ]);
    expect(detectLocalUrls("- ready started server on 0.0.0.0:3000")).toEqual([]);
    expect(detectLocalUrls("ready - started server on http://127.0.0.1:3000")).toEqual([
      "http://127.0.0.1:3000/",
    ]);
  });

  it("finds a bare host and port and normalizes it to http", () => {
    expect(detectLocalUrls("listening on localhost:8080")).toEqual([
      "http://localhost:8080/",
    ]);
  });

  it("trims trailing punctuation and dedupes", () => {
    expect(
      detectLocalUrls("see http://localhost:5173/app, and http://localhost:5173/app again"),
    ).toEqual(["http://localhost:5173/app"]);
    expect(detectLocalUrls("(http://localhost:3000/)")).toEqual(["http://localhost:3000/"]);
  });

  it("ignores remote urls and non-http schemes", () => {
    expect(detectLocalUrls("deployed to https://relay.example.com/")).toEqual([]);
    expect(detectLocalUrls("file:///tmp/index.html")).toEqual([]);
    expect(detectLocalUrls("no urls here")).toEqual([]);
  });
});

describe("transcriptText", () => {
  it("collects url-bearing strings from any payload field", () => {
    const text = transcriptText([
      {
        id: "e1",
        kind: "agent_message",
        payload: { text: "dev server: http://localhost:5173/" },
      },
      {
        id: "e2",
        kind: "tool_call",
        payload: { content: [{ type: "text", text: "ready on localhost:4000" }] },
      },
    ]);
    expect(detectLocalUrls(text)).toEqual([
      "http://localhost:5173/",
      "http://localhost:4000/",
    ]);
  });
});

describe("UrlStore", () => {
  it("keeps the newest first, dedupes and reports a change once", () => {
    const store = new UrlStore();
    expect(store.list("s1")).toEqual([]);
    expect(store.add("s1", ["http://localhost:5173/"])).toEqual(["http://localhost:5173/"]);
    expect(store.add("s1", ["http://localhost:5173/"])).toBeNull();
    expect(store.add("s1", ["http://localhost:3000/"])).toEqual([
      "http://localhost:3000/",
      "http://localhost:5173/",
    ]);
    expect(store.list("s1")).toEqual(["http://localhost:3000/", "http://localhost:5173/"]);
  });

  it("caps at eight and isolates sessions", () => {
    const store = new UrlStore();
    for (let index = 0; index < 12; index += 1) {
      store.add("s1", [`http://localhost:${5000 + index}/`]);
    }
    expect(store.list("s1")).toHaveLength(8);
    expect(store.list("s1")[0]).toBe("http://localhost:5011/");
    expect(store.list("s2")).toEqual([]);
    store.remove("s1");
    expect(store.list("s1")).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/preview-detect.test.ts`
Expected: FAIL — `Failed to resolve import "../src/main/preview-detect.ts"`.

- [ ] **Step 3: Write `src/main/preview-detect.ts`**

```ts
import { normalizePreviewUrl } from "../shared/preview.ts";
import type { TranscriptEvent } from "../shared/types.ts";

const ABSOLUTE = /\bhttps?:\/\/[^\s<>"'`)\]]+/gi;
const BARE = /\b(?:localhost|127\.0\.0\.1)(?::\d{2,5})?(?:\/[^\s<>"'`)\]]*)?/gi;
const TRAILING = /[.,;:!?'")\]]+$/;
const MAX_DETECTED = 8;

export function detectLocalUrls(text: string): string[] {
  const candidates = [...(text.match(ABSOLUTE) ?? []), ...(text.match(BARE) ?? [])];
  const found: string[] = [];
  for (const raw of candidates) {
    const normalized = normalizePreviewUrl(raw.replace(TRAILING, ""));
    if (!normalized.ok) continue;
    if (found.includes(normalized.url)) continue;
    found.push(normalized.url);
  }
  return found;
}

/**
 * A transcript payload is agent-shaped and untyped; stringifying it finds a URL
 * in any field without this module having to know every event shape.
 */
export function transcriptText(events: readonly TranscriptEvent[]): string {
  return events.map((event) => JSON.stringify(event.payload)).join("\n");
}

export class UrlStore {
  private readonly bySession = new Map<string, string[]>();

  list(sessionId: string): string[] {
    return [...(this.bySession.get(sessionId) ?? [])];
  }

  /** Returns the new list when it changed, or null when it is identical. */
  add(sessionId: string, urls: readonly string[]): string[] | null {
    const current = this.bySession.get(sessionId) ?? [];
    const merged: string[] = [];
    for (const url of [...urls, ...current]) {
      if (merged.includes(url)) continue;
      merged.push(url);
      if (merged.length === MAX_DETECTED) break;
    }
    if (merged.length === current.length && merged.every((url, i) => url === current[i])) {
      return null;
    }
    this.bySession.set(sessionId, merged);
    return merged;
  }

  remove(sessionId: string): void {
    this.bySession.delete(sessionId);
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/preview-detect.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add src/main/preview-detect.ts tests/preview-detect.test.ts
git commit -m "Detect local dev-server urls in output and transcripts"
```

---

### Task 3: `PreviewManager`

**Files:**
- Create: `src/main/preview-manager.ts`
- Test: `tests/preview-manager.test.ts`

**Interfaces:**
- Consumes: Task 0's shared contract.
- Produces: `Rect`, `ViewLike`, `HostWindowLike`, `PreviewManagerDeps`, `toRect(value): Rect | null`, and `class PreviewManager` with `onEvent(listener): () => void`, `create({ sessionId, url, senderId })`, `show(previewId, sessionId, senderId, url)`, `setBounds(previewId, rect | null)`, `navigate(previewId, url)`, `reload(previewId)`, `close(previewId)`, `removeSession(sessionId)`, `sweep(activeSessionIds)`, `shutdown()`.
- **This module must not import `electron`** (not even as a value): `tests/index.test.ts` imports `src/main/index.ts` under a plain Node electron mock. The electron-aware adapter lives in Task 4.

- [ ] **Step 1: Write the failing test**

`tests/preview-manager.test.ts`:

```ts
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
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run tests/preview-manager.test.ts`
Expected: FAIL — `Failed to resolve import "../src/main/preview-manager.ts"`.

- [ ] **Step 4: Write `src/main/preview-manager.ts`**

```ts
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
    if (rect) {
      view.setBounds(rect);
      view.setVisible(true);
      return;
    }
    view.setVisible(false);
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
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run tests/preview-manager.test.ts`
Expected: PASS, 10 tests.

- [ ] **Step 6: Commit**

```bash
git add src/main/preview-manager.ts tests/preview-manager.test.ts
git commit -m "Add the preview manager with local-only policy and view lifecycle"
```

---

### Task 4: Main wiring, IPC handlers, preload bridge

**Files:**
- Create: `src/main/preview-view.ts`
- Modify: `src/main/index.ts` (imports, manager construction `:227-231`, terminal feed `:231`, transcript feed `:248-265`, `relay:delete` `:498-501`, sweep `:262`, `before-quit` `:677-684`, handlers after `:625`, `createWindow` `:76-114`)
- Modify: `src/main/terminal-manager.ts` (add `sessionIdOf`)
- Modify: `src/preload/index.ts:130-152`, `src/renderer/env.d.ts:86-98`
- Test: `tests/index.test.ts`, `tests/terminal-manager.test.ts`

**Interfaces:**
- Consumes: `PreviewManager`, `toRect`, `ViewLike`, `HostWindowLike` (Task 3); `detectLocalUrls`, `transcriptText`, `UrlStore` (Task 2); `isPreviewId`, `normalizePreviewUrl`, `PreviewEvent` (Task 0); `TerminalManager.sessionIdOf` (added here).
- Produces: `createPreviewView(): ViewLike` in `src/main/preview-view.ts`; the channels `relay:previewCreate`, `relay:previewShow`, `relay:previewLayout`, `relay:previewNavigate`, `relay:previewReload`, `relay:previewClose`, `relay:previewDetected`, `relay:openExternal`, and the push channel `relay:previewEvent`; and `window.relay.preview.*` plus `window.relay.openExternal` with these exact signatures:
  - `create(sessionId, url) => Promise<{ previewId; title; url }>`
  - `show(previewId, sessionId, url) => Promise<void>`
  - `layout(previewId, rect: {x;y;width;height} | null) => Promise<void>`
  - `navigate(previewId, url) => Promise<{ ok: true; url } | { ok: false; reason }>`
  - `reload(previewId) => Promise<void>`, `close(previewId) => Promise<void>`
  - `detected(sessionId) => Promise<string[]>`
  - `onEvent(listener) => () => void`
  - `openExternal(url) => Promise<void>`

- [ ] **Step 1: Add `sessionIdOf` with its test**

`tests/terminal-manager.test.ts` already has a create test with its own fixtures.
Add these two assertions to the end of that test body rather than inventing a new
harness, so the file's existing helper keeps working:

```ts
    expect(manager.sessionIdOf(terminalId)).toBe("s1");
    expect(manager.sessionIdOf("terminal:1")).toBeNull();
```

Substitute the identifiers that test already binds (its session id and the
`terminalId` it created); if it creates under a different session id, assert
against that value instead of `"s1"`.

In `src/main/terminal-manager.ts`, next to `onEvent`:

```ts
  sessionIdOf(terminalId: string): string | null {
    return this.entries.get(terminalId)?.sessionId ?? null;
  }
```

Run: `npx vitest run tests/terminal-manager.test.ts`
Expected: PASS (the pre-existing 19 cases plus the two assertions).

- [ ] **Step 2: Write the failing index test**

In `tests/index.test.ts`, above `vi.hoisted`, add a fake view class beside `FakePty`:

```ts
class FakeWebContentsView {
  handlers = new Map<string, Array<(...args: unknown[]) => void>>();
  sessionHandlers = new Map<string, Array<(...args: unknown[]) => void>>();
  permissionHandler: ((c: unknown, p: string, cb: (granted: boolean) => void) => void) | null =
    null;
  loaded: string[] = [];
  bounds: { x: number; y: number; width: number; height: number } | null = null;
  visible = false;
  destroyed = false;
  windowOpenHandler: ((details: { url: string }) => { action: "deny" }) | null = null;

  private readonly session = {
    on: (event: string, listener: (...args: unknown[]) => void) => {
      const current = this.sessionHandlers.get(event) ?? [];
      current.push(listener);
      this.sessionHandlers.set(event, current);
    },
    setPermissionRequestHandler: (
      handler: (c: unknown, p: string, cb: (granted: boolean) => void) => void,
    ) => {
      this.permissionHandler = handler;
    },
  };

  webContents = {
    loadURL: (url: string) => {
      this.loaded.push(url);
      return Promise.resolve();
    },
    reload: () => {},
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
    setWindowOpenHandler: (handler: FakeWebContentsView["windowOpenHandler"]) => {
      this.windowOpenHandler = handler;
    },
    session: this.session,
  };

  setBounds(rect: { x: number; y: number; width: number; height: number }): void {
    this.bounds = rect;
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
  }

  emit(event: string, ...args: unknown[]): void {
    for (const listener of this.handlers.get(event) ?? []) listener(...args);
  }
}
```

Add to the `h` hoisted object: `views: [] as FakeWebContentsView[]`, `addedViews: [] as unknown[]`, `removedViews: [] as unknown[]`, `openExternal: [] as string[]`.

In the `BrowserWindow` mock, give `webContents` an id and a recorded open handler, and add `contentView`:

```ts
    webContents = {
      id: h.windows.length + 1,
      send: (channel: string, payload: unknown) =>
        void h.broadcasts.push({ channel, payload }),
      setWindowOpenHandler: (
        handler: (details: { url: string }) => { action: "deny" },
      ) => {
        this.windowOpenHandler = handler;
      },
    };
    windowOpenHandler: ((details: { url: string }) => { action: "deny" }) | null = null;
    contentView = {
      addChildView: (view: unknown) => void h.addedViews.push(view),
      removeChildView: (view: unknown) => void h.removedViews.push(view),
    };
```

In the returned electron module, extend `shell` and add a `WebContents` stub is **not** needed (the manager takes the window lookup as a dependency):

```ts
    shell: {
      openPath: async () => "",
      showItemInFolder: () => {},
      openExternal: async (url: string) => void h.openExternal.push(url),
    },
```

And add the preview-view mock beside the terminal-manager mock:

```ts
vi.mock("../src/main/preview-view.ts", () => ({
  createPreviewView: () => {
    const view = new FakeWebContentsView();
    h.views.push(view);
    return view;
  },
}));
```

Then the test, at the end of the `describe("main relay:getState")` block:

```ts
  it("exposes preview handlers that lay out, navigate and sweep", async () => {
    h.userData = mkdtempSync(join(tmpdir(), "relay-index-"));
    h.views.length = 0;
    h.ptys.length = 0;
    h.broadcasts.length = 0;
    h.addedViews.length = 0;
    h.removedViews.length = 0;
    h.openExternal.length = 0;
    await import("../src/main/index.ts");
    await waitFor(() => h.handlers.get("relay:getState"));

    const create = h.handlers.get("relay:previewCreate")!;
    await expect(create({ sender: { id: 1 } }, "no-such-session", "")).rejects.toThrow(
      "Unknown session",
    );

    const saveAgent = h.handlers.get("relay:saveAgent")!;
    const createSession = h.handlers.get("relay:create")!;
    const savedAgent = saveAgent({}, {
      id: "fake",
      name: "Fake ACP",
      command: process.execPath,
      args: [agentPath],
      env: {},
    }) as AgentConfig;
    const session = (await createSession({}, {
      agentId: savedAgent.id,
      cwd: process.cwd(),
      prompt: "hello",
    })) as Session;

    const created = create({ sender: { id: 1 } }, session.id, "") as {
      previewId: string;
      title: string;
      url: string;
    };
    expect(created.previewId).toMatch(/^preview:[0-9a-fA-F-]{36}$/);
    expect(created.title).toBe("Preview");
    expect(h.views).toHaveLength(0); // creation is lazy

    const show = h.handlers.get("relay:previewShow")!;
    show({ sender: { id: 1 } }, created.previewId, session.id, "http://localhost:5173/");
    expect(h.views).toHaveLength(1);
    expect(h.views[0]!.loaded).toEqual(["http://localhost:5173/"]);
    expect(h.addedViews).toEqual([h.views[0]]);

    const layout = h.handlers.get("relay:previewLayout")!;
    layout({}, created.previewId, { x: 0, y: 0, width: 400, height: 300 });
    expect(h.views[0]!.bounds).toEqual({ x: 0, y: 0, width: 400, height: 300 });
    expect(h.views[0]!.visible).toBe(true);
    layout({}, created.previewId, null);
    expect(h.views[0]!.visible).toBe(false);

    const navigate = h.handlers.get("relay:previewNavigate")!;
    expect(navigate({}, created.previewId, "https://example.com/")).toEqual({
      ok: false,
      reason: expect.stringContaining("example.com"),
    });
    expect(navigate({}, created.previewId, "localhost:4000")).toEqual({
      ok: true,
      url: "http://localhost:4000/",
    });
    expect(h.views[0]!.loaded).toEqual([
      "http://localhost:5173/",
      "http://localhost:4000/",
    ]);

    h.views[0]!.emit("did-finish-load");
    await waitFor(() =>
      h.broadcasts.some((entry) => entry.channel === "relay:previewEvent") ? true : undefined,
    );
    expect(h.broadcasts).toContainEqual({
      channel: "relay:previewEvent",
      payload: {
        type: "previewState",
        previewId: created.previewId,
        state: "loaded",
      },
    });

    // Terminal output feeds the detector, which broadcasts the previews event.
    const terminalCreate = h.handlers.get("relay:terminalCreate")!;
    await terminalCreate({}, session.id, 80, 24);
    h.ptys[0]!.emitData("  ➜  Local:   http://localhost:5173/");
    await waitFor(() =>
      h.broadcasts.some(
        (entry) =>
          entry.channel === "relay:event" &&
          (entry.payload as { type?: string }).type === "previews",
      )
        ? true
        : undefined,
    );
    expect(h.broadcasts).toContainEqual({
      channel: "relay:event",
      payload: { type: "previews", sessionId: session.id, urls: ["http://localhost:5173/"] },
    });

    const detected = h.handlers.get("relay:previewDetected")!;
    expect(detected({}, session.id)).toEqual(["http://localhost:5173/"]);

    const openExternal = h.handlers.get("relay:openExternal")!;
    await openExternal({}, "http://localhost:5173/");
    await openExternal({}, "https://example.com/");
    expect(h.openExternal).toEqual(["http://localhost:5173/"]);

    const remove = h.handlers.get("relay:delete")!;
    await remove({}, session.id);
    expect(h.views[0]!.destroyed).toBe(true);
    expect(h.removedViews).toEqual([h.views[0]]);
  });

  it("routes target=_blank links from the app window to the system browser", async () => {
    h.userData = mkdtempSync(join(tmpdir(), "relay-index-"));
    await import("../src/main/index.ts");
    await waitFor(() => h.handlers.get("relay:getState"));

    const win = h.windows[0] as { windowOpenHandler: (details: { url: string }) => { action: string } };
    expect(win.windowOpenHandler({ url: "https://example.com/docs" })).toEqual({
      action: "deny",
    });
    expect(h.openExternal).toContain("https://example.com/docs");
  });

  it("accepts invalid certificates only for local hosts", async () => {
    h.userData = mkdtempSync(join(tmpdir(), "relay-index-"));
    await import("../src/main/index.ts");
    const listener = await waitFor(
      () => h.appListeners.get("certificate-error")?.[0],
    );

    const localEvent = { preventDefault: vi.fn() };
    const localCallback = vi.fn();
    listener(localEvent, {}, "https://localhost:5173/", "err", {}, localCallback);
    expect(localEvent.preventDefault).toHaveBeenCalledTimes(1);
    expect(localCallback).toHaveBeenCalledWith(true);

    const remoteCallback = vi.fn();
    listener({ preventDefault: vi.fn() }, {}, "https://example.com/", "err", {}, remoteCallback);
    expect(remoteCallback).toHaveBeenCalledWith(false);
  });
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run tests/index.test.ts`
Expected: FAIL — `h.handlers.get("relay:previewCreate")` is undefined (`TypeError: create is not a function`), and the mocked `preview-view` module does not exist yet.

- [ ] **Step 4: Write `src/main/preview-view.ts`**

```ts
import { WebContentsView } from "electron";
import { PREVIEW_PARTITION } from "../shared/preview.ts";
import type { ViewLike } from "./preview-manager.ts";

/**
 * The only place a real WebContentsView is constructed. Everything else works
 * through ViewLike, which is why tests never need electron here.
 */
export function createPreviewView(): ViewLike {
  const view = new WebContentsView({
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      partition: PREVIEW_PARTITION,
    },
  });
  view.setBackgroundColor("#1f1f1f");
  return view as unknown as ViewLike;
}
```

- [ ] **Step 5: Wire it into `src/main/index.ts`**

Imports (beside the terminal ones):

```ts
import {
  isPreviewId,
  normalizePreviewUrl,
  type PreviewEvent,
} from "../shared/preview.ts";
import { detectLocalUrls, transcriptText, UrlStore } from "./preview-detect.ts";
import { PreviewManager, toRect } from "./preview-manager.ts";
import { createPreviewView } from "./preview-view.ts";
```

Window lookup + manager, right after the `terminals` block (`:227-231`):

```ts
  const hostWindow = (senderId: number): HostWindowLike | null => {
    for (const win of windows) {
      if (win.isDestroyed()) continue;
      if (win.webContents.id !== senderId) continue;
      return {
        isDestroyed: () => win.isDestroyed(),
        addView: (view) => win.contentView.addChildView(view as unknown as View),
        removeView: (view) => win.contentView.removeChildView(view as unknown as View),
      };
    }
    return null;
  };

  const previews = new PreviewManager({
    createView: createPreviewView,
    openExternal: (url) => void shell.openExternal(url),
    getWindow: hostWindow,
  });
  previews.onEvent((event) => broadcast("relay:previewEvent", event));

  const detectedUrls = new UrlStore();
  const publishDetected = (sessionId: string, urls: readonly string[]): void => {
    const list = detectedUrls.add(sessionId, urls);
    if (!list) return;
    broadcast("relay:event", { type: "previews", sessionId, urls: list } satisfies RelayEvent);
  };
```

`HostWindowLike` and `View` need importing: add `type HostWindowLike` to the preview-manager import and `View` to the electron import at the top of the file.

Feed the detector from terminal output — the `terminals.onEvent` line becomes a block:

```ts
  terminals.onEvent((event) => {
    if (event.type === "terminalData") {
      const sessionId = terminals.sessionIdOf(event.terminalId);
      if (sessionId) publishDetected(sessionId, detectLocalUrls(event.data));
    }
    broadcast("relay:terminalEvent", event);
  });
```

Feed it from transcript text — inside `manager.onEvent`, before `broadcast("relay:event", event)`:

```ts
    if (event.type === "transcript") {
      publishDetected(event.sessionId, detectLocalUrls(transcriptText(event.events)));
    }
```

Sweep and session deletion, next to the terminal calls:

```ts
      terminals.sweep(event.sessions.map((session) => session.id));
      previews.sweep(event.sessions.map((session) => session.id));
```

```ts
  ipcMain.handle("relay:delete", async (_e, id: string) => {
    terminals.removeSession(id);
    previews.removeSession(id);
    detectedUrls.remove(id);
    await manager.delete(id);
  });
```

(The existing `relay:delete` handler body already calls `terminals.removeSession(id)` and `manager.delete(id)`; add the two preview lines to it rather than rewriting it.)

Handlers, after the terminal handlers (`:625`):

```ts
  ipcMain.handle("relay:previewCreate", (event, sessionId: unknown, url: unknown) => {
    if (typeof sessionId !== "string") throw new Error("Unknown session");
    if (!manager.get(sessionId)) throw new Error("Unknown session");
    return previews.create({
      sessionId,
      url: typeof url === "string" ? url : "",
      senderId: event.sender.id,
    });
  });

  ipcMain.handle(
    "relay:previewShow",
    (event, previewId: unknown, sessionId: unknown, url: unknown) => {
      if (!isPreviewId(previewId) || typeof sessionId !== "string") return;
      previews.show(previewId, sessionId, event.sender.id, typeof url === "string" ? url : "");
    },
  );

  ipcMain.handle("relay:previewLayout", (_e, previewId: unknown, rect: unknown) => {
    if (!isPreviewId(previewId)) return;
    previews.setBounds(previewId, toRect(rect));
  });

  ipcMain.handle("relay:previewNavigate", (_e, previewId: unknown, url: unknown) => {
    if (!isPreviewId(previewId) || typeof url !== "string") {
      return { ok: false, reason: "This preview is no longer running" };
    }
    return previews.navigate(previewId, url);
  });

  ipcMain.handle("relay:previewReload", (_e, previewId: unknown) => {
    if (isPreviewId(previewId)) previews.reload(previewId);
  });

  ipcMain.handle("relay:previewClose", (_e, previewId: unknown) => {
    if (isPreviewId(previewId)) previews.close(previewId);
  });

  ipcMain.handle("relay:previewDetected", (_e, sessionId: unknown) =>
    typeof sessionId === "string" ? detectedUrls.list(sessionId) : [],
  );

  ipcMain.handle("relay:openExternal", async (_e, url: unknown) => {
    if (typeof url !== "string") return;
    const normalized = normalizePreviewUrl(url);
    if (!normalized.ok) return;
    await shell.openExternal(normalized.url);
  });
```

The app window's link route, in `createWindow` right after the `BrowserWindow` is constructed:

```ts
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http:") || url.startsWith("https:")) {
      void shell.openExternal(url);
    }
    return { action: "deny" };
  });
```

Local-only certificate acceptance, beside the other `app.on` listeners (`:670-675`):

```ts
  app.on(
    "certificate-error",
    (event, _webContents, url, _error, _certificate, callback) => {
      if (normalizePreviewUrl(url).ok) {
        event.preventDefault();
        callback(true);
        return;
      }
      callback(false);
    },
  );
```

Shutdown, in `before-quit`:

```ts
    terminals.shutdown();
    previews.shutdown();
    store.flushNow();
```

`PreviewEvent` is imported for the manager's listener type; if TypeScript reports it as unused, drop it from the import list.

- [ ] **Step 6: Add the preload bridge and its type**

In `src/preload/index.ts`, add the imports:

```ts
import type {
  PreviewCreateResult,
  PreviewEvent,
  PreviewNavigateResult,
} from "../shared/preview.ts";
```

a `preview` member before `subscribe`, and `openExternal` beside `windowControl`:

```ts
  openExternal: (url: string): Promise<void> =>
    ipcRenderer.invoke("relay:openExternal", url),
  preview: {
    create: (sessionId: string, url: string): Promise<PreviewCreateResult> =>
      ipcRenderer.invoke("relay:previewCreate", sessionId, url),
    show: (previewId: string, sessionId: string, url: string): Promise<void> =>
      ipcRenderer.invoke("relay:previewShow", previewId, sessionId, url),
    layout: (
      previewId: string,
      rect: { x: number; y: number; width: number; height: number } | null,
    ): Promise<void> => ipcRenderer.invoke("relay:previewLayout", previewId, rect),
    navigate: (previewId: string, url: string): Promise<PreviewNavigateResult> =>
      ipcRenderer.invoke("relay:previewNavigate", previewId, url),
    reload: (previewId: string): Promise<void> =>
      ipcRenderer.invoke("relay:previewReload", previewId),
    close: (previewId: string): Promise<void> =>
      ipcRenderer.invoke("relay:previewClose", previewId),
    detected: (sessionId: string): Promise<string[]> =>
      ipcRenderer.invoke("relay:previewDetected", sessionId),
    onEvent: (listener: (event: PreviewEvent) => void): (() => void) => {
      const handler = (_e: unknown, event: PreviewEvent) => listener(event);
      ipcRenderer.on("relay:previewEvent", handler);
      return () => ipcRenderer.removeListener("relay:previewEvent", handler);
    },
  },
```

Mirror both additions in `src/renderer/env.d.ts` (same imports, same shapes, promise-returning type declarations).

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npx vitest run tests/index.test.ts tests/terminal-manager.test.ts`
Expected: PASS.

Run: `npm run typecheck`
Expected: exit 0.

- [ ] **Step 8: Commit**

```bash
git add src/main/preview-view.ts src/main/preview-manager.ts src/main/index.ts src/main/terminal-manager.ts src/preload/index.ts src/renderer/env.d.ts tests/index.test.ts tests/terminal-manager.test.ts
git commit -m "Expose the preview manager over IPC and route app links outward"
```

---

### Task 5: Generalize surface teardown and persist preview tabs

**Files:**
- Create: `src/renderer/right-panel/surface-lifecycle.ts` (replaces `terminal-lifecycle.ts`)
- Delete: `src/renderer/right-panel/terminal-lifecycle.ts`, `tests/terminal-lifecycle.test.ts`
- Modify: `src/renderer/right-panel/usePanelStore.ts:17,60-71,92-143`
- Modify: `src/renderer/right-panel/persist.ts:1-6,34-55`
- Test: `tests/surface-lifecycle.test.ts`, `tests/use-panel-store.test.tsx`, `tests/right-panel-persist.test.ts`

**Interfaces:**
- Consumes: `RightPanelSurface` (Task 1), `isPreviewId` / `normalizePreviewUrl` (Task 0), `window.relay.preview.close` (Task 4).
- Produces: `closedSurfaceIds(before, after): RightPanelSurface[]`; `defaultCloseSurface(surface: RightPanelSurface): void` (exported from `usePanelStore.ts`); `usePanelStore(sessionId, closeSurface = defaultCloseSurface)`.

- [ ] **Step 1: Write the failing lifecycle test**

`tests/surface-lifecycle.test.ts` (delete `tests/terminal-lifecycle.test.ts` in the same commit):

```ts
import { describe, expect, it } from "vitest";
import { closedSurfaceIds } from "../src/renderer/right-panel/surface-lifecycle.ts";
import type { RightPanelSurface } from "../src/shared/right-panel.ts";

const TERMINAL: RightPanelSurface = {
  id: "terminal:11111111-1111-4111-8111-111111111111",
  kind: "terminal",
  title: "Terminal 1",
};
const PREVIEW: RightPanelSurface = {
  id: "preview:22222222-2222-4222-8222-222222222222",
  kind: "preview",
  title: "localhost:5173",
  url: "http://localhost:5173/",
};
const PLAN: RightPanelSurface = { id: "plan", kind: "plan" };

describe("closedSurfaceIds", () => {
  it("reports nothing when every surface survives", () => {
    expect(closedSurfaceIds([TERMINAL, PREVIEW], [TERMINAL, PREVIEW])).toEqual([]);
  });

  it("reports a removed terminal and a removed preview", () => {
    expect(closedSurfaceIds([TERMINAL, PREVIEW, PLAN], [PLAN])).toEqual([TERMINAL, PREVIEW]);
    expect(closedSurfaceIds([TERMINAL, PREVIEW], [TERMINAL])).toEqual([PREVIEW]);
  });

  it("ignores kinds that own no main-process resource", () => {
    expect(closedSurfaceIds([PLAN], [])).toEqual([]);
  });

  it("reports everything when the session is removed", () => {
    expect(closedSurfaceIds([TERMINAL, PREVIEW], [])).toEqual([TERMINAL, PREVIEW]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/surface-lifecycle.test.ts`
Expected: FAIL — `Failed to resolve import ".../surface-lifecycle.ts"`.

- [ ] **Step 3: Write `surface-lifecycle.ts` and delete the old pair**

```ts
import type { RightPanelSurface } from "../../shared/right-panel.ts";

/**
 * The surfaces that vanished between two panel states. Every removal path
 * (close, closeOthers, closeAll, removeSession) flows through the caller, so a
 * main-process resource is never leaked by a path nobody remembered.
 */
export function closedSurfaceIds(
  before: readonly RightPanelSurface[],
  after: readonly RightPanelSurface[],
): RightPanelSurface[] {
  const closed: RightPanelSurface[] = [];
  for (const surface of before) {
    if (surface.kind !== "terminal" && surface.kind !== "preview") continue;
    if (after.some((entry) => entry.id === surface.id)) continue;
    closed.push(surface);
  }
  return closed;
}
```

Run: `git rm src/renderer/right-panel/terminal-lifecycle.ts tests/terminal-lifecycle.test.ts`

- [ ] **Step 4: Generalize the store**

In `src/renderer/right-panel/usePanelStore.ts`:

```ts
import { closedSurfaceIds } from "./surface-lifecycle.ts";
import type { RightPanelSurface } from "../../shared/right-panel.ts";
```

replace `defaultCloseTerminal` with:

```ts
export function defaultCloseSurface(surface: RightPanelSurface): void {
  try {
    if (surface.kind === "terminal") void window.relay.terminal.close(surface.id);
    else if (surface.kind === "preview") void window.relay.preview.close(surface.id);
  } catch {
    return;
  }
}
```

and change the signature and both loops:

```ts
export function usePanelStore(
  sessionId: string | null,
  closeSurface: (surface: RightPanelSurface) => void = defaultCloseSurface,
) {
```

```ts
      for (const surface of closedSurfaceIds(current.surfaces, next.surfaces)) {
        closeSurface(surface);
      }
```

```ts
      for (const surface of closedSurfaceIds(
        panelsRef.current[id]?.surfaces ?? [],
        [],
      )) {
        closeSurface(surface);
      }
```

Update the dependency arrays from `closeTerminal` to `closeSurface`. `src/renderer/App.tsx:441` needs no change: the default routes by kind.

- [ ] **Step 5: Extend the store test**

In `tests/use-panel-store.test.tsx`, keep the existing probe and add:

```ts
import { defaultCloseSurface } from "../src/renderer/right-panel/usePanelStore.ts";

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
```

with the probe beside the existing one:

```tsx
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
```

- [ ] **Step 6: Add the persist branch**

In `src/renderer/right-panel/persist.ts`, import `isPreviewId` and `normalizePreviewUrl` from `../../shared/preview.ts`, and add before the file branch:

```ts
  if (value.kind === "preview") {
    if (!isPreviewId(value.id)) return null;
    const title = typeof value.title === "string" && value.title ? value.title : null;
    if (!title) return null;
    const raw = typeof value.url === "string" ? value.url : "";
    if (raw === "") return { id: value.id, kind: "preview", title, url: "" };
    const normalized = normalizePreviewUrl(raw);
    if (!normalized.ok) return null;
    return { id: value.id, kind: "preview", title, url: normalized.url };
  }
```

Add to `tests/right-panel-persist.test.ts`, beside the terminal case:

```ts
  it("keeps a well-formed preview surface and drops remote or malformed ones", () => {
    const panels = parsePanels(
      JSON.stringify({
        version: 1,
        bySession: {
          s1: {
            isOpen: true,
            activeSurfaceId: "preview:2f1a3c4d-5b6e-4f70-8a9b-0c1d2e3f4a5b",
            surfaces: [
              {
                id: "preview:2f1a3c4d-5b6e-4f70-8a9b-0c1d2e3f4a5b",
                kind: "preview",
                title: "localhost:5173",
                url: "localhost:5173",
              },
              { id: "preview:1", kind: "preview", title: "counter", url: "" },
              { id: "preview:2f1a3c4d-5b6e-4f70-8a9b-0c1d2e3f4a5b", kind: "preview", title: "x" },
              {
                id: "preview:3f1a3c4d-5b6e-4f70-8a9b-0c1d2e3f4a5b",
                kind: "preview",
                title: "remote",
                url: "https://example.com/",
              },
            ],
          },
        },
      }),
    );
    expect(panels.s1!.surfaces).toEqual([
      {
        id: "preview:2f1a3c4d-5b6e-4f70-8a9b-0c1d2e3f4a5b",
        kind: "preview",
        title: "localhost:5173",
        url: "http://localhost:5173/",
      },
    ]);
  });
```

- [ ] **Step 7: Run the tests**

Run: `npx vitest run tests/surface-lifecycle.test.ts tests/use-panel-store.test.tsx tests/right-panel-persist.test.ts`
Expected: PASS.

Run: `npm run typecheck`
Expected: exit 0 (the two `RightPanelTabs` errors are still absent; nothing else referenced `closedTerminalIds`).

- [ ] **Step 8: Commit**

```bash
git add src/renderer/right-panel/surface-lifecycle.ts src/renderer/right-panel/usePanelStore.ts src/renderer/right-panel/persist.ts tests/surface-lifecycle.test.ts tests/use-panel-store.test.tsx tests/right-panel-persist.test.ts
git commit -m "Close terminal and preview surfaces through one path and persist preview tabs"
```

---

### Task 6: Panel integration — tabs, launcher, layout, styles

**Files:**
- Create: `src/renderer/right-panel/usePreviewLauncher.ts`, `src/renderer/right-panel/usePreviewLayout.ts`, `src/renderer/right-panel/useDetectedUrls.ts`
- Modify: `src/renderer/right-panel/RightPanelTabs.tsx:1-57,204-225`, `src/renderer/right-panel/RightPanel.tsx:1-12,14-28,87-90,113-118,146-153,186-192`, `src/renderer/styles.css` (after `.panel-terminal-footer` at `:4610`)
- Test: `tests/use-preview-launcher.test.tsx`, `tests/use-preview-layout.test.tsx`, `tests/use-detected-urls.test.tsx`, `tests/right-panel-tabs.test.tsx`

**Interfaces:**
- Consumes: `window.relay.preview.*`, `window.relay.subscribe`, `RightPanelKind` (Task 1), `normalizePreviewUrl` (Task 0), `PANEL_BODY_ID` / `surfaceTitle` / `surfaceIcon` (`RightPanelTabs.tsx`).
- Produces: `usePreviewLauncher(sessionId, dispatch) => { launch(url?), error }`; `usePreviewLayout(previewId, enabled) => (node: HTMLDivElement | null) => void`; `useDetectedUrls(sessionId) => string[]`; `RightPanelTabs` gains required `onNewPreview: () => void` and optional `onOverlayChange?: (open: boolean) => void`; `RightPanel` gains optional `onNewPreview?: () => void` and renders the preview branch with `hidden={menuOpen || dragging}`.

- [ ] **Step 1: Write the failing hook tests**

`tests/use-preview-launcher.test.tsx`:

```tsx
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { usePreviewLauncher } from "../src/renderer/right-panel/usePreviewLauncher.ts";

afterEach(cleanup);

function Probe({ onReady }: { onReady: (launch: (url?: string) => void) => void }) {
  const { launch, error } = usePreviewLauncher("s1", (action) => {
    (window as unknown as { dispatched: unknown[] }).dispatched.push(action);
  });
  onReady(launch);
  return <p>{error ?? "no error"}</p>;
}

describe("usePreviewLauncher", () => {
  it("creates a preview and dispatches openPreview", async () => {
    const create = vi.fn(async () => ({
      previewId: "preview:22222222-2222-4222-8222-222222222222",
      title: "localhost:5173",
      url: "http://localhost:5173/",
    }));
    (window as unknown as { relay: unknown }).relay = { preview: { create } };
    (window as unknown as { dispatched: unknown[] }).dispatched = [];
    let launch: (url?: string) => void = () => {};
    render(<Probe onReady={(value) => (launch = value)} />);
    launch("localhost:5173");
    await screen.findByText("no error");
    expect(create).toHaveBeenCalledWith("s1", "localhost:5173");
    expect((window as unknown as { dispatched: unknown[] }).dispatched).toEqual([
      {
        type: "openPreview",
        id: "preview:22222222-2222-4222-8222-222222222222",
        title: "localhost:5173",
        url: "http://localhost:5173/",
      },
    ]);
  });

  it("shows the refusal and opens no tab", async () => {
    const create = vi.fn(async () => {
      throw new Error("This session already has 8 previews");
    });
    (window as unknown as { relay: unknown }).relay = { preview: { create } };
    (window as unknown as { dispatched: unknown[] }).dispatched = [];
    let launch: (url?: string) => void = () => {};
    render(<Probe onReady={(value) => (launch = value)} />);
    launch();
    await screen.findByText("This session already has 8 previews");
    expect((window as unknown as { dispatched: unknown[] }).dispatched).toEqual([]);
  });
});
```

`tests/use-preview-layout.test.tsx`:

```tsx
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { usePreviewLayout } from "../src/renderer/right-panel/usePreviewLayout.ts";

afterEach(cleanup);

const layout = vi.fn();

function Probe({ enabled }: { enabled: boolean }) {
  const ref = usePreviewLayout("preview:22222222-2222-4222-8222-222222222222", enabled);
  return <div data-testid="void" ref={ref} />;
}

describe("usePreviewLayout", () => {
  it("reports a rounded rect while enabled and null while hidden", () => {
    (window as unknown as { relay: unknown }).relay = { preview: { layout } };
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      x: 10.4,
      y: 20.6,
      width: 400.2,
      height: 300.9,
      top: 20.6,
      left: 10.4,
      right: 410.6,
      bottom: 321.5,
      toJSON: () => ({}),
    } as DOMRect);

    const view = render(<Probe enabled />);
    expect(layout).toHaveBeenCalledWith("preview:22222222-2222-4222-8222-222222222222", {
      x: 10,
      y: 21,
      width: 400,
      height: 301,
    });

    layout.mockClear();
    view.rerender(<Probe enabled={false} />);
    expect(layout).toHaveBeenCalledWith("preview:22222222-2222-4222-8222-222222222222", null);
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });
});
```

`tests/use-detected-urls.test.tsx`:

```tsx
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { useDetectedUrls } from "../src/renderer/right-panel/useDetectedUrls.ts";
import type { RelayEvent } from "../src/shared/ipc.ts";

afterEach(cleanup);

function Probe({ sessionId }: { sessionId: string }) {
  const urls = useDetectedUrls(sessionId);
  return <p>{urls.join(",") || "none"}</p>;
}

describe("useDetectedUrls", () => {
  it("seeds from main and follows the previews event", async () => {
    const listeners: Array<(event: RelayEvent) => void> = [];
    (window as unknown as { relay: unknown }).relay = {
      preview: { detected: vi.fn(async () => ["http://localhost:5173/"]) },
      subscribe: (listener: (event: RelayEvent) => void) => {
        listeners.push(listener);
        return () => {};
      },
    };
    render(<Probe sessionId="s1" />);
    await screen.findByText("http://localhost:5173/");

    listeners[0]!({ type: "previews", sessionId: "s2", urls: ["http://localhost:9999/"] });
    expect(screen.getByText("http://localhost:5173/")).toBeTruthy();

    listeners[0]!({ type: "previews", sessionId: "s1", urls: ["http://localhost:3000/"] });
    expect(await screen.findByText("http://localhost:3000/")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/use-preview-launcher.test.tsx tests/use-preview-layout.test.tsx tests/use-detected-urls.test.tsx`
Expected: FAIL — the three modules do not exist.

- [ ] **Step 3: Write the three hooks**

`usePreviewLauncher.ts`:

```ts
import { useCallback, useState } from "react";
import type { PanelAction } from "../../shared/right-panel.ts";

export function usePreviewLauncher(
  sessionId: string,
  dispatch: (action: PanelAction) => void,
) {
  const [error, setError] = useState<string | null>(null);

  const launch = useCallback(
    async (url = "") => {
      try {
        const created = await window.relay.preview.create(sessionId, url);
        setError(null);
        dispatch({
          type: "openPreview",
          id: created.previewId,
          title: created.title,
          url: created.url,
        });
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause));
      }
    },
    [sessionId, dispatch],
  );

  return { launch, error };
}
```

`useDetectedUrls.ts`:

```ts
import { useEffect, useState } from "react";

export function useDetectedUrls(sessionId: string): string[] {
  const [urls, setUrls] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    setUrls([]);
    void window.relay.preview
      .detected(sessionId)
      .then((list) => {
        if (!cancelled && Array.isArray(list)) setUrls(list);
      })
      .catch(() => {});
    const unsubscribe = window.relay.subscribe((event) => {
      if (event.type !== "previews" || event.sessionId !== sessionId) return;
      setUrls(event.urls);
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [sessionId]);

  return urls;
}
```

`usePreviewLayout.ts`:

```ts
import { useEffect, useRef, useState } from "react";

type Rect = { x: number; y: number; width: number; height: number };

/**
 * Reports where the page must paint. The native view is a child of the window,
 * so it can never be clipped by HTML — hiding is a null rect, not a CSS change.
 * The measured element and View.setBounds share one origin, so the mapping is
 * the identity.
 */
export function usePreviewLayout(
  previewId: string,
  enabled: boolean,
): (node: HTMLDivElement | null) => void {
  const [node, setNode] = useState<HTMLDivElement | null>(null);
  const lastRef = useRef<string>("");

  useEffect(() => {
    const send = (rect: Rect | null) => {
      const key = rect
        ? `${previewId}|${rect.x}:${rect.y}:${rect.width}:${rect.height}`
        : `${previewId}|null`;
      if (lastRef.current === key) return;
      lastRef.current = key;
      void window.relay.preview.layout(previewId, rect);
    };

    if (!node || !enabled) {
      send(null);
      return;
    }

    let frame: number | null = null;
    const measure = () => {
      frame = null;
      const box = node.getBoundingClientRect();
      send({
        x: Math.round(box.x),
        y: Math.round(box.y),
        width: Math.round(box.width),
        height: Math.round(box.height),
      });
    };
    const schedule = () => {
      if (frame !== null) return;
      frame = requestAnimationFrame(measure);
    };

    measure();
    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(schedule);
      observer.observe(node);
    }
    window.addEventListener("resize", schedule);

    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", schedule);
      if (frame !== null) cancelAnimationFrame(frame);
      send(null);
    };
  }, [previewId, node, enabled]);

  return setNode;
}
```

- [ ] **Step 4: Run the hook tests**

Run: `npx vitest run tests/use-preview-launcher.test.tsx tests/use-preview-layout.test.tsx tests/use-detected-urls.test.tsx`
Expected: PASS, 4 tests.

- [ ] **Step 5: Extend the tab strip**

In `src/renderer/right-panel/RightPanelTabs.tsx`, add `IconToolWeb` to the
existing `../icons` import list at `:8-18` (keep it alphabetical, after
`IconTerminal`), then:

```ts
  if (surface.kind === "terminal") return surface.title;
  if (surface.kind === "preview") return surface.title;
```

```tsx
  if (surface.kind === "terminal") return <IconTerminal />;
  if (surface.kind === "preview") return <IconToolWeb />;
```

```ts
  { kind: "terminal", label: "Terminal" },
  { kind: "preview", label: "Preview" },
```

Props and the add-menu branch:

```ts
type Props = {
  state: SessionPanelState;
  dispatch: (action: PanelAction) => void;
  maximized: boolean;
  onMaximize: () => void;
  onNewTerminal: () => void;
  onNewPreview: () => void;
  onOverlayChange?: (open: boolean) => void;
};
```

```ts
export function RightPanelTabs({
  state,
  dispatch,
  maximized,
  onMaximize,
  onNewTerminal,
  onNewPreview,
  onOverlayChange,
}: Props) {
```

with an effect that reports popup visibility (a native view paints above HTML, so the panel must be able to hide it):

```ts
  const overlayOpen = addOpen || menuId !== null;
  useEffect(() => {
    onOverlayChange?.(overlayOpen);
  }, [overlayOpen, onOverlayChange]);
```

and in the add menu:

```tsx
                    if (action.kind === "terminal") {
                      onNewTerminal();
                      return;
                    }
                    if (action.kind === "preview") {
                      onNewPreview();
                      return;
                    }
                    dispatch({ type: "open", kind: action.kind });
```

Update `tests/right-panel-tabs.test.tsx`: every `<RightPanelTabs …>` render gains `onNewPreview={() => {}}`, and add:

```tsx
  it("offers Preview and calls onNewPreview without dispatching", () => {
    const dispatch = vi.fn();
    const onNewPreview = vi.fn();
    render(
      <RightPanelTabs
        state={EMPTY_PANEL_STATE}
        dispatch={dispatch}
        maximized={false}
        onMaximize={() => {}}
        onNewTerminal={() => {}}
        onNewPreview={onNewPreview}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Add panel surface" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Preview" }));
    expect(onNewPreview).toHaveBeenCalledTimes(1);
    expect(dispatch).not.toHaveBeenCalled();
  });
```

- [ ] **Step 6: Integrate into `RightPanel.tsx`**

```ts
import { PanelPreview } from "./PanelPreview.tsx";
import { useDetectedUrls } from "./useDetectedUrls.ts";
import { usePreviewLauncher } from "./usePreviewLauncher.ts";
```

Props gain `onNewPreview?: () => void;` (destructured as `onNewPreview: onNewPreviewProp`).

Before the `if (!state.isOpen) return null;` early return, beside the terminal launcher:

```ts
  const launcher = useTerminalLauncher(sessionId, dispatch);
  const onNewTerminal = onNewTerminalProp ?? launcher.launch;
  const detectedUrls = useDetectedUrls(sessionId);
  const previewLauncher = usePreviewLauncher(sessionId, dispatch);
  const onNewPreview =
    onNewPreviewProp ?? (() => void previewLauncher.launch(detectedUrls[0] ?? ""));
  const [popupOpen, setPopupOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
```

`onPointerDown` sets `setDragging(true)` and `onPointerUp`/`onPointerCancel` set `setDragging(false)`.

The error line and tabs wiring:

```tsx
        {launcher.error ?? previewLauncher.error ? (
          <p className="panel-note">{launcher.error ?? previewLauncher.error}</p>
        ) : null}
```

```tsx
        <RightPanelTabs
          state={state}
          dispatch={dispatch}
          maximized={maximized}
          onMaximize={() => setMaximized((value) => !value)}
          onNewTerminal={onNewTerminal}
          onNewPreview={onNewPreview}
          onOverlayChange={setPopupOpen}
        />
```

and the render branch after the terminal one:

```tsx
          {active?.kind === "preview" ? (
            <PanelPreview
              key={active.id}
              previewId={active.id}
              initialUrl={active.url}
              suggestions={detectedUrls}
              hidden={popupOpen || dragging}
            />
          ) : null}
```

`activePreviewId` is not needed: `PanelPreview` owns its own layout hook, so
`RightPanel` never computes the rect. The branch above renders `PanelPreview`
with the props it needs.

- [ ] **Step 7: Add the styles**

After `.panel-terminal-footer` in `src/renderer/styles.css`:

```css
.panel-preview {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.panel-preview-chrome {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  border-bottom: 1px solid var(--line);
}

.panel-preview-address {
  flex: 1;
  min-width: 0;
  padding: 4px 8px;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: var(--base);
  color: inherit;
  font-family: var(--mono);
  font-size: 12px;
}

.panel-preview-status {
  font-size: 11px;
  opacity: 0.7;
  white-space: nowrap;
}

.panel-preview-state {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
  padding: 10px 8px;
}

.panel-preview-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.panel-preview-void {
  flex: 1;
  min-height: 0;
}
```

- [ ] **Step 8: Run the tests**

Run: `npx vitest run tests/right-panel-tabs.test.tsx tests/use-preview-launcher.test.tsx tests/use-preview-layout.test.tsx tests/use-detected-urls.test.tsx`
Expected: PASS.

Run: `npm run typecheck`
Expected: exit 0.

- [ ] **Step 9: Commit**

```bash
git add src/renderer/right-panel/usePreviewLauncher.ts src/renderer/right-panel/usePreviewLayout.ts src/renderer/right-panel/useDetectedUrls.ts src/renderer/right-panel/RightPanelTabs.tsx src/renderer/right-panel/RightPanel.tsx src/renderer/styles.css tests/right-panel-tabs.test.tsx tests/use-preview-launcher.test.tsx tests/use-preview-layout.test.tsx tests/use-detected-urls.test.tsx
git commit -m "Add preview tabs, launch, layout reporting and chrome styles"
```

---

### Task 7: `PanelPreview`

**Files:**
- Create: `src/renderer/right-panel/PanelPreview.tsx`
- Test: `tests/panel-preview.test.tsx`

**Interfaces:**
- Consumes: `usePreviewLayout` (Task 6), `normalizePreviewUrl` / `PreviewEvent` (Task 0), `window.relay.preview.*` and `window.relay.openExternal` (Task 4).
- Produces: `PanelPreview` with props `{ previewId: string; initialUrl: string; suggestions: string[]; hidden: boolean }`.

- [ ] **Step 1: Write the failing test**

`tests/panel-preview.test.tsx`:

```tsx
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { PanelPreview } from "../src/renderer/right-panel/PanelPreview.tsx";
import type { PreviewEvent } from "../src/shared/preview.ts";

afterEach(cleanup);

const ID = "preview:22222222-2222-4222-8222-222222222222";
const LOCAL = "http://localhost:5173/";

function bridge() {
  const listeners: Array<(event: PreviewEvent) => void> = [];
  const api = {
    show: vi.fn(async () => {}),
    layout: vi.fn(async () => {}),
    navigate: vi.fn(async () => ({ ok: true as const, url: LOCAL })),
    reload: vi.fn(async () => {}),
    close: vi.fn(async () => {}),
    detected: vi.fn(async () => []),
    onEvent: (listener: (event: PreviewEvent) => void) => {
      listeners.push(listener);
      return () => {};
    },
  };
  const openExternal = vi.fn(async () => {});
  (window as unknown as { relay: unknown }).relay = {
    preview: api,
    openExternal,
    subscribe: () => () => {},
  };
  return { api, openExternal, emit: (event: PreviewEvent) => listeners.forEach((l) => l(event)) };
}

describe("PanelPreview", () => {
  it("shows the initial url on mount", () => {
    const { api } = bridge();
    render(<PanelPreview previewId={ID} initialUrl={LOCAL} suggestions={[]} hidden={false} />);
    expect(api.show).toHaveBeenCalledWith(ID, LOCAL);
    expect((screen.getByLabelText("Preview address") as HTMLInputElement).value).toBe(LOCAL);
  });

  it("offers detected chips and navigates on click", async () => {
    const { api } = bridge();
    render(
      <PanelPreview
        previewId={ID}
        initialUrl=""
        suggestions={["http://localhost:3000/"]}
        hidden={false}
      />,
    );
    expect(api.show).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "http://localhost:3000/" }));
    expect(api.navigate).toHaveBeenCalledWith(ID, "http://localhost:3000/");
  });

  it("refuses a remote address and never navigates", async () => {
    const { api } = bridge();
    render(<PanelPreview previewId={ID} initialUrl={LOCAL} suggestions={[]} hidden={false} />);
    const input = screen.getByLabelText("Preview address") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "https://example.com/" } });
    fireEvent.click(screen.getByRole("button", { name: "Go" }));
    expect(api.navigate).not.toHaveBeenCalled();
    expect(await screen.findByText(/example\.com is not a local address/)).toBeTruthy();
  });

  it("shows the failure notice and retries", async () => {
    const { api, emit } = bridge();
    render(<PanelPreview previewId={ID} initialUrl={LOCAL} suggestions={[]} hidden={false} />);
    api.show.mockClear();
    emit({
      type: "previewState",
      previewId: ID,
      state: "failed",
      message: "ERR_CONNECTION_REFUSED — http://localhost:5173/",
    });
    expect(await screen.findByText(/Can't reach/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(api.show).toHaveBeenCalledWith(ID, LOCAL);
  });

  it("follows a navigation the page performs itself", async () => {
    const { emit } = bridge();
    render(<PanelPreview previewId={ID} initialUrl={LOCAL} suggestions={[]} hidden={false} />);
    emit({ type: "previewNavigated", previewId: ID, url: "http://localhost:5173/about" });
    expect(
      (await screen.findByLabelText("Preview address") as HTMLInputElement).value,
    ).toBe("http://localhost:5173/about");
  });

  it("hides the paint area while a popup is open", () => {
    const { api } = bridge();
    render(<PanelPreview previewId={ID} initialUrl={LOCAL} suggestions={[]} hidden />);
    expect(api.layout).toHaveBeenCalledWith(ID, null);
  });

  it("opens the current address in the system browser", () => {
    const { openExternal } = bridge();
    render(<PanelPreview previewId={ID} initialUrl={LOCAL} suggestions={[]} hidden={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Open in browser" }));
    expect(openExternal).toHaveBeenCalledWith(LOCAL);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/panel-preview.test.tsx`
Expected: FAIL — `Failed to resolve import ".../PanelPreview.tsx"`.

- [ ] **Step 3: Write `PanelPreview.tsx`**

```tsx
import { useEffect, useState } from "react";
import { normalizePreviewUrl, type PreviewEvent } from "../../shared/preview.ts";
import { usePreviewLayout } from "./usePreviewLayout.ts";

type Props = {
  previewId: string;
  initialUrl: string;
  suggestions: string[];
  hidden: boolean;
};

type LoadState = "idle" | "loading" | "loaded" | "failed";

/**
 * Each tab owns its own view and its own chrome state: the key makes React
 * rebuild the subtree when the active preview changes, so a failure notice or a
 * half-typed address can never leak from one tab into another.
 */
export function PanelPreview(props: Props) {
  return <PreviewView key={props.previewId} {...props} />;
}

function PreviewView({ previewId, initialUrl, suggestions, hidden }: Props) {
  const [address, setAddress] = useState(initialUrl);
  const [url, setUrl] = useState(initialUrl);
  const [state, setState] = useState<LoadState>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const layoutRef = usePreviewLayout(
    previewId,
    !hidden && state !== "failed" && url !== "",
  );

  useEffect(() => {
    const unsubscribe = window.relay.preview.onEvent((event: PreviewEvent) => {
      if (event.previewId !== previewId) return;
      if (event.type === "previewState") {
        setState(event.state);
        setMessage(event.message ?? null);
        return;
      }
      setUrl(event.url);
      setAddress(event.url);
    });
    return () => unsubscribe();
  }, [previewId]);

  useEffect(() => {
    if (!initialUrl) return;
    void window.relay.preview.show(previewId, initialUrl);
  }, [previewId, initialUrl]);

  function submit(value: string) {
    const normalized = normalizePreviewUrl(value);
    if (!normalized.ok) {
      setNotice(normalized.reason);
      return;
    }
    setNotice(null);
    setState("loading");
    void window.relay.preview
      .navigate(previewId, normalized.url)
      .then((result) => {
        if (!result.ok) {
          setNotice(result.reason);
          setState("idle");
          return;
        }
        setUrl(result.url);
        setAddress(result.url);
      })
      .catch(() => setNotice("Could not open that address"));
  }

  const status = state === "loading" ? "Loading…" : state === "failed" ? "Failed" : "";

  return (
    <div className="panel-preview">
      <form
        className="panel-preview-chrome"
        onSubmit={(event) => {
          event.preventDefault();
          submit(address);
        }}
      >
        <input
          className="panel-preview-address"
          aria-label="Preview address"
          placeholder="localhost:5173"
          value={address}
          onChange={(event) => setAddress(event.target.value)}
        />
        <button type="submit" className="btn">
          Go
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => {
            setNotice(null);
            void window.relay.preview.reload(previewId);
          }}
        >
          Reload
        </button>
        <button
          type="button"
          className="btn"
          disabled={!url}
          onClick={() => void window.relay.openExternal(url)}
        >
          Open in browser
        </button>
        {status ? <span className="panel-preview-status">{status}</span> : null}
      </form>
      {notice ? <p className="panel-note">{notice}</p> : null}
      {state === "failed" ? (
        <div className="panel-preview-state">
          <p className="panel-note">
            Can&apos;t reach {url || initialUrl}
            {message ? ` — ${message}` : ""}
          </p>
          <button
            type="button"
            className="btn"
            onClick={() => {
              setState("loading");
              void window.relay.preview.show(previewId, url || initialUrl);
            }}
          >
            Retry
          </button>
        </div>
      ) : null}
      {!url && state !== "failed" ? (
        <div className="panel-preview-state">
          <p className="panel-note">Type a local address, or pick one Relay saw:</p>
          {suggestions.length ? (
            <div className="panel-preview-chips">
              {suggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  className="btn"
                  onClick={() => submit(suggestion)}
                >
                  {suggestion}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
      <div className="panel-preview-void" ref={layoutRef} hidden={state === "failed" || !url} />
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/panel-preview.test.tsx`
Expected: PASS, 7 tests.

- [ ] **Step 5: Run the whole suite and the build**

Run: `npm test`
Expected: PASS, all files.

Run: `npm run typecheck && npm run build`
Expected: both exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/right-panel/PanelPreview.tsx tests/panel-preview.test.tsx
git commit -m "Render the preview chrome, empty state and failure recovery"
```

---

## Plan decisions that refine the spec

These are deliberate, small completions of the spec. The spec remains the
authority; each of these implements a requirement it states without naming the
mechanism.

1. **`relay:previewShow` carries `sessionId`.** The spec's §7 payload is
   `{ previewId, url }`. The renderer knows its session, and main needs it to
   record which session owns an adopted (restored-tab) view — otherwise the next
   `sessions` sweep would destroy a live view. The preload signature is
   `show(previewId, sessionId, url)`.
2. **Two channels §7 omits.** `relay:openExternal` backs §8's "Open in browser"
   button (main re-validates with the local policy), and `relay:previewDetected`
   lets the chips survive a renderer reload — the `previews` event alone is
   lost on ⌘R even though the in-memory store in main survives.
3. **The view is positioned at the paint area, not the whole body.** §5 says
   measure `PANEL_BODY_ID`; `PanelPreview` measures the element it renders for
   the page (`usePreviewLayout` on `.panel-preview-void`), which is the same
   identity mapping with a tighter rect, so the chrome row is never covered.
4. **Hide cases are popups and drags.** §5 also lists the maximized/overlay
   panel as a hide case. In both of those the panel is still visible and no HTML
   is drawn over it, so hiding would make a preview permanently invisible on a
   narrow window. Overlay and maximize re-measure instead.
5. **`previewStop` is deferred.** §8's chrome mentions "Reload/Stop"; §7's
   channel table has only `previewReload`, so only Reload ships.
6. **`show` adopts an unknown-but-well-formed id** — the restored-tab
   load-on-activation path from §3. `navigate`, `reload`, `close` and
   `setBounds` stay no-ops for unknown ids.
7. **`TerminalManager.sessionIdOf`** is a small addition to a shipped module so
   the detector can attribute terminal output to a session (§2's "main feeds it
   terminal output").

## Manual verification

Nothing in this plan constructs a real view, so the embedding is proven only by
the spec's checklist: load and hot-reload a dev server; resize the panel and
confirm the page stays glued; open a menu and drag the handle and confirm the
page is not painted over them; switch tabs and sessions and return; ⌘R and
confirm the page state survives; restart the app and confirm the tab restores
and loads on activation; stop the dev server and confirm the failure notice and
Retry; type `https://example.com` and confirm the refusal; click a remote link
inside the page and confirm it opens externally; close the tab and confirm the
webContents is destroyed.
