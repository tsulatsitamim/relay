# Right Panel (Spec 1 of 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a T3-style right panel to Relay — a tabbed, resizable, per-session surface workspace with Changes, Files, File, and Plan surfaces — and make the dead `IDE` toolbar placeholder a working open-in-editor button.

**Architecture:** A framework-agnostic pure reducer (`src/shared/right-panel.ts`) holds per-session panel state; a thin React hook (`usePanelStore`) binds it to `localStorage`. Data comes from six new IPC channels backed by small, independently tested main-process modules (`read-file.ts`, `git-changes.ts`, `editors.ts`). The panel is a flex sibling of the chat column inside `section.canvas`, toggled from the canvas toolbar and by `mod+alt+b`.

**Tech Stack:** TypeScript, React 19, Electron (IPC + `shell.showItemInFolder`), Vitest (node + jsdom), `localStorage`, `git` CLI. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-20-right-panel-design.md`

## Global Constraints

- TDD: write the failing test first, watch it fail, then implement.
- No new runtime or dev dependencies.
- No code comments anywhere in `src/`.
- English UI copy.
- Component tests start with `// @vitest-environment jsdom`, import `{ cleanup, fireEvent, render, screen }` from `@testing-library/react`, and call `cleanup()` in `afterEach` (Vitest globals are OFF; import `{ describe, expect, it, vi }` from `vitest`).
- New function parameters must be optional with a default so existing call sites keep compiling.
- Every renderer-supplied path crossing IPC goes through `resolveWithinReal` (`src/main/open-path.ts:18`).
- Run `npm test`, `npm run typecheck`, and `npm run build` as three separate commands; all must be green before each commit.
- Commit locally. Do not push.

---

### Task 1: Panel surface model and reducer

**Files:**
- Create: `src/shared/right-panel.ts`
- Test: `tests/right-panel.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `RightPanelKind`, `SingletonSurface`, `FileSurface`, `RightPanelSurface`, `SessionPanelState`, `EMPTY_PANEL_STATE`, `PanelAction`, `fileSurfaceId(path: string): \`file:${string}\``, `panelReducer(state: SessionPanelState, action: PanelAction): SessionPanelState`.

- [ ] **Step 1: Write the failing test**

Create `tests/right-panel.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  EMPTY_PANEL_STATE,
  fileSurfaceId,
  panelReducer,
  type SessionPanelState,
} from "../src/shared/right-panel.ts";

function openChanges(): SessionPanelState {
  return panelReducer(EMPTY_PANEL_STATE, { type: "open", kind: "changes" });
}

describe("panelReducer", () => {
  it("opens a singleton surface and activates it", () => {
    const state = openChanges();
    expect(state.isOpen).toBe(true);
    expect(state.activeSurfaceId).toBe("changes");
    expect(state.surfaces).toEqual([{ id: "changes", kind: "changes" }]);
  });

  it("keeps the same singleton surface when opened twice", () => {
    const once = openChanges();
    const twice = panelReducer(once, { type: "open", kind: "changes" });
    expect(twice.surfaces).toHaveLength(1);
  });

  it("opens a file surface and drops the files explorer", () => {
    const files = panelReducer(EMPTY_PANEL_STATE, { type: "open", kind: "files" });
    const file = panelReducer(files, { type: "openFile", path: "src/a.ts", line: 12 });
    expect(file.activeSurfaceId).toBe(fileSurfaceId("src/a.ts"));
    expect(file.surfaces).toEqual([
      {
        id: fileSurfaceId("src/a.ts"),
        kind: "file",
        path: "src/a.ts",
        revealLine: 12,
        revealRequestId: 0,
      },
    ]);
  });

  it("drops file surfaces when the files explorer opens", () => {
    const file = panelReducer(EMPTY_PANEL_STATE, { type: "openFile", path: "src/a.ts" });
    const files = panelReducer(file, { type: "open", kind: "files" });
    expect(files.surfaces).toEqual([{ id: "files", kind: "files" }]);
  });

  it("bumps revealRequestId and replaces the line when the same file is reopened", () => {
    const first = panelReducer(EMPTY_PANEL_STATE, { type: "openFile", path: "src/a.ts", line: 3 });
    const second = panelReducer(first, { type: "openFile", path: "src/a.ts", line: 40 });
    expect(second.surfaces).toHaveLength(1);
    expect(second.surfaces[0]).toEqual({
      id: fileSurfaceId("src/a.ts"),
      kind: "file",
      path: "src/a.ts",
      revealLine: 40,
      revealRequestId: 1,
    });
  });

  it("keeps the previous reveal line when reopening without one", () => {
    const first = panelReducer(EMPTY_PANEL_STATE, { type: "openFile", path: "src/a.ts", line: 3 });
    const second = panelReducer(first, { type: "openFile", path: "src/a.ts" });
    expect(second.surfaces[0]).toMatchObject({ revealLine: 3, revealRequestId: 1 });
  });

  it("activates an existing surface and ignores an unknown one", () => {
    const first = panelReducer(openChanges(), { type: "open", kind: "plan" });
    const back = panelReducer(first, { type: "activate", id: "changes" });
    expect(back.activeSurfaceId).toBe("changes");
    expect(panelReducer(first, { type: "activate", id: "nope" })).toBe(first);
  });

  it("falls back to the neighbour when the active surface closes", () => {
    const first = panelReducer(openChanges(), { type: "open", kind: "plan" });
    const closed = panelReducer(first, { type: "close", id: "plan" });
    expect(closed.isOpen).toBe(true);
    expect(closed.activeSurfaceId).toBe("changes");
  });

  it("hides the panel when the last surface closes", () => {
    const closed = panelReducer(openChanges(), { type: "close", id: "changes" });
    expect(closed).toEqual(EMPTY_PANEL_STATE);
  });

  it("closes other surfaces, closes all, and toggles", () => {
    const first = panelReducer(openChanges(), { type: "open", kind: "plan" });
    const only = panelReducer(first, { type: "closeOthers", id: "plan" });
    expect(only.surfaces).toEqual([{ id: "plan", kind: "plan" }]);
    expect(panelReducer(only, { type: "closeAll" })).toEqual(EMPTY_PANEL_STATE);

    const hidden = panelReducer(first, { type: "togglePanel" });
    expect(hidden.isOpen).toBe(false);
    expect(hidden.surfaces).toHaveLength(2);

    const shown = panelReducer(hidden, { type: "togglePanel" });
    expect(shown.isOpen).toBe(true);
    expect(shown.activeSurfaceId).toBe("plan");
  });

  it("opens changes when toggling an empty panel", () => {
    const opened = panelReducer(EMPTY_PANEL_STATE, { type: "togglePanel" });
    expect(opened.activeSurfaceId).toBe("changes");
    expect(opened.isOpen).toBe(true);
  });

  it("hides and shows without losing surfaces", () => {
    const state = openChanges();
    expect(panelReducer(state, { type: "hide" })).toMatchObject({ isOpen: false });
    expect(panelReducer(state, { type: "show" })).toMatchObject({ isOpen: true });
    expect(panelReducer(EMPTY_PANEL_STATE, { type: "show" })).toEqual(EMPTY_PANEL_STATE);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/right-panel.test.ts`
Expected: FAIL — `Failed to resolve import "../src/shared/right-panel.ts"`.

- [ ] **Step 3: Write the implementation**

Create `src/shared/right-panel.ts`:

```ts
export type RightPanelKind = "changes" | "files" | "plan" | "file";

export type SingletonSurface =
  | { id: "changes"; kind: "changes" }
  | { id: "files"; kind: "files" }
  | { id: "plan"; kind: "plan" };

export type FileSurface = {
  id: `file:${string}`;
  kind: "file";
  path: string;
  revealLine: number | null;
  revealRequestId: number;
};

export type RightPanelSurface = SingletonSurface | FileSurface;

export type SessionPanelState = {
  isOpen: boolean;
  activeSurfaceId: string | null;
  surfaces: RightPanelSurface[];
};

export const EMPTY_PANEL_STATE: SessionPanelState = {
  isOpen: false,
  activeSurfaceId: null,
  surfaces: [],
};

export type PanelAction =
  | { type: "open"; kind: "changes" | "files" | "plan" }
  | { type: "openFile"; path: string; line?: number | null }
  | { type: "activate"; id: string }
  | { type: "close"; id: string }
  | { type: "closeOthers"; id: string }
  | { type: "closeAll" }
  | { type: "togglePanel" }
  | { type: "hide" }
  | { type: "show" };

export function fileSurfaceId(path: string): `file:${string}` {
  return `file:${path}`;
}

function upsert(
  surfaces: RightPanelSurface[],
  surface: RightPanelSurface,
): RightPanelSurface[] {
  const index = surfaces.findIndex((entry) => entry.id === surface.id);
  if (index === -1) return [...surfaces, surface];
  const next = surfaces.slice();
  next[index] = surface;
  return next;
}

function dropFileSurfaces(surfaces: RightPanelSurface[]): RightPanelSurface[] {
  return surfaces.filter((surface) => surface.kind !== "file");
}

function dropFilesExplorer(surfaces: RightPanelSurface[]): RightPanelSurface[] {
  return surfaces.filter((surface) => surface.kind !== "files");
}

function normalize(state: SessionPanelState): SessionPanelState {
  return state.surfaces.length === 0 ? EMPTY_PANEL_STATE : state;
}

export function panelReducer(
  state: SessionPanelState,
  action: PanelAction,
): SessionPanelState {
  switch (action.type) {
    case "open": {
      const surface: SingletonSurface =
        action.kind === "changes"
          ? { id: "changes", kind: "changes" }
          : action.kind === "files"
            ? { id: "files", kind: "files" }
            : { id: "plan", kind: "plan" };
      const base = action.kind === "files" ? dropFileSurfaces(state.surfaces) : state.surfaces;
      return { isOpen: true, activeSurfaceId: surface.id, surfaces: upsert(base, surface) };
    }
    case "openFile": {
      const id = fileSurfaceId(action.path);
      const existing = state.surfaces.find((entry) => entry.id === id);
      const previous = existing?.kind === "file" ? existing : null;
      const surface: FileSurface = {
        id,
        kind: "file",
        path: action.path,
        revealLine: action.line ?? previous?.revealLine ?? null,
        revealRequestId: previous ? previous.revealRequestId + 1 : 0,
      };
      return {
        isOpen: true,
        activeSurfaceId: id,
        surfaces: upsert(dropFilesExplorer(state.surfaces), surface),
      };
    }
    case "activate": {
      if (!state.surfaces.some((entry) => entry.id === action.id)) return state;
      return { ...state, isOpen: true, activeSurfaceId: action.id };
    }
    case "close": {
      const index = state.surfaces.findIndex((entry) => entry.id === action.id);
      if (index === -1) return state;
      const surfaces = state.surfaces.filter((entry) => entry.id !== action.id);
      if (surfaces.length === 0) return EMPTY_PANEL_STATE;
      const activeSurfaceId =
        state.activeSurfaceId === action.id
          ? surfaces[Math.min(index, surfaces.length - 1)]!.id
          : state.activeSurfaceId;
      return { ...state, surfaces, activeSurfaceId };
    }
    case "closeOthers": {
      const surface = state.surfaces.find((entry) => entry.id === action.id);
      if (!surface) return state;
      return { isOpen: true, activeSurfaceId: surface.id, surfaces: [surface] };
    }
    case "closeAll":
      return EMPTY_PANEL_STATE;
    case "togglePanel": {
      if (state.isOpen) return { ...state, isOpen: false };
      if (state.activeSurfaceId) return { ...state, isOpen: true };
      return panelReducer(state, { type: "open", kind: "changes" });
    }
    case "hide":
      return normalize({ ...state, isOpen: false });
    case "show":
      return normalize({ ...state, isOpen: state.surfaces.length > 0 && true });
    default:
      return state;
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/right-panel.test.ts`
Expected: PASS, 12 tests.

- [ ] **Step 5: Commit**

```bash
git add src/shared/right-panel.ts tests/right-panel.test.ts
git commit -m "Add the right panel surface reducer"
```

---

### Task 2: Panel persistence and width clamping

**Files:**
- Create: `src/renderer/right-panel/persist.ts`
- Test: `tests/right-panel-persist.test.ts`

**Interfaces:**
- Consumes: `SessionPanelState`, `RightPanelSurface`, `fileSurfaceId` from Task 1.
- Produces: `PANELS_STORAGE_KEY`, `WIDTH_STORAGE_PREFIX`, `DEFAULT_PANEL_WIDTH`, `MIN_PANEL_WIDTH`, `MIN_CHAT_WIDTH`, `validateSurface`, `validatePanelState`, `parsePanels`, `serializePanels`, `readPanels(storage: Storage)`, `writePanels(storage: Storage, panels)`, `clampPanelWidth(preferred: number, viewportWidth: number, containerWidth: number): number`, `readWidth(storage: Storage, sessionId: string): number | null`, `writeWidth(storage: Storage, sessionId: string, width: number): void`.

- [ ] **Step 1: Write the failing test**

Create `tests/right-panel-persist.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  clampPanelWidth,
  parsePanels,
  readPanels,
  serializePanels,
  writePanels,
  readWidth,
  writeWidth,
} from "../src/renderer/right-panel/persist.ts";

function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (key: string) => map.get(key) ?? null,
    key: (index: number) => [...map.keys()][index] ?? null,
    removeItem: (key: string) => void map.delete(key),
    setItem: (key: string, value: string) => void map.set(key, value),
  };
}

describe("parsePanels", () => {
  it("returns an empty record for junk input", () => {
    expect(parsePanels(null)).toEqual({});
    expect(parsePanels("{oops")).toEqual({});
    expect(parsePanels("[]")).toEqual({});
    expect(parsePanels('{"version":1,"bySession":[]}')).toEqual({});
  });

  it("keeps known surfaces and drops unknown ones", () => {
    const panels = parsePanels(
      JSON.stringify({
        version: 1,
        bySession: {
          s1: {
            isOpen: true,
            activeSurfaceId: "changes",
            surfaces: [
              { id: "changes", kind: "changes" },
              { id: "bogus", kind: "bogus" },
              { id: "files", kind: "files" },
            ],
          },
        },
      }),
    );
    expect(panels.s1!.surfaces).toEqual([
      { id: "changes", kind: "changes" },
      { id: "files", kind: "files" },
    ]);
  });

  it("drops a file surface without a path and normalizes its numbers", () => {
    const panels = parsePanels(
      JSON.stringify({
        version: 1,
        bySession: {
          s1: {
            isOpen: true,
            activeSurfaceId: "file:src/a.ts",
            surfaces: [
              { id: "file:x", kind: "file" },
              {
                id: "file:src/a.ts",
                kind: "file",
                path: "src/a.ts",
                revealLine: -4,
                revealRequestId: -2,
              },
            ],
          },
        },
      }),
    );
    expect(panels.s1!.surfaces).toEqual([
      {
        id: "file:src/a.ts",
        kind: "file",
        path: "src/a.ts",
        revealLine: null,
        revealRequestId: 0,
      },
    ]);
  });

  it("repairs a dangling activeSurfaceId and never reopens an empty panel", () => {
    const panels = parsePanels(
      JSON.stringify({
        version: 1,
        bySession: {
          s1: { isOpen: true, activeSurfaceId: "gone", surfaces: [{ id: "plan", kind: "plan" }] },
          s2: { isOpen: true, activeSurfaceId: "plan", surfaces: [] },
        },
      }),
    );
    expect(panels.s1!.activeSurfaceId).toBe("plan");
    expect(panels.s2).toBeUndefined();
  });

  it("round trips through storage", () => {
    const storage = memoryStorage();
    const panels = parsePanels(
      JSON.stringify({
        version: 1,
        bySession: { s1: { isOpen: true, activeSurfaceId: "plan", surfaces: [{ id: "plan", kind: "plan" }] } },
      }),
    );
    writePanels(storage, panels);
    expect(readPanels(storage)).toEqual(panels);
    expect(serializePanels(panels)).toContain('"version":1');
  });
});

describe("clampPanelWidth", () => {
  it("keeps a preferred width that fits", () => {
    expect(clampPanelWidth(540, 1600, 1200)).toBe(540);
  });

  it("caps at 70% of the viewport", () => {
    expect(clampPanelWidth(2000, 1000, 4000)).toBe(700);
  });

  it("reserves 360px for the chat column", () => {
    expect(clampPanelWidth(2000, 4000, 1000)).toBe(640);
  });

  it("never goes below the minimum", () => {
    expect(clampPanelWidth(100, 4000, 4000)).toBe(360);
    expect(clampPanelWidth(Number.NaN, 4000, 4000)).toBe(540);
  });
});

describe("width storage", () => {
  it("round trips a width and rejects junk", () => {
    const storage = memoryStorage();
    expect(readWidth(storage, "s1")).toBeNull();
    writeWidth(storage, "s1", 611.7);
    expect(readWidth(storage, "s1")).toBe(611);
    storage.setItem("relay.rightPanelWidth:s2", "nope");
    expect(readWidth(storage, "s2")).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/right-panel-persist.test.ts`
Expected: FAIL — cannot resolve `../src/renderer/right-panel/persist.ts`.

- [ ] **Step 3: Write the implementation**

Create `src/renderer/right-panel/persist.ts`:

```ts
import {
  fileSurfaceId,
  type RightPanelSurface,
  type SessionPanelState,
} from "../../shared/right-panel.ts";

export const PANELS_STORAGE_KEY = "relay.rightPanel";
export const PANELS_VERSION = 1;
export const WIDTH_STORAGE_PREFIX = "relay.rightPanelWidth:";
export const DEFAULT_PANEL_WIDTH = 540;
export const MIN_PANEL_WIDTH = 360;
export const MIN_CHAT_WIDTH = 360;
export const VIEWPORT_WIDTH_FRACTION = 0.7;

export type Panels = Record<string, SessionPanelState>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function positiveInt(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const rounded = Math.floor(value);
  return rounded >= 1 ? rounded : null;
}

function nonNegativeInt(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  const rounded = Math.floor(value);
  return rounded >= 0 ? rounded : 0;
}

export function validateSurface(value: unknown): RightPanelSurface | null {
  if (!isRecord(value)) return null;
  if (value.kind === "changes") return { id: "changes", kind: "changes" };
  if (value.kind === "files") return { id: "files", kind: "files" };
  if (value.kind === "plan") return { id: "plan", kind: "plan" };
  if (value.kind !== "file") return null;
  const path = typeof value.path === "string" && value.path ? value.path : null;
  if (!path) return null;
  return {
    id: fileSurfaceId(path),
    kind: "file",
    path,
    revealLine: positiveInt(value.revealLine),
    revealRequestId: nonNegativeInt(value.revealRequestId),
  };
}

export function validatePanelState(value: unknown): SessionPanelState | null {
  if (!isRecord(value)) return null;
  const raw = Array.isArray(value.surfaces) ? value.surfaces : [];
  const surfaces: RightPanelSurface[] = [];
  for (const entry of raw) {
    const surface = validateSurface(entry);
    if (!surface) continue;
    if (surfaces.some((seen) => seen.id === surface.id)) continue;
    surfaces.push(surface);
  }
  if (surfaces.length === 0) return null;
  const active =
    typeof value.activeSurfaceId === "string" &&
    surfaces.some((surface) => surface.id === value.activeSurfaceId)
      ? value.activeSurfaceId
      : surfaces[0]!.id;
  return { isOpen: value.isOpen === true, activeSurfaceId: active, surfaces };
}

export function parsePanels(raw: string | null): Panels {
  if (!raw) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }
  if (!isRecord(parsed) || !isRecord(parsed.bySession)) return {};
  const panels: Panels = {};
  for (const [sessionId, entry] of Object.entries(parsed.bySession)) {
    const state = validatePanelState(entry);
    if (state) panels[sessionId] = state;
  }
  return panels;
}

export function serializePanels(panels: Panels): string {
  return JSON.stringify({ version: PANELS_VERSION, bySession: panels });
}

export function readPanels(storage: Storage): Panels {
  return parsePanels(storage.getItem(PANELS_STORAGE_KEY));
}

export function writePanels(storage: Storage, panels: Panels): void {
  storage.setItem(PANELS_STORAGE_KEY, serializePanels(panels));
}

export function clampPanelWidth(
  preferred: number,
  viewportWidth: number,
  containerWidth: number,
): number {
  const capped = Math.max(
    MIN_PANEL_WIDTH,
    Math.min(
      Math.floor(viewportWidth * VIEWPORT_WIDTH_FRACTION),
      Math.floor(containerWidth) - MIN_CHAT_WIDTH,
    ),
  );
  const wanted = Number.isFinite(preferred)
    ? Math.floor(preferred)
    : DEFAULT_PANEL_WIDTH;
  return Math.max(MIN_PANEL_WIDTH, Math.min(wanted, Math.max(MIN_PANEL_WIDTH, capped)));
}

export function readWidth(storage: Storage, sessionId: string): number | null {
  const raw = storage.getItem(`${WIDTH_STORAGE_PREFIX}${sessionId}`);
  if (!raw) return null;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : null;
}

export function writeWidth(storage: Storage, sessionId: string, width: number): void {
  storage.setItem(`${WIDTH_STORAGE_PREFIX}${sessionId}`, String(Math.floor(width)));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/right-panel-persist.test.ts`
Expected: PASS, 10 tests.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/right-panel/persist.ts tests/right-panel-persist.test.ts
git commit -m "Persist right panel state and clamp its width"
```

---

### Task 3: Git change types and porcelain parsers

**Files:**
- Create: `src/shared/git.ts`
- Test: `tests/git-parse.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `GitChangeStatus`, `GitChange`, `GitChangesResult`, `GitFileDiff`, `MAX_DIFF_LINES`, `branchFromPorcelain(output: string): string`, `parsePorcelainV2(output: string): GitChange[]`, `parseNumstat(output: string): Map<string, { insertions: number; deletions: number }>`, `mergeStats(files, stats): GitChange[]`, `truncateDiffText(text: string, maxLines?: number): { text: string; truncated: boolean }`, `changeLabel(status: GitChangeStatus): string`.

- [ ] **Step 1: Write the failing test**

Create `tests/git-parse.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  branchFromPorcelain,
  changeLabel,
  mergeStats,
  parseNumstat,
  parsePorcelainV2,
  truncateDiffText,
} from "../src/shared/git.ts";

function record(...parts: string[]): string {
  return parts.join("\0");
}

describe("parsePorcelainV2", () => {
  it("reads modified, added, deleted, untracked, and conflicted entries", () => {
    const output = record(
      "# branch.head main",
      "1 .M N... 100644 100644 100644 abc def src/a.ts",
      "1 A. N... 000000 100644 100644 000 abc src/b.ts",
      "1 .D N... 100644 000000 000000 abc 000 src/c.ts",
      "? src/d.ts",
      "u UU N... 100644 100644 100644 100644 abc def ghi src/e.ts",
    );
    expect(parsePorcelainV2(output)).toEqual([
      { path: "src/a.ts", status: "modified" },
      { path: "src/b.ts", status: "added" },
      { path: "src/c.ts", status: "deleted" },
      { path: "src/d.ts", status: "untracked" },
      { path: "src/e.ts", status: "conflicted" },
    ]);
  });

  it("keeps both names for a rename and survives paths with spaces", () => {
    const output = record(
      "# branch.head main",
      "2 R. N... 100644 100644 100644 abc def R100 src/new name.ts",
      "src/old name.ts",
    );
    expect(parsePorcelainV2(output)).toEqual([
      {
        path: "src/new name.ts",
        status: "renamed",
        oldPath: "src/old name.ts",
      },
    ]);
  });

  it("returns an empty list for empty output", () => {
    expect(parsePorcelainV2("")).toEqual([]);
  });
});

describe("branchFromPorcelain", () => {
  it("reads the branch head", () => {
    expect(branchFromPorcelain("# branch.oid abc\0# branch.head feature/x\0")).toBe("feature/x");
  });

  it("returns an empty string when the header is missing", () => {
    expect(branchFromPorcelain("1 .M N... 100644 100644 100644 abc def a.ts\0")).toBe("");
  });
});

describe("parseNumstat", () => {
  it("maps insertions and deletions per path", () => {
    const stats = parseNumstat(record("12\t3\tsrc/a.ts", "0\t7\tsrc/c.ts"));
    expect(stats.get("src/a.ts")).toEqual({ insertions: 12, deletions: 3 });
    expect(stats.get("src/c.ts")).toEqual({ insertions: 0, deletions: 7 });
  });

  it("treats binary counts as zero", () => {
    const stats = parseNumstat(record("-\t-\tlogo.png"));
    expect(stats.get("logo.png")).toEqual({ insertions: 0, deletions: 0 });
  });

  it("reads the new path for a rename", () => {
    const stats = parseNumstat(record("1\t2\t", "src/old.ts", "src/new.ts"));
    expect(stats.get("src/new.ts")).toEqual({ insertions: 1, deletions: 2 });
  });
});

describe("mergeStats", () => {
  it("attaches stats to the matching files", () => {
    const files = mergeStats(
      [
        { path: "src/a.ts", status: "modified" as const },
        { path: "src/z.ts", status: "untracked" as const },
      ],
      new Map([["src/a.ts", { insertions: 4, deletions: 1 }]]),
    );
    expect(files[0]).toEqual({ path: "src/a.ts", status: "modified", insertions: 4, deletions: 1 });
    expect(files[1]).toEqual({ path: "src/z.ts", status: "untracked" });
  });
});

describe("truncateDiffText", () => {
  it("leaves short text alone and caps long text", () => {
    expect(truncateDiffText("a\nb")).toEqual({ text: "a\nb", truncated: false });
    const long = Array.from({ length: 5 }, (_, index) => `line ${index}`).join("\n");
    const capped = truncateDiffText(long, 3);
    expect(capped.truncated).toBe(true);
    expect(capped.text.split("\n")).toHaveLength(3);
  });
});

describe("changeLabel", () => {
  it("labels every status", () => {
    expect(changeLabel("modified")).toBe("Modified");
    expect(changeLabel("added")).toBe("Added");
    expect(changeLabel("deleted")).toBe("Deleted");
    expect(changeLabel("renamed")).toBe("Renamed");
    expect(changeLabel("untracked")).toBe("Untracked");
    expect(changeLabel("conflicted")).toBe("Conflicted");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/git-parse.test.ts`
Expected: FAIL — cannot resolve `../src/shared/git.ts`.

- [ ] **Step 3: Write the implementation**

Create `src/shared/git.ts`:

```ts
export type GitChangeStatus =
  | "modified"
  | "added"
  | "deleted"
  | "renamed"
  | "untracked"
  | "conflicted";

export type GitChange = {
  path: string;
  status: GitChangeStatus;
  oldPath?: string;
  insertions?: number;
  deletions?: number;
};

export type GitChangesResult = {
  branch: string;
  files: GitChange[];
};

export type GitFileDiff = {
  path: string;
  oldText: string | null;
  newText: string;
  truncated: boolean;
  binary: boolean;
};

export const MAX_DIFF_LINES = 4000;

const LABELS: Record<GitChangeStatus, string> = {
  modified: "Modified",
  added: "Added",
  deleted: "Deleted",
  renamed: "Renamed",
  untracked: "Untracked",
  conflicted: "Conflicted",
};

const LETTERS: Record<string, GitChangeStatus> = {
  M: "modified",
  A: "added",
  D: "deleted",
  R: "renamed",
  C: "added",
  T: "modified",
  U: "conflicted",
};

export function changeLabel(status: GitChangeStatus): string {
  return LABELS[status];
}

function statusFor(x: string, y: string): GitChangeStatus {
  if (x === "?" && y === "?") return "untracked";
  if (x === "U" || y === "U" || (x === "A" && y === "A") || (x === "D" && y === "D")) {
    return "conflicted";
  }
  if (x === "R" || y === "R") return "renamed";
  const code = y !== "." ? y : x;
  return LETTERS[code] ?? "modified";
}

export function branchFromPorcelain(output: string): string {
  const match = /# branch\.head ([^\0\n]*)/.exec(output);
  return match ? match[1]!.trim() : "";
}

export function parsePorcelainV2(output: string): GitChange[] {
  const tokens = output.split("\0");
  const files: GitChange[] = [];
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index]!;
    if (!token) continue;
    const type = token[0];
    if (type === "1" || type === "2") {
      const parts = token.split(" ");
      const xy = parts[1] ?? "..";
      const status = statusFor(xy[0] ?? ".", xy[1] ?? ".");
      if (type === "2") {
        const path = parts.slice(9).join(" ");
        const oldPath = tokens[index + 1] ?? "";
        index += 1;
        files.push(oldPath ? { path, status, oldPath } : { path, status });
      } else {
        files.push({ path: parts.slice(8).join(" "), status });
      }
      continue;
    }
    if (type === "?") {
      files.push({ path: token.slice(2), status: "untracked" });
      continue;
    }
    if (type === "u") {
      const parts = token.split(" ");
      files.push({ path: parts.slice(10).join(" "), status: "conflicted" });
    }
  }
  return files;
}

export function parseNumstat(
  output: string,
): Map<string, { insertions: number; deletions: number }> {
  const stats = new Map<string, { insertions: number; deletions: number }>();
  const tokens = output.split("\0");
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index]!;
    if (!token) continue;
    const parts = token.split("\t");
    if (parts.length < 3) continue;
    const insertions = parts[0] === "-" ? 0 : Number(parts[0]);
    const deletions = parts[1] === "-" ? 0 : Number(parts[1]);
    let path = parts[2] ?? "";
    if (!path) {
      const next = tokens[index + 2] ?? "";
      index += 2;
      path = next;
    }
    if (!path) continue;
    stats.set(path, {
      insertions: Number.isFinite(insertions) ? insertions : 0,
      deletions: Number.isFinite(deletions) ? deletions : 0,
    });
  }
  return stats;
}

export function mergeStats(
  files: GitChange[],
  stats: Map<string, { insertions: number; deletions: number }>,
): GitChange[] {
  return files.map((file) => {
    const stat = stats.get(file.path);
    return stat ? { ...file, ...stat } : file;
  });
}

export function truncateDiffText(
  text: string,
  maxLines: number = MAX_DIFF_LINES,
): { text: string; truncated: boolean } {
  const lines = text.split("\n");
  if (lines.length <= maxLines) return { text, truncated: false };
  return { text: lines.slice(0, maxLines).join("\n"), truncated: true };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/git-parse.test.ts`
Expected: PASS, 10 tests.

- [ ] **Step 5: Commit**

```bash
git add src/shared/git.ts tests/git-parse.test.ts
git commit -m "Parse git porcelain v2 status and numstat output"
```

---

### Task 4: Read a file for preview

**Files:**
- Create: `src/main/read-file.ts`
- Modify: `src/shared/ipc.ts` (append the `ReadFileResult` type)
- Test: `tests/read-file.test.ts`

**Interfaces:**
- Consumes: `resolveWithinReal` from `src/main/open-path.ts`.
- Produces: `MAX_PREVIEW_BYTES`, `ReadFileResult` (in `src/shared/ipc.ts`), `readFilePreview(cwd: string, path: string): ReadFileResult | null` returning `{ path, text, truncated, binary }` where `text` is `""` for binary files.

- [ ] **Step 1: Write the failing test**

Create `tests/read-file.test.ts`:

```ts
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { MAX_PREVIEW_BYTES, readFilePreview } from "../src/main/read-file.ts";

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function fixture(): string {
  const root = mkdtempSync(join(tmpdir(), "relay-read-"));
  dirs.push(root);
  writeFileSync(join(root, "a.ts"), "const a = 1;\n");
  writeFileSync(join(root, "bin.dat"), Buffer.from([1, 0, 2, 3]));
  writeFileSync(join(root, "big.txt"), "x".repeat(MAX_PREVIEW_BYTES + 100));
  mkdirSync(join(root, "src"));
  return root;
}

describe("readFilePreview", () => {
  it("reads a text file relative to the working directory", () => {
    expect(readFilePreview(fixture(), "a.ts")).toEqual({
      path: "a.ts",
      text: "const a = 1;\n",
      truncated: false,
      binary: false,
    });
  });

  it("flags binary files and returns no text", () => {
    expect(readFilePreview(fixture(), "bin.dat")).toEqual({
      path: "bin.dat",
      text: "",
      truncated: false,
      binary: true,
    });
  });

  it("truncates oversized files", () => {
    const result = readFilePreview(fixture(), "big.txt");
    expect(result?.truncated).toBe(true);
    expect(result?.text.length).toBe(MAX_PREVIEW_BYTES);
  });

  it("rejects paths outside the working directory and missing files", () => {
    const root = fixture();
    expect(readFilePreview(root, "../secret")).toBeNull();
    expect(readFilePreview(root, "/etc/passwd")).toBeNull();
    expect(readFilePreview(root, "nope.ts")).toBeNull();
    expect(readFilePreview(root, "src")).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/read-file.test.ts`
Expected: FAIL — cannot resolve `../src/main/read-file.ts`.

- [ ] **Step 3: Write the implementation**

Append to `src/shared/ipc.ts`:

```ts
export type ReadFileResult = {
  path: string;
  text: string;
  truncated: boolean;
  binary: boolean;
};
```

Create `src/main/read-file.ts`:

```ts
import { readFileSync, statSync } from "node:fs";
import { resolveWithinReal } from "./open-path.ts";
import type { ReadFileResult } from "../shared/ipc.ts";

export const MAX_PREVIEW_BYTES = 512 * 1024;

export function readFilePreview(cwd: string, path: string): ReadFileResult | null {
  const resolved = resolveWithinReal(cwd, path);
  if (!resolved) return null;
  try {
    if (!statSync(resolved).isFile()) return null;
  } catch {
    return null;
  }
  let buffer: Buffer;
  try {
    buffer = readFileSync(resolved);
  } catch {
    return null;
  }
  const truncated = buffer.length > MAX_PREVIEW_BYTES;
  const slice = truncated ? buffer.subarray(0, MAX_PREVIEW_BYTES) : buffer;
  const binary = slice.includes(0);
  return {
    path,
    text: binary ? "" : slice.toString("utf8"),
    truncated,
    binary,
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/read-file.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/shared/ipc.ts src/main/read-file.ts tests/read-file.test.ts
git commit -m "Read files for the preview panel"
```

---

### Task 5: Git changes and per-file diffs in the main process

**Files:**
- Create: `src/main/git-changes.ts`
- Test: `tests/git-changes.test.ts`

**Interfaces:**
- Consumes: `branchFromPorcelain`, `parsePorcelainV2`, `parseNumstat`, `mergeStats`, `truncateDiffText`, `GitChange`, `GitChangesResult`, `GitFileDiff` from Task 3; `resolveWithinReal` from `src/main/open-path.ts`.
- Produces: `GIT_TIMEOUT_MS`, `MAX_DIFF_BYTES`, `gitRoot(cwd: string): Promise<string | null>`, `gitChanges(cwd: string): Promise<GitChangesResult | null>`, `gitFileDiff(cwd: string, path: string): Promise<GitFileDiff | null>`.

- [ ] **Step 1: Write the failing test**

Create `tests/git-changes.test.ts`:

```ts
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, unlinkSync, renameSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { gitChanges, gitFileDiff, gitRoot, MAX_DIFF_BYTES } from "../src/main/git-changes.ts";

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function git(cwd: string, args: string[]): void {
  execFileSync("git", args, {
    cwd,
    stdio: "ignore",
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "Relay Test",
      GIT_AUTHOR_EMAIL: "relay@test",
      GIT_COMMITTER_NAME: "Relay Test",
      GIT_COMMITTER_EMAIL: "relay@test",
    },
  });
}

function repo(): string {
  const root = mkdtempSync(join(tmpdir(), "relay-git-"));
  dirs.push(root);
  git(root, ["init", "-q", "-b", "main"]);
  writeFileSync(join(root, "keep.ts"), "export const keep = 1;\n");
  writeFileSync(join(root, "gone.ts"), "export const gone = 1;\n");
  writeFileSync(join(root, "moved.ts"), "export const moved = 1;\n");
  git(root, ["add", "-A"]);
  git(root, ["commit", "-q", "-m", "init"]);
  return root;
}

describe("gitRoot", () => {
  it("finds the repository root and reports non-repositories", async () => {
    const root = repo();
    expect(await gitRoot(join(root, "keep.ts"))).toBeNull();
    expect(await gitRoot(root)).toBeTruthy();
    const plain = mkdtempSync(join(tmpdir(), "relay-plain-"));
    dirs.push(plain);
    expect(await gitRoot(plain)).toBeNull();
  });
});

describe("gitChanges", () => {
  it("reports every working tree status with line counts", async () => {
    const root = repo();
    writeFileSync(join(root, "keep.ts"), "export const keep = 2;\n");
    writeFileSync(join(root, "added.ts"), "export const added = 1;\n");
    unlinkSync(join(root, "gone.ts"));
    renameSync(join(root, "moved.ts"), join(root, "renamed.ts"));
    writeFileSync(join(root, "loose.ts"), "export const loose = 1;\n");

    const result = await gitChanges(root);
    expect(result?.branch).toBe("main");
    const byPath = new Map(result!.files.map((file) => [file.path, file]));
    expect(byPath.get("keep.ts")).toMatchObject({ status: "modified", insertions: 1, deletions: 1 });
    expect(byPath.get("added.ts")).toMatchObject({ status: "untracked" });
    expect(byPath.get("gone.ts")).toMatchObject({ status: "deleted", deletions: 1 });
    expect(byPath.get("renamed.ts")).toMatchObject({ status: "renamed", oldPath: "moved.ts" });
  });

  it("returns null outside a repository", async () => {
    const plain = mkdtempSync(join(tmpdir(), "relay-plain-"));
    dirs.push(plain);
    expect(await gitChanges(plain)).toBeNull();
  });
});

describe("gitFileDiff", () => {
  it("returns the committed and working copies of a modified file", async () => {
    const root = repo();
    writeFileSync(join(root, "keep.ts"), "export const keep = 2;\n");
    const diff = await gitFileDiff(root, "keep.ts");
    expect(diff?.oldText).toContain("keep = 1");
    expect(diff?.newText).toContain("keep = 2");
    expect(diff?.binary).toBe(false);
    expect(diff?.truncated).toBe(false);
  });

  it("returns an empty new side for a deleted file and no old side for a new one", async () => {
    const root = repo();
    unlinkSync(join(root, "gone.ts"));
    writeFileSync(join(root, "fresh.ts"), "export const fresh = 1;\n");
    expect((await gitFileDiff(root, "gone.ts"))?.newText).toBe("");
    expect((await gitFileDiff(root, "fresh.ts"))?.oldText).toBeNull();
  });

  it("reports a file too large to diff instead of loading it", async () => {
    const root = repo();
    writeFileSync(join(root, "huge.ts"), "x".repeat(MAX_DIFF_BYTES + 1));
    const diff = await gitFileDiff(root, "huge.ts");
    expect(diff).toEqual({
      path: "huge.ts",
      oldText: null,
      newText: "",
      truncated: true,
      binary: false,
    });
  });

  it("rejects escaped paths and files outside a repository", async () => {
    const root = repo();
    expect(await gitFileDiff(root, "../secret")).toBeNull();
    const plain = mkdtempSync(join(tmpdir(), "relay-plain-"));
    dirs.push(plain);
    writeFileSync(join(plain, "a.ts"), "a\n");
    expect(await gitFileDiff(plain, "a.ts")).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/git-changes.test.ts`
Expected: FAIL — cannot resolve `../src/main/git-changes.ts`.

- [ ] **Step 3: Write the implementation**

Create `src/main/git-changes.ts`:

```ts
import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { promisify } from "node:util";
import {
  branchFromPorcelain,
  mergeStats,
  parseNumstat,
  parsePorcelainV2,
  truncateDiffText,
  type GitChangesResult,
  type GitFileDiff,
} from "../shared/git.ts";
import { resolveWithinReal } from "./open-path.ts";

const execFileAsync = promisify(execFile);

export const GIT_TIMEOUT_MS = 5000;
export const MAX_DIFF_BYTES = 1024 * 1024;
const MAX_BUFFER = 8 * 1024 * 1024;

async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, {
    cwd,
    timeout: GIT_TIMEOUT_MS,
    maxBuffer: MAX_BUFFER,
  });
  return stdout;
}

export async function gitRoot(cwd: string): Promise<string | null> {
  if (!cwd) return null;
  try {
    const root = (await git(cwd, ["rev-parse", "--show-toplevel"])).trim();
    return root || null;
  } catch {
    return null;
  }
}

export async function gitChanges(cwd: string): Promise<GitChangesResult | null> {
  const root = await gitRoot(cwd);
  if (!root) return null;
  let status: string;
  try {
    status = await git(root, [
      "status",
      "--porcelain=v2",
      "-z",
      "--branch",
      "--untracked-files=all",
    ]);
  } catch {
    return null;
  }
  const files = parsePorcelainV2(status);
  let stats = new Map<string, { insertions: number; deletions: number }>();
  try {
    stats = parseNumstat(await git(root, ["diff", "--numstat", "-z", "HEAD"]));
  } catch {
    stats = new Map();
  }
  return { branch: branchFromPorcelain(status), files: mergeStats(files, stats) };
}

export async function gitFileDiff(
  cwd: string,
  path: string,
): Promise<GitFileDiff | null> {
  const root = await gitRoot(cwd);
  if (!root) return null;
  const resolved = resolveWithinReal(root, path);
  if (!resolved) return null;

  let oldText: string | null = null;
  try {
    oldText = await git(root, ["show", `HEAD:${path}`]);
  } catch {
    oldText = null;
  }

  let buffer: Buffer;
  try {
    buffer = readFileSync(resolved);
  } catch {
    buffer = Buffer.alloc(0);
  }

  if (buffer.length > MAX_DIFF_BYTES) {
    return { path, oldText: null, newText: "", truncated: true, binary: false };
  }
  if (buffer.includes(0) || (oldText ?? "").includes("\0")) {
    return { path, oldText: null, newText: "", truncated: false, binary: true };
  }

  const next = truncateDiffText(buffer.toString("utf8"));
  const previous = oldText == null ? null : truncateDiffText(oldText);
  return {
    path,
    oldText: previous ? previous.text : null,
    newText: next.text,
    truncated: next.truncated || (previous ? previous.truncated : false),
    binary: false,
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/git-changes.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add src/main/git-changes.ts tests/git-changes.test.ts
git commit -m "Expose git working tree changes and file diffs"
```

---

### Task 6: Editor catalog, detection, and launching

**Files:**
- Create: `src/shared/editors.ts`
- Create: `src/main/editors.ts`
- Test: `tests/editors.test.ts`

**Interfaces:**
- Consumes: `hasBinaryOnPath` from `src/main/agents.ts`, `resolveWithinReal` from `src/main/open-path.ts`.
- Produces: `EditorDefinition`, `EditorId`, `EditorInfo`, `OpenInEditorResult`, `EDITORS`, `editorArgs(editor, target, line?): string[]` (from `src/shared/editors.ts`); `resolveCommand(editor, onPath?, exists?): string | null`, `availableEditors(onPath?, exists?): EditorInfo[]`, `openInEditor(cwd, editorId, path?, line?, deps?): OpenInEditorResult` (from `src/main/editors.ts`).

- [ ] **Step 1: Write the failing test**

Create `tests/editors.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { EDITORS, editorArgs } from "../src/shared/editors.ts";
import { availableEditors, openInEditor, resolveCommand } from "../src/main/editors.ts";

const vscode = EDITORS.find((editor) => editor.id === "vscode")!;
const zed = EDITORS.find((editor) => editor.id === "zed")!;
const webstorm = EDITORS.find((editor) => editor.id === "webstorm")!;

describe("editorArgs", () => {
  it("uses goto for VS Code style editors", () => {
    expect(editorArgs(vscode, "/tmp/a.ts", 12)).toEqual(["--goto", "/tmp/a.ts:12:1"]);
    expect(editorArgs(vscode, "/tmp/a.ts")).toEqual(["/tmp/a.ts"]);
    expect(editorArgs(vscode, "/tmp")).toEqual(["/tmp"]);
  });

  it("uses --line for JetBrains style editors", () => {
    expect(editorArgs(webstorm, "/tmp/a.ts", 7)).toEqual(["--line", "7", "/tmp/a.ts"]);
    expect(editorArgs(webstorm, "/tmp/a.ts")).toEqual(["/tmp/a.ts"]);
  });

  it("passes the path straight through for direct editors", () => {
    expect(editorArgs(zed, "/tmp/a.ts", 3)).toEqual(["/tmp/a.ts"]);
  });
});

describe("resolveCommand", () => {
  it("prefers a command on PATH and falls back to the app bundle", () => {
    expect(resolveCommand(vscode, () => true, () => false)).toBe("code");
    expect(resolveCommand(vscode, () => false, () => true)).toBe(vscode.appPath);
    expect(resolveCommand(vscode, () => false, () => false)).toBeNull();
  });
});

describe("availableEditors", () => {
  it("lists only detected editors", () => {
    const found = availableEditors((command) => command === "code", () => false);
    expect(found).toEqual([{ id: "vscode", label: "VS Code", command: "code" }]);
  });

  it("returns an empty list when nothing is installed", () => {
    expect(availableEditors(() => false, () => false)).toEqual([]);
  });
});

describe("openInEditor", () => {
  it("rejects unknown editors and missing binaries", () => {
    const spawn = vi.fn();
    expect(openInEditor("/tmp", "nope" as never, null, null, { spawn })).toEqual({
      ok: false,
      message: "Unknown editor: nope",
    });
    const result = openInEditor("/tmp", "vscode", null, null, {
      onPath: () => false,
      exists: () => false,
      spawn,
    });
    expect(result).toMatchObject({ ok: false });
    expect(spawn).not.toHaveBeenCalled();
  });

  it("rejects a path outside the working directory", () => {
    const spawn = vi.fn();
    const result = openInEditor("/tmp", "vscode", "../secret", null, {
      onPath: () => true,
      spawn,
    });
    expect(result).toMatchObject({ ok: false });
    expect(spawn).not.toHaveBeenCalled();
  });

  it("spawns detached and unrefs", () => {
    const unref = vi.fn();
    const spawn = vi.fn(() => ({ unref }));
    const result = openInEditor(process.cwd(), "vscode", "package.json", 4, {
      onPath: () => true,
      spawn,
    });
    expect(result).toEqual({ ok: true });
    expect(spawn).toHaveBeenCalledWith(
      "code",
      ["--goto", `${process.cwd()}/package.json:4:1`],
      { detached: true, stdio: "ignore", shell: false },
    );
    expect(unref).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/editors.test.ts`
Expected: FAIL — cannot resolve `../src/shared/editors.ts`.

- [ ] **Step 3: Write the implementation**

Create `src/shared/editors.ts`:

```ts
export type EditorLaunchStyle = "goto" | "direct" | "line-column";

export type EditorDefinition = {
  id: string;
  label: string;
  command: string;
  appPath: string;
  style: EditorLaunchStyle;
};

export type EditorInfo = {
  id: string;
  label: string;
  command: string;
};

export type OpenInEditorResult = { ok: true } | { ok: false; message: string };

export const EDITORS: readonly EditorDefinition[] = [
  {
    id: "vscode",
    label: "VS Code",
    command: "code",
    appPath: "/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code",
    style: "goto",
  },
  {
    id: "cursor",
    label: "Cursor",
    command: "cursor",
    appPath: "/Applications/Cursor.app/Contents/Resources/app/bin/cursor",
    style: "goto",
  },
  {
    id: "windsurf",
    label: "Windsurf",
    command: "windsurf",
    appPath: "/Applications/Windsurf.app/Contents/Resources/app/bin/windsurf",
    style: "goto",
  },
  {
    id: "zed",
    label: "Zed",
    command: "zed",
    appPath: "/Applications/Zed.app/Contents/MacOS/cli",
    style: "direct",
  },
  {
    id: "webstorm",
    label: "WebStorm",
    command: "webstorm",
    appPath: "",
    style: "line-column",
  },
  {
    id: "idea",
    label: "IntelliJ IDEA",
    command: "idea",
    appPath: "",
    style: "line-column",
  },
];

export type EditorId = string;

export function editorArgs(
  editor: EditorDefinition,
  target: string,
  line?: number | null,
): string[] {
  if (line && editor.style === "goto") return ["--goto", `${target}:${line}:1`];
  if (line && editor.style === "line-column") return ["--line", String(line), target];
  return [target];
}
```

Note: `EditorId` is a plain `string` so the IPC payload type stays simple; `openInEditor` validates the id against `EDITORS`.

Create `src/main/editors.ts`:

```ts
import { spawn as nodeSpawn } from "node:child_process";
import { existsSync } from "node:fs";
import { hasBinaryOnPath } from "./agents.ts";
import { resolveWithinReal } from "./open-path.ts";
import {
  EDITORS,
  editorArgs,
  type EditorDefinition,
  type EditorInfo,
  type OpenInEditorResult,
} from "../shared/editors.ts";

type SpawnLike = (
  command: string,
  args: string[],
  options: { detached: boolean; stdio: "ignore"; shell: boolean },
) => { unref: () => void };

type Deps = {
  onPath?: (command: string) => boolean;
  exists?: (path: string) => boolean;
  spawn?: SpawnLike;
};

export function resolveCommand(
  editor: EditorDefinition,
  onPath: (command: string) => boolean = hasBinaryOnPath,
  exists: (path: string) => boolean = existsSync,
): string | null {
  if (onPath(editor.command)) return editor.command;
  if (editor.appPath && exists(editor.appPath)) return editor.appPath;
  return null;
}

export function availableEditors(
  onPath: (command: string) => boolean = hasBinaryOnPath,
  exists: (path: string) => boolean = existsSync,
): EditorInfo[] {
  const found: EditorInfo[] = [];
  for (const editor of EDITORS) {
    if (!resolveCommand(editor, onPath, exists)) continue;
    found.push({ id: editor.id, label: editor.label, command: editor.command });
  }
  return found;
}

export function openInEditor(
  cwd: string,
  editorId: string,
  path?: string | null,
  line?: number | null,
  deps: Deps = {},
): OpenInEditorResult {
  const spawn = deps.spawn ?? (nodeSpawn as unknown as SpawnLike);
  const editor = EDITORS.find((entry) => entry.id === editorId);
  if (!editor) return { ok: false, message: `Unknown editor: ${editorId}` };
  const command = resolveCommand(editor, deps.onPath, deps.exists);
  if (!command) return { ok: false, message: `${editor.label} is not installed` };
  let target = cwd;
  if (path) {
    const resolved = resolveWithinReal(cwd, path);
    if (!resolved) {
      return { ok: false, message: "The file is outside the working directory" };
    }
    target = resolved;
  }
  try {
    spawn(command, editorArgs(editor, target, line ?? null), {
      detached: true,
      stdio: "ignore",
      shell: false,
    }).unref();
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/editors.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add src/shared/editors.ts src/main/editors.ts tests/editors.test.ts
git commit -m "Detect and launch editors for the open-in-editor button"
```

---

### Task 7: Wire the six IPC channels

**Files:**
- Modify: `src/main/index.ts` (imports and handlers next to `relay:openPath` at `src/main/index.ts:508`)
- Modify: `src/preload/index.ts` (bridge methods next to `openPath`)
- Modify: `src/renderer/env.d.ts` (mirror the same methods)
- Test: `tests/index.test.ts` (append one test; extend the `electron` mock's `shell` if needed)

**Interfaces:**
- Consumes: `readFilePreview` (Task 4), `gitChanges` / `gitFileDiff` (Task 5), `availableEditors` / `openInEditor` (Task 6), `resolveWithinReal`, `shell.showItemInFolder`.
- Produces: bridge methods `readFile(cwd, path)`, `gitChanges(cwd)`, `gitFileDiff(cwd, path)`, `availableEditors()`, `openInEditor(cwd, editor, path?, line?)`, `revealInFinder(cwd, path)`.

- [ ] **Step 1: Write the failing test**

Append to `tests/index.test.ts` (inside the same top-level `describe` that already holds the handler tests):

```ts
  it("exposes the right panel handlers", async () => {
    h.userData = mkdtempSync(join(tmpdir(), "relay-index-"));
    await import("../src/main/index.ts");
    await waitFor(() => h.handlers.get("relay:getState"));

    const dir = mkdtempSync(join(tmpdir(), "relay-panel-"));
    writeFileSync(join(dir, "a.txt"), "hello");

    const readFile = h.handlers.get("relay:readFile")!;
    expect(readFile({}, dir, "a.txt")).toEqual({
      path: "a.txt",
      text: "hello",
      truncated: false,
      binary: false,
    });
    expect(readFile({}, dir, "../secret")).toBeNull();

    const changes = h.handlers.get("relay:gitChanges")!;
    expect(await changes({}, dir)).toBeNull();

    const diff = h.handlers.get("relay:gitFileDiff")!;
    expect(await diff({}, dir, "a.txt")).toBeNull();

    const editors = h.handlers.get("relay:availableEditors")!;
    expect(Array.isArray(editors({}))).toBe(true);

    const reveal = h.handlers.get("relay:revealInFinder")!;
    expect(reveal({}, dir, "../secret")).toBe(false);
  });
```

Ensure `writeFileSync` is imported at the top of the file (`import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";`), and make sure the mocked `shell` object includes `showItemInFolder`:

```ts
  shell: {
    openPath: async () => "",
    showItemInFolder: () => {},
  },
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/index.test.ts`
Expected: FAIL — `Cannot read properties of undefined (reading 'call')` for `h.handlers.get("relay:readFile")` or a null assertion.

- [ ] **Step 3: Write the implementation**

In `src/main/index.ts`, add to the import block (after the `listSkills` import):

```ts
import { readFilePreview } from "./read-file.ts";
import { gitChanges, gitFileDiff } from "./git-changes.ts";
import { availableEditors, openInEditor } from "./editors.ts";
```

Then, immediately after the `relay:openPath` handler at `src/main/index.ts:508-513`, add:

```ts
  ipcMain.handle("relay:readFile", (_e, cwd: string, path: string) =>
    readFilePreview(cwd, path),
  );

  ipcMain.handle("relay:gitChanges", (_e, cwd: string) => gitChanges(cwd));

  ipcMain.handle("relay:gitFileDiff", (_e, cwd: string, path: string) =>
    gitFileDiff(cwd, path),
  );

  ipcMain.handle("relay:availableEditors", () => availableEditors());

  ipcMain.handle(
    "relay:openInEditor",
    (_e, cwd: string, editor: string, path?: string, line?: number) =>
      openInEditor(cwd, editor, path, line),
  );

  ipcMain.handle("relay:revealInFinder", (_e, cwd: string, path: string) => {
    const resolved = resolveWithinReal(cwd, path);
    if (!resolved) return false;
    shell.showItemInFolder(resolved);
    return true;
  });
```

In `src/preload/index.ts`, add the type imports and bridge methods after `openPath`:

```ts
  readFile: (cwd: string, path: string): Promise<ReadFileResult | null> =>
    ipcRenderer.invoke("relay:readFile", cwd, path),
  gitChanges: (cwd: string): Promise<GitChangesResult | null> =>
    ipcRenderer.invoke("relay:gitChanges", cwd),
  gitFileDiff: (cwd: string, path: string): Promise<GitFileDiff | null> =>
    ipcRenderer.invoke("relay:gitFileDiff", cwd, path),
  availableEditors: (): Promise<EditorInfo[]> =>
    ipcRenderer.invoke("relay:availableEditors"),
  openInEditor: (
    cwd: string,
    editor: string,
    path?: string,
    line?: number,
  ): Promise<OpenInEditorResult> =>
    ipcRenderer.invoke("relay:openInEditor", cwd, editor, path, line),
  revealInFinder: (cwd: string, path: string): Promise<boolean> =>
    ipcRenderer.invoke("relay:revealInFinder", cwd, path),
```

with these imports added:

```ts
import type { BranchInfo, CreatePayload, DiffCommentInput, ReadFileResult, RelayEvent, RelayState } from "../shared/ipc.ts";
import type { GitChangesResult, GitFileDiff } from "../shared/git.ts";
import type { EditorInfo, OpenInEditorResult } from "../shared/editors.ts";
```

Mirror the exact same six methods and three type imports in `src/renderer/env.d.ts` inside `RelayBridge`.

- [ ] **Step 4: Run the test and the typecheck**

Run: `npx vitest run tests/index.test.ts`
Expected: PASS.

Run: `npm run typecheck`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/main/index.ts src/preload/index.ts src/renderer/env.d.ts tests/index.test.ts
git commit -m "Expose right panel data over IPC"
```

---

### Task 8: The panel store hook

**Files:**
- Create: `src/renderer/right-panel/usePanelStore.ts`
- Test: `tests/use-panel-store.test.tsx`

**Interfaces:**
- Consumes: `EMPTY_PANEL_STATE`, `panelReducer`, `PanelAction`, `SessionPanelState` (Task 1); `readPanels`, `writePanels`, `readWidth`, `writeWidth`, `DEFAULT_PANEL_WIDTH` (Task 2).
- Produces: `usePanelStore(sessionId: string | null): { state: SessionPanelState; dispatch: (action: PanelAction) => void; width: number; setWidth: (width: number, persist?: boolean) => void }`.

- [ ] **Step 1: Write the failing test**

Create `tests/use-panel-store.test.tsx`:

```tsx
// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { usePanelStore } from "../src/renderer/right-panel/usePanelStore.ts";

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

function Probe({ sessionId }: { sessionId: string }) {
  const { state, dispatch, width, setWidth } = usePanelStore(sessionId);
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
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/use-panel-store.test.tsx`
Expected: FAIL — cannot resolve `../src/renderer/right-panel/usePanelStore.ts`.

- [ ] **Step 3: Write the implementation**

Create `src/renderer/right-panel/usePanelStore.ts`:

```ts
import { useCallback, useEffect, useState } from "react";
import {
  EMPTY_PANEL_STATE,
  panelReducer,
  type PanelAction,
  type SessionPanelState,
} from "../../shared/right-panel.ts";
import {
  DEFAULT_PANEL_WIDTH,
  readPanels,
  readWidth,
  writePanels,
  writeWidth,
} from "./persist.ts";

export function usePanelStore(sessionId: string | null) {
  const [panels, setPanels] = useState(() => readPanels(window.localStorage));
  const [width, setWidthState] = useState(() =>
    sessionId
      ? readWidth(window.localStorage, sessionId) ?? DEFAULT_PANEL_WIDTH
      : DEFAULT_PANEL_WIDTH,
  );

  useEffect(() => {
    if (!sessionId) {
      setWidthState(DEFAULT_PANEL_WIDTH);
      return;
    }
    setWidthState(readWidth(window.localStorage, sessionId) ?? DEFAULT_PANEL_WIDTH);
  }, [sessionId]);

  const state: SessionPanelState = sessionId
    ? panels[sessionId] ?? EMPTY_PANEL_STATE
    : EMPTY_PANEL_STATE;

  const dispatch = useCallback(
    (action: PanelAction) => {
      if (!sessionId) return;
      setPanels((prev) => {
        const current = prev[sessionId] ?? EMPTY_PANEL_STATE;
        const next = panelReducer(current, action);
        const bySession = { ...prev };
        if (next.surfaces.length === 0) delete bySession[sessionId];
        else bySession[sessionId] = next;
        writePanels(window.localStorage, bySession);
        return bySession;
      });
    },
    [sessionId],
  );

  const setWidth = useCallback(
    (value: number, persist = false) => {
      setWidthState(value);
      if (persist && sessionId) writeWidth(window.localStorage, sessionId, value);
    },
    [sessionId],
  );

  return { state, dispatch, width, setWidth };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/use-panel-store.test.tsx`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/right-panel/usePanelStore.ts tests/use-panel-store.test.tsx
git commit -m "Bind right panel state to React and localStorage"
```

---

### Task 9: The tab strip

**Files:**
- Create: `src/renderer/right-panel/RightPanelTabs.tsx`
- Modify: `src/renderer/icons.tsx` (add `IconPanelRight`, `IconGitCompare`, `IconFiles`, `IconListTodo`, `IconRefresh`, `IconXSmall`)
- Modify: `src/renderer/styles.css` (add the `.right-panel*` block at the end of the file)
- Test: `tests/right-panel-tabs.test.tsx`

**Interfaces:**
- Consumes: `RightPanelSurface`, `SessionPanelState`, `PanelAction`, `fileSurfaceId` (Task 1).
- Produces: `surfaceTitle(surface): string`, `surfaceIcon(surface)`, `RightPanelTabs({ state, dispatch, onMaximize, maximized })`.

- [ ] **Step 1: Write the failing test**

Create `tests/right-panel-tabs.test.tsx`:

```tsx
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { RightPanelTabs } from "../src/renderer/right-panel/RightPanelTabs.tsx";
import { panelReducer, EMPTY_PANEL_STATE } from "../src/shared/right-panel.ts";

afterEach(cleanup);

function stateWith(...actions: Parameters<typeof panelReducer>[1][]) {
  return actions.reduce(panelReducer, EMPTY_PANEL_STATE);
}

describe("surfaceTitle", () => {
  it("names files by their base name and singletons by kind", () => {
    expect(surfaceTitle({ id: "changes", kind: "changes" })).toBe("Changes");
    expect(surfaceTitle({ id: "files", kind: "files" })).toBe("Files");
    expect(surfaceTitle({ id: "plan", kind: "plan" })).toBe("Plan");
    expect(
      surfaceTitle({
        id: "file:src/right-panel/RightPanelTabs.tsx",
        kind: "file",
        path: "src/right-panel/RightPanelTabs.tsx",
        revealLine: null,
        revealRequestId: 0,
      }),
    ).toBe("RightPanelTabs.tsx");
  });
});

describe("RightPanelTabs", () => {
  it("renders one tab per surface and activates on click", () => {
    const dispatch = vi.fn();
    const state = stateWith({ type: "open", kind: "changes" }, { type: "open", kind: "plan" });
    render(
      <RightPanelTabs
        state={state}
        dispatch={dispatch}
        maximized={false}
        onMaximize={() => {}}
      />,
    );
    expect(screen.getByRole("tab", { name: "Changes" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Plan" })).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "Changes" }));
    expect(dispatch).toHaveBeenCalledWith({ type: "activate", id: "changes" });
  });

  it("closes a tab and closes others from the context menu", () => {
    const dispatch = vi.fn();
    const state = stateWith({ type: "open", kind: "changes" }, { type: "open", kind: "plan" });
    render(
      <RightPanelTabs
        state={state}
        dispatch={dispatch}
        maximized={false}
        onMaximize={() => {}}
      />,
    );
    fireEvent.contextMenu(screen.getByRole("tab", { name: "Plan" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Close others" }));
    expect(dispatch).toHaveBeenCalledWith({ type: "closeOthers", id: "plan" });
  });

  it("adds a surface from the plus menu and queries files", () => {
    const dispatch = vi.fn();
    render(
      <RightPanelTabs
        state={stateWith()}
        dispatch={dispatch}
        maximized={false}
        onMaximize={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Add panel surface" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Files" }));
    expect(dispatch).toHaveBeenCalledWith({ type: "open", kind: "files" });
  });

  it("toggles maximize", () => {
    const onMaximize = vi.fn();
    render(
      <RightPanelTabs
        state={stateWith({ type: "open", kind: "changes" })}
        dispatch={() => {}}
        maximized={false}
        onMaximize={onMaximize}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Maximize panel" }));
    expect(onMaximize).toHaveBeenCalled();
  });
});
```

Import `surfaceTitle` in that test file alongside `RightPanelTabs`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/right-panel-tabs.test.tsx`
Expected: FAIL — cannot resolve `../src/renderer/right-panel/RightPanelTabs.tsx`.

- [ ] **Step 3: Write the implementation**

Add to `src/renderer/icons.tsx` (import `PanelRight`, `GitCompare`, `Files`, `ListTodo`, `RotateCw` from `lucide-react`, then add the exports next to `IconPanelLeft`):

```tsx
export const IconPanelRight = icon(PanelRight);
export const IconGitCompare = icon(GitCompare, { size: 14, strokeWidth: 1.75 });
export const IconFiles = icon(Files, { size: 14, strokeWidth: 1.75 });
export const IconListTodo = icon(ListTodo, { size: 14, strokeWidth: 1.75 });
export const IconRefresh = icon(RotateCw, { size: 13, strokeWidth: 1.75 });
```

Create `src/renderer/right-panel/RightPanelTabs.tsx`:

```tsx
import { useState, type ReactNode } from "react";
import type {
  PanelAction,
  RightPanelSurface,
  SessionPanelState,
} from "../../shared/right-panel.ts";
import {
  IconFiles,
  IconGitCompare,
  IconListTodo,
  IconPanelRight,
  IconPlus,
  IconX,
} from "../icons";

export function surfaceTitle(surface: RightPanelSurface): string {
  if (surface.kind === "changes") return "Changes";
  if (surface.kind === "files") return "Files";
  if (surface.kind === "plan") return "Plan";
  const parts = surface.path.split("/");
  return parts[parts.length - 1] || surface.path;
}

function surfaceIcon(surface: RightPanelSurface): ReactNode {
  if (surface.kind === "changes") return <IconGitCompare />;
  if (surface.kind === "files") return <IconFiles />;
  if (surface.kind === "plan") return <IconListTodo />;
  return <IconFiles />;
}

const ADD_ACTIONS: Array<{ kind: "changes" | "files" | "plan"; label: string }> = [
  { kind: "changes", label: "Changes" },
  { kind: "files", label: "Files" },
  { kind: "plan", label: "Plan" },
];

type Props = {
  state: SessionPanelState;
  dispatch: (action: PanelAction) => void;
  maximized: boolean;
  onMaximize: () => void;
};

export function RightPanelTabs({ state, dispatch, maximized, onMaximize }: Props) {
  const [addOpen, setAddOpen] = useState(false);
  const [menuId, setMenuId] = useState<string | null>(null);

  return (
    <div className="right-panel-tabs">
      <div className="right-panel-tab-strip" role="tablist" aria-label="Panel surfaces">
        {state.surfaces.map((surface) => (
          <div
            key={surface.id}
            role="tab"
            tabIndex={0}
            aria-selected={state.activeSurfaceId === surface.id}
            className={
              state.activeSurfaceId === surface.id
                ? "right-panel-tab active"
                : "right-panel-tab"
            }
            onClick={() => dispatch({ type: "activate", id: surface.id })}
            onContextMenu={(event) => {
              event.preventDefault();
              setMenuId(surface.id);
            }}
          >
            {surfaceIcon(surface)}
            <span className="right-panel-tab-title">{surfaceTitle(surface)}</span>
            <button
              type="button"
              className="right-panel-tab-close"
              aria-label={`Close ${surfaceTitle(surface)}`}
              onClick={(event) => {
                event.stopPropagation();
                dispatch({ type: "close", id: surface.id });
              }}
            >
              <IconX />
            </button>
            {menuId === surface.id ? (
              <div className="right-panel-menu" role="menu">
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuId(null);
                    dispatch({ type: "close", id: surface.id });
                  }}
                >
                  Close
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuId(null);
                    dispatch({ type: "closeOthers", id: surface.id });
                  }}
                >
                  Close others
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuId(null);
                    dispatch({ type: "closeAll" });
                  }}
                >
                  Close all
                </button>
              </div>
            ) : null}
          </div>
        ))}
        <div className="right-panel-add">
          <button
            type="button"
            className="icon-btn"
            aria-label="Add panel surface"
            onClick={() => setAddOpen((value) => !value)}
          >
            <IconPlus />
          </button>
          {addOpen ? (
            <div className="right-panel-menu" role="menu">
              {ADD_ACTIONS.map((action) => (
                <button
                  key={action.kind}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setAddOpen(false);
                    dispatch({ type: "open", kind: action.kind });
                  }}
                >
                  {action.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>
      <button
        type="button"
        className="icon-btn"
        aria-label={maximized ? "Restore panel size" : "Maximize panel"}
        onClick={onMaximize}
      >
        <IconPanelRight />
      </button>
    </div>
  );
}
```

Append to `src/renderer/styles.css`:

```css
.right-panel {
  flex: 0 0 auto;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: var(--editor);
  border-left: 1px solid var(--line);
  position: relative;
}

.right-panel-tabs {
  flex-shrink: 0;
  height: var(--titlebar);
  display: flex;
  align-items: center;
  gap: var(--space-1);
  padding: 0 var(--space-2);
  border-bottom: 1px solid var(--line);
}

.right-panel-tab-strip {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: var(--space-0-5);
  overflow-x: auto;
  scrollbar-width: none;
}

.right-panel-tab-strip::-webkit-scrollbar {
  display: none;
}

.right-panel-tab {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  height: var(--height-sm);
  padding: 0 var(--space-1) 0 var(--space-2);
  border-radius: var(--radius-sm);
  color: var(--tertiary);
  font-size: var(--font-size-sm);
  white-space: nowrap;
  cursor: default;
}

.right-panel-tab.active {
  background: var(--active);
  color: var(--text);
}

.right-panel-tab-close {
  border: 0;
  background: transparent;
  color: inherit;
  padding: 0;
  display: inline-flex;
  align-items: center;
  opacity: 0;
}

.right-panel-tab:hover .right-panel-tab-close,
.right-panel-tab.active .right-panel-tab-close {
  opacity: 1;
}

.right-panel-menu {
  position: absolute;
  top: calc(100% + var(--space-1));
  right: 0;
  z-index: 10;
  min-width: 140px;
  display: flex;
  flex-direction: column;
  padding: var(--space-1);
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  box-shadow: 0 8px 24px color-mix(in srgb, var(--base) 18%, transparent);
}

.right-panel-menu button {
  border: 0;
  background: transparent;
  color: var(--text);
  text-align: left;
  padding: var(--space-1) var(--space-2);
  border-radius: var(--radius-sm);
  font-size: var(--font-size-sm);
}

.right-panel-menu button:hover {
  background: var(--hover);
}

.right-panel-add {
  position: relative;
  display: inline-flex;
}

.right-panel-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.right-panel-handle {
  position: absolute;
  top: 0;
  bottom: 0;
  left: -2px;
  width: 4px;
  cursor: col-resize;
  z-index: 6;
}

.right-panel-handle:hover {
  background: var(--line);
}

.right-panel.overlay {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  width: min(560px, 100%);
  z-index: 20;
  border-left: 1px solid var(--line);
  box-shadow: -12px 0 32px color-mix(in srgb, var(--base) 14%, transparent);
}

.right-panel-scrim {
  position: absolute;
  inset: 0;
  z-index: 19;
  background: color-mix(in srgb, var(--base) 12%, transparent);
}

.right-panel.maximized {
  flex: 1;
}

.canvas-body {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/right-panel-tabs.test.tsx`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/right-panel/RightPanelTabs.tsx src/renderer/icons.tsx src/renderer/styles.css tests/right-panel-tabs.test.tsx
git commit -m "Render the right panel tab strip"
```

---

### Task 10: Git changes hook and the Changes surface

**Files:**
- Create: `src/renderer/right-panel/useGitChanges.ts`
- Create: `src/renderer/right-panel/PanelChanges.tsx`
- Modify: `src/renderer/styles.css` (append the `.panel-changes*` rules)
- Test: `tests/panel-changes.test.tsx`

**Interfaces:**
- Consumes: `GitChangesResult`, `GitFileDiff`, `changeLabel` (Task 3); bridge methods from Task 7; `DiffBlock` from `src/renderer/DiffBlock.tsx`.
- Produces: `useGitChanges(cwd: string | null): { changes: GitChangesResult | null; loading: boolean; error: string | null; refresh: () => void }`, `PanelChanges({ cwd, changes, loading, error, onRefresh, onOpenInEditor })`.

- [ ] **Step 1: Write the failing test**

Create `tests/panel-changes.test.tsx`:

```tsx
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { PanelChanges } from "../src/renderer/right-panel/PanelChanges.tsx";
import type { RelayBridge } from "../src/renderer/env.d.ts";

afterEach(() => {
  cleanup();
  delete (window as { relay?: unknown }).relay;
});

function bridge(overrides: Partial<RelayBridge> = {}): RelayBridge {
  return {
    gitChanges: async () => ({
      branch: "main",
      files: [
        { path: "src/a.ts", status: "modified", insertions: 4, deletions: 2 },
        { path: "src/b.ts", status: "untracked" },
      ],
    }),
    gitFileDiff: async (_cwd: string, path: string) => ({
      path,
      oldText: "a\n",
      newText: "b\n",
      truncated: false,
      binary: false,
    }),
    ...overrides,
  } as unknown as RelayBridge;
}

describe("PanelChanges", () => {
  it("lists changed files with their line counts", () => {
    render(
      <PanelChanges
        cwd="/repo"
        changes={{
          branch: "main",
          files: [{ path: "src/a.ts", status: "modified", insertions: 4, deletions: 2 }],
        }}
        loading={false}
        error={null}
        onRefresh={() => {}}
        onOpenInEditor={() => {}}
      />,
    );
    expect(screen.getByText("src/a.ts")).toBeTruthy();
    expect(screen.getByText("+4")).toBeTruthy();
    expect(screen.getByText("-2")).toBeTruthy();
    expect(screen.getByText("main")).toBeTruthy();
  });

  it("loads the diff of the selected file", async () => {
    window.relay = bridge();
    render(
      <PanelChanges
        cwd="/repo"
        changes={{
          branch: "main",
          files: [{ path: "src/a.ts", status: "modified", insertions: 4, deletions: 2 }],
        }}
        loading={false}
        error={null}
        onRefresh={() => {}}
        onOpenInEditor={() => {}}
      />,
    );
    fireEvent.click(screen.getByText("src/a.ts"));
    await waitFor(() => expect(screen.getByText("src/a.ts")).toBeTruthy());
    expect(window.relay.gitFileDiff).toHaveBeenCalledWith("/repo", "src/a.ts");
  });

  it("shows an empty state outside a repository and a retry when it errors", () => {
    const { rerender } = render(
      <PanelChanges
        cwd="/plain"
        changes={null}
        loading={false}
        error={null}
        onRefresh={() => {}}
        onOpenInEditor={() => {}}
      />,
    );
    expect(screen.getByText("No repository in this folder")).toBeTruthy();

    const refresh = vi.fn();
    rerender(
      <PanelChanges
        cwd="/repo"
        changes={null}
        loading={false}
        error="git failed"
        onRefresh={refresh}
        onOpenInEditor={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(refresh).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/panel-changes.test.tsx`
Expected: FAIL — cannot resolve `../src/renderer/right-panel/PanelChanges.tsx`.

- [ ] **Step 3: Write the implementation**

Create `src/renderer/right-panel/useGitChanges.ts`:

```ts
import { useCallback, useEffect, useRef, useState } from "react";
import type { GitChangesResult } from "../../shared/git.ts";

export function useGitChanges(cwd: string | null) {
  const [changes, setChanges] = useState<GitChangesResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const runRef = useRef(0);

  const refresh = useCallback(() => {
    if (!cwd) {
      setChanges(null);
      setLoading(false);
      setError(null);
      return;
    }
    const run = runRef.current + 1;
    runRef.current = run;
    setLoading(true);
    void window.relay
      .gitChanges(cwd)
      .then((result) => {
        if (runRef.current !== run) return;
        setChanges(result);
        setError(null);
      })
      .catch((cause: unknown) => {
        if (runRef.current !== run) return;
        setChanges(null);
        setError(cause instanceof Error ? cause.message : String(cause));
      })
      .finally(() => {
        if (runRef.current !== run) return;
        setLoading(false);
      });
  }, [cwd]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { changes, loading, error, refresh };
}
```

Create `src/renderer/right-panel/PanelChanges.tsx`:

```tsx
import { useEffect, useState } from "react";
import { changeLabel, type GitChangesResult, type GitFileDiff } from "../../shared/git.ts";
import { DiffBlock } from "../DiffBlock";
import { IconExternalLink, IconRefresh } from "../icons";

type Props = {
  cwd: string;
  changes: GitChangesResult | null;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
  onOpenInEditor: (path: string) => void;
};

export function PanelChanges({
  cwd,
  changes,
  loading,
  error,
  onRefresh,
  onOpenInEditor,
}: Props) {
  const [selected, setSelected] = useState<string | null>(null);
  const [diff, setDiff] = useState<GitFileDiff | null>(null);
  const [diffError, setDiffError] = useState<string | null>(null);

  useEffect(() => {
    if (!cwd || !selected) {
      setDiff(null);
      setDiffError(null);
      return;
    }
    let cancelled = false;
    setDiff(null);
    setDiffError(null);
    void window.relay
      .gitFileDiff(cwd, selected)
      .then((result) => {
        if (!cancelled) setDiff(result);
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setDiffError(cause instanceof Error ? cause.message : String(cause));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [cwd, selected]);

  if (error) {
    return (
      <div className="panel-changes">
        <p className="panel-note">{error}</p>
        <button type="button" className="panel-action" onClick={onRefresh}>
          Retry
        </button>
      </div>
    );
  }

  if (!changes) {
    return (
      <div className="panel-changes">
        <p className="panel-note">
          {loading ? "Checking for changes…" : "No repository in this folder"}
        </p>
        {loading ? null : (
          <button type="button" className="panel-action" onClick={onRefresh}>
            Retry
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="panel-changes">
      <div className="panel-row panel-changes-head">
        <span className="panel-branch">{changes.branch || "detached"}</span>
        <span className="panel-count">{changes.files.length} changed</span>
        <button
          type="button"
          className="icon-btn"
          aria-label="Refresh changes"
          onClick={onRefresh}
        >
          <IconRefresh />
        </button>
      </div>
      {changes.files.length === 0 ? (
        <p className="panel-note">No changes in the working tree</p>
      ) : (
        <div className="panel-changes-list">
          {changes.files.map((file) => (
            <div key={file.path} className="panel-file-row-wrap">
              <button
                type="button"
                className={
                  selected === file.path ? "panel-file-row active" : "panel-file-row"
                }
                onClick={() => setSelected(file.path)}
              >
                <span className="panel-file-path">{file.path}</span>
                <span className={`panel-status panel-status-${file.status}`}>
                  {changeLabel(file.status)}
                </span>
                {file.insertions == null ? null : (
                  <span className="panel-stat add">+{file.insertions}</span>
                )}
                {file.deletions == null ? null : (
                  <span className="panel-stat del">-{file.deletions}</span>
                )}
                <span
                  className="panel-file-open"
                  role="button"
                  tabIndex={0}
                  aria-label={`Open ${file.path} in editor`}
                  onClick={(event) => {
                    event.stopPropagation();
                    onOpenInEditor(file.path);
                  }}
                >
                  <IconExternalLink />
                </span>
              </button>
            </div>
          ))}
        </div>
      )}
      {selected ? (
        <div className="panel-diff">
          {diffError ? <p className="panel-note">{diffError}</p> : null}
          {diff ? (
            <DiffView diff={diff} onOpenInEditor={onOpenInEditor} />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function DiffView({
  diff,
  onOpenInEditor,
}: {
  diff: GitFileDiff;
  onOpenInEditor: (path: string) => void;
}) {
  if (diff.binary) return <p className="panel-note">Binary file</p>;
  if (diff.truncated && !diff.oldText && !diff.newText) {
    return (
      <div className="panel-note">
        <p>File is too large to diff</p>
        <button
          type="button"
          className="panel-action"
          onClick={() => onOpenInEditor(diff.path)}
        >
          Open in editor
        </button>
      </div>
    );
  }
  return (
    <>
      {diff.truncated ? <p className="panel-note">Diff truncated</p> : null}
      <DiffBlock path={diff.path} oldText={diff.oldText} newText={diff.newText} />
    </>
  );
}
```

Add `IconExternalLink` to `src/renderer/icons.tsx` (import `ExternalLink` from `lucide-react`):

```tsx
export const IconExternalLink = icon(ExternalLink, { size: 13, strokeWidth: 1.75 });
```

Append to `src/renderer/styles.css`:

```css
.panel-changes,
.panel-files,
.panel-file,
.panel-plan {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: auto;
}

.panel-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2);
  border-bottom: 1px solid var(--line);
}

.panel-changes-head {
  position: sticky;
  top: 0;
  background: var(--editor);
  z-index: 2;
}

.panel-branch {
  font-size: var(--font-size-sm);
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.panel-count {
  flex: 1;
  font-size: var(--font-size-xs);
  color: var(--tertiary);
}

.panel-note {
  padding: var(--space-2);
  color: var(--tertiary);
  font-size: var(--font-size-sm);
}

.panel-action {
  align-self: flex-start;
  margin: 0 var(--space-2) var(--space-2);
  border: 1px solid var(--line);
  background: transparent;
  color: var(--text);
  border-radius: var(--radius-sm);
  padding: var(--space-1) var(--space-2);
  font-size: var(--font-size-sm);
}

.panel-file-row {
  width: 100%;
  display: flex;
  align-items: center;
  gap: var(--space-1);
  border: 0;
  background: transparent;
  color: var(--text);
  text-align: left;
  padding: var(--space-1) var(--space-2);
  font-size: var(--font-size-sm);
}

.panel-file-row:hover {
  background: var(--hover);
}

.panel-file-row.active {
  background: var(--active);
}

.panel-file-path {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  direction: rtl;
  text-align: left;
}

.panel-status {
  font-size: var(--font-size-xs);
  color: var(--tertiary);
}

.panel-stat {
  font-family: var(--mono);
  font-size: var(--font-size-xs);
}

.panel-stat.add {
  color: var(--ok);
}

.panel-stat.del {
  color: var(--danger);
}

.panel-file-open {
  display: inline-flex;
  opacity: 0;
}

.panel-file-row:hover .panel-file-open {
  opacity: 1;
}

.panel-diff {
  border-top: 1px solid var(--line);
  padding: var(--space-2);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/panel-changes.test.tsx`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/right-panel/useGitChanges.ts src/renderer/right-panel/PanelChanges.tsx src/renderer/icons.tsx src/renderer/styles.css tests/panel-changes.test.tsx
git commit -m "Add the Changes surface to the right panel"
```

---

### Task 11: Files explorer and file preview surfaces

**Files:**
- Create: `src/renderer/right-panel/PanelFiles.tsx`
- Create: `src/renderer/right-panel/PanelFile.tsx`
- Test: `tests/panel-files.test.tsx`
- Test: `tests/panel-file.test.tsx`

**Interfaces:**
- Consumes: bridge `listFiles` / `readFile` (Task 7), `CodeBlock` from `src/renderer/CodeBlock.tsx`.
- Produces: `PanelFiles({ cwd, onOpenFile })`, `PanelFile({ cwd, path, revealLine, revealRequestId, onOpenInEditor })`.

- [ ] **Step 1: Write the failing tests**

Create `tests/panel-files.test.tsx`:

```tsx
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { PanelFiles } from "../src/renderer/right-panel/PanelFiles.tsx";
import type { RelayBridge } from "../src/renderer/env.d.ts";

afterEach(() => {
  cleanup();
  delete (window as { relay?: unknown }).relay;
});

describe("PanelFiles", () => {
  it("lists files and opens one on click", async () => {
    window.relay = {
      listFiles: async (_cwd: string, query?: string) =>
        query ? ["src/app.ts"] : ["src/app.ts", "README.md"],
    } as unknown as RelayBridge;
    const onOpenFile = vi.fn();
    render(<PanelFiles cwd="/repo" onOpenFile={onOpenFile} />);
    await waitFor(() => expect(screen.getByText("README.md")).toBeTruthy());
    fireEvent.click(screen.getByText("src/app.ts"));
    expect(onOpenFile).toHaveBeenCalledWith("src/app.ts");
  });

  it("filters with the query", async () => {
    const listFiles = vi.fn(async (_cwd: string, query?: string) =>
      query ? ["src/app.ts"] : ["src/app.ts", "README.md"],
    );
    window.relay = { listFiles } as unknown as RelayBridge;
    render(<PanelFiles cwd="/repo" onOpenFile={() => {}} />);
    await waitFor(() => expect(screen.getByText("README.md")).toBeTruthy());
    fireEvent.change(screen.getByRole("textbox", { name: "Filter files" }), {
      target: { value: "app" },
    });
    await waitFor(() =>
      expect(listFiles).toHaveBeenCalledWith("/repo", "app"),
    );
    expect(screen.queryByText("README.md")).toBeNull();
  });
});
```

Create `tests/panel-file.test.tsx`:

```tsx
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { PanelFile } from "../src/renderer/right-panel/PanelFile.tsx";
import type { RelayBridge } from "../src/renderer/env.d.ts";

afterEach(() => {
  cleanup();
  delete (window as { relay?: unknown }).relay;
});

describe("PanelFile", () => {
  it("renders the file contents", async () => {
    window.relay = {
      readFile: async () => ({
        path: "src/app.ts",
        text: "const app = 1;\n",
        truncated: false,
        binary: false,
      }),
    } as unknown as RelayBridge;
    render(
      <PanelFile
        cwd="/repo"
        path="src/app.ts"
        revealLine={null}
        revealRequestId={0}
        onOpenInEditor={() => {}}
      />,
    );
    await waitFor(() => expect(screen.getByText(/const app = 1;/)).toBeTruthy());
  });

  it("reports binary and truncated files", async () => {
    window.relay = {
      readFile: async () => ({
        path: "logo.png",
        text: "",
        truncated: true,
        binary: true,
      }),
    } as unknown as RelayBridge;
    render(
      <PanelFile
        cwd="/repo"
        path="logo.png"
        revealLine={null}
        revealRequestId={0}
        onOpenInEditor={() => {}}
      />,
    );
    await waitFor(() => expect(screen.getByText("Binary file")).toBeTruthy());
  });

  it("refetches when revealRequestId changes", async () => {
    const readFile = vi.fn(async () => ({
      path: "src/app.ts",
      text: "one\n",
      truncated: false,
      binary: false,
    }));
    window.relay = { readFile } as unknown as RelayBridge;
    const { rerender } = render(
      <PanelFile
        cwd="/repo"
        path="src/app.ts"
        revealLine={1}
        revealRequestId={0}
        onOpenInEditor={() => {}}
      />,
    );
    await waitFor(() => expect(readFile).toHaveBeenCalledTimes(1));
    rerender(
      <PanelFile
        cwd="/repo"
        path="src/app.ts"
        revealLine={9}
        revealRequestId={1}
        onOpenInEditor={() => {}}
      />,
    );
    await waitFor(() => expect(readFile).toHaveBeenCalledTimes(2));
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/panel-files.test.tsx tests/panel-file.test.tsx`
Expected: FAIL — cannot resolve the two component modules.

- [ ] **Step 3: Write the implementation**

Create `src/renderer/right-panel/PanelFiles.tsx`:

```tsx
import { useEffect, useState } from "react";

type Props = {
  cwd: string;
  onOpenFile: (path: string) => void;
};

export function PanelFiles({ cwd, onOpenFile }: Props) {
  const [query, setQuery] = useState("");
  const [files, setFiles] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!cwd) {
      setFiles([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const timer = window.setTimeout(() => {
      void window.relay
        .listFiles(cwd, query.trim())
        .then((result) => {
          if (!cancelled) setFiles(result);
        })
        .catch(() => {
          if (!cancelled) setFiles([]);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, query ? 120 : 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [cwd, query]);

  return (
    <div className="panel-files">
      <div className="panel-row">
        <input
          className="panel-input"
          aria-label="Filter files"
          placeholder="Filter files"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      {files.length === 0 ? (
        <p className="panel-note">{loading ? "Loading…" : "No files"}</p>
      ) : (
        <div className="panel-files-list">
          {files.map((file) => (
            <button
              key={file}
              type="button"
              className="panel-file-row"
              onClick={() => onOpenFile(file)}
            >
              <span className="panel-file-path">{file}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

Create `src/renderer/right-panel/PanelFile.tsx`:

```tsx
import { useEffect, useRef, useState } from "react";
import type { ReadFileResult } from "../../shared/ipc.ts";
import { CodeBlock } from "../CodeBlock";
import { IconExternalLink } from "../icons";

const LANGUAGE_BY_EXTENSION: Record<string, string> = {
  c: "c",
  cpp: "cpp",
  css: "css",
  go: "go",
  html: "xml",
  java: "java",
  js: "javascript",
  json: "json",
  jsx: "javascript",
  md: "markdown",
  py: "python",
  rb: "ruby",
  rs: "rust",
  sh: "bash",
  toml: "ini",
  ts: "typescript",
  tsx: "typescript",
  yml: "yaml",
  yaml: "yaml",
};

export function languageForPath(path: string): string | undefined {
  const parts = path.split(".");
  if (parts.length < 2) return undefined;
  return LANGUAGE_BY_EXTENSION[parts[parts.length - 1]!.toLowerCase()];
}

type Props = {
  cwd: string;
  path: string;
  revealLine: number | null;
  revealRequestId: number;
  onOpenInEditor: (path: string, line?: number) => void;
};

export function PanelFile({
  cwd,
  path,
  revealLine,
  revealRequestId,
  onOpenInEditor,
}: Props) {
  const [file, setFile] = useState<ReadFileResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!cwd) return;
    let cancelled = false;
    setError(null);
    void window.relay
      .readFile(cwd, path)
      .then((result) => {
        if (!cancelled) setFile(result);
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setFile(null);
          setError(cause instanceof Error ? cause.message : String(cause));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [cwd, path, revealRequestId]);

  useEffect(() => {
    if (!revealLine || !scrollerRef.current) return;
    const target = scrollerRef.current.querySelector(
      `[data-line="${revealLine}"]`,
    );
    if (target instanceof HTMLElement) target.scrollIntoView({ block: "center" });
  }, [revealLine, file]);

  return (
    <div className="panel-file">
      <div className="panel-row">
        <span className="panel-file-path" title={path}>
          {path}
        </span>
        <button
          type="button"
          className="icon-btn"
          aria-label="Open in editor"
          onClick={() => onOpenInEditor(path, revealLine ?? undefined)}
        >
          <IconExternalLink />
        </button>
      </div>
      <div className="panel-file-body" ref={scrollerRef}>
        {error ? <p className="panel-note">{error}</p> : null}
        {file?.binary ? <p className="panel-note">Binary file</p> : null}
        {file && !file.binary && file.truncated ? (
          <p className="panel-note">File truncated</p>
        ) : null}
        {file && !file.binary ? (
          <CodeBlock code={file.text} lang={languageForPath(path)} />
        ) : null}
      </div>
    </div>
  );
}
```

Append to `src/renderer/styles.css`:

```css
.panel-input {
  width: 100%;
  border: 0;
  background: var(--hover);
  color: var(--text);
  border-radius: var(--radius-sm);
  padding: var(--space-1) var(--space-2);
  font-size: var(--font-size-sm);
  outline: none;
}

.panel-files-list {
  display: flex;
  flex-direction: column;
}

.panel-file-body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: var(--space-2);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/panel-files.test.tsx tests/panel-file.test.tsx`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/right-panel/PanelFiles.tsx src/renderer/right-panel/PanelFile.tsx src/renderer/styles.css tests/panel-files.test.tsx tests/panel-file.test.tsx
git commit -m "Add the Files and File surfaces"
```

---

### Task 12: The Plan surface

**Files:**
- Create: `src/renderer/right-panel/PanelPlan.tsx`
- Test: `tests/panel-plan.test.tsx`

**Interfaces:**
- Consumes: `PlanEntry` from `src/shared/types.ts`, `PlanBlock` from `src/renderer/PlanBlock.tsx`.
- Produces: `PanelPlan({ entries })`.

- [ ] **Step 1: Write the failing test**

Create `tests/panel-plan.test.tsx`:

```tsx
// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { PanelPlan } from "../src/renderer/right-panel/PanelPlan.tsx";

afterEach(cleanup);

describe("PanelPlan", () => {
  it("shows the current plan entries", () => {
    render(
      <PanelPlan
        entries={[
          { content: "Read the spec", status: "completed" },
          { content: "Ship the panel", status: "in_progress" },
        ]}
      />,
    );
    expect(screen.getByText("Read the spec")).toBeTruthy();
    expect(screen.getByText("Ship the panel")).toBeTruthy();
  });

  it("shows an empty state when there is no plan", () => {
    render(<PanelPlan entries={[]} />);
    expect(screen.getByText("No plan yet")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/panel-plan.test.tsx`
Expected: FAIL — cannot resolve `../src/renderer/right-panel/PanelPlan.tsx`.

- [ ] **Step 3: Write the implementation**

Create `src/renderer/right-panel/PanelPlan.tsx`:

```tsx
import type { PlanEntry } from "../../shared/types.ts";
import { PlanBlock } from "../PlanBlock";

export function PanelPlan({ entries }: { entries: PlanEntry[] }) {
  if (entries.length === 0) {
    return (
      <div className="panel-plan">
        <p className="panel-note">No plan yet</p>
      </div>
    );
  }
  return (
    <div className="panel-plan">
      <PlanBlock entries={entries} />
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/panel-plan.test.tsx`
Expected: PASS, 2 tests.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/right-panel/PanelPlan.tsx tests/panel-plan.test.tsx
git commit -m "Add the Plan surface"
```

---

### Task 13: The panel shell

**Files:**
- Create: `src/renderer/right-panel/RightPanel.tsx`
- Test: `tests/right-panel-shell.test.tsx`

**Interfaces:**
- Consumes: `SessionPanelState`, `PanelAction` (Task 1), `clampPanelWidth` (Task 2), `RightPanelTabs` (Task 9), `PanelChanges` (Task 10), `PanelFiles` / `PanelFile` (Task 11), `PanelPlan` (Task 12), `GitChangesResult` (Task 3), `PlanEntry` (shared types).
- Produces: `RightPanel({ sessionId, cwd, state, dispatch, width, setWidth, changes, changesLoading, changesError, onRefreshChanges, planEntries })` rendering `null` while closed.

- [ ] **Step 1: Write the failing test**

Create `tests/right-panel-shell.test.tsx`:

```tsx
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { RightPanel } from "../src/renderer/right-panel/RightPanel.tsx";
import { EMPTY_PANEL_STATE, panelReducer } from "../src/shared/right-panel.ts";

afterEach(cleanup);

function props(
  actions: Parameters<typeof panelReducer>[1][],
  overrides: Partial<React.ComponentProps<typeof RightPanel>> = {},
) {
  const state = actions.reduce(panelReducer, EMPTY_PANEL_STATE);
  return {
    sessionId: "s1",
    cwd: "/repo",
    state,
    dispatch: vi.fn(),
    width: 540,
    setWidth: vi.fn(),
    changes: null,
    changesLoading: false,
    changesError: null,
    onRefreshChanges: vi.fn(),
    planEntries: [],
    ...overrides,
  };
}

describe("RightPanel", () => {
  it("renders nothing while closed", () => {
    const { container } = render(<RightPanel {...props([])} />);
    expect(container.querySelector(".right-panel")).toBeNull();
  });

  it("renders the active surface", () => {
    render(<RightPanel {...props([{ type: "open", kind: "changes" }])} />);
    expect(screen.getByText("No repository in this folder")).toBeTruthy();
  });

  it("switches surfaces when the active id changes", () => {
    render(
      <RightPanel
        {...props([
          { type: "open", kind: "files" },
          { type: "openFile", path: "src/a.ts" },
        ])}
      />,
    );
    expect(screen.getByRole("tab", { name: /a.ts/ })).toBeTruthy();
  });

  it("resizes with the handle and persists on release", () => {
    const setWidth = vi.fn();
    render(
      <RightPanel {...props([{ type: "open", kind: "changes" }], { setWidth })} />,
    );
    const handle = screen.getByRole("separator", { name: "Resize panel" });
    fireEvent.pointerDown(handle, { clientX: 900, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientX: 800, pointerId: 1 });
    fireEvent.pointerUp(handle, { clientX: 800, pointerId: 1 });
    expect(setWidth).toHaveBeenCalled();
  });

  it("maximizes from the tab strip", () => {
    const { container } = render(
      <RightPanel {...props([{ type: "open", kind: "changes" }])} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Maximize panel" }));
    expect(container.querySelector(".right-panel.maximized")).toBeTruthy();
  });
});
```

Add `import type React from "react";` at the top of the test file.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/right-panel-shell.test.tsx`
Expected: FAIL — cannot resolve `../src/renderer/right-panel/RightPanel.tsx`.

- [ ] **Step 3: Write the implementation**

Create `src/renderer/right-panel/RightPanel.tsx`:

```tsx
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { GitChangesResult } from "../../shared/git.ts";
import type { PanelAction, SessionPanelState } from "../../shared/right-panel.ts";
import type { PlanEntry } from "../../shared/types.ts";
import { clampPanelWidth } from "./persist.ts";
import { PanelChanges } from "./PanelChanges.tsx";
import { PanelFile } from "./PanelFile.tsx";
import { PanelFiles } from "./PanelFiles.tsx";
import { PanelPlan } from "./PanelPlan.tsx";
import { RightPanelTabs } from "./RightPanelTabs.tsx";

const OVERLAY_BREAKPOINT = 980;

type Props = {
  sessionId: string;
  cwd: string;
  state: SessionPanelState;
  dispatch: (action: PanelAction) => void;
  width: number;
  setWidth: (width: number, persist?: boolean) => void;
  changes: GitChangesResult | null;
  changesLoading: boolean;
  changesError: string | null;
  onRefreshChanges: () => void;
  planEntries: PlanEntry[];
  onOpenInEditor: (path: string, line?: number) => void;
};

export function RightPanel({
  sessionId,
  cwd,
  state,
  dispatch,
  width,
  setWidth,
  changes,
  changesLoading,
  changesError,
  onRefreshChanges,
  planEntries,
  onOpenInEditor,
}: Props) {
  const [maximized, setMaximized] = useState(false);
  const [overlay, setOverlay] = useState(
    () => typeof window !== "undefined" && window.innerWidth < OVERLAY_BREAKPOINT,
  );
  const rootRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);

  useEffect(() => {
    setMaximized(false);
  }, [sessionId]);

  useEffect(() => {
    const onResize = () => setOverlay(window.innerWidth < OVERLAY_BREAKPOINT);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    if (!overlay || !state.isOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") dispatch({ type: "hide" });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [overlay, state.isOpen, dispatch]);

  if (!state.isOpen) return null;

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { startX: event.clientX, startWidth: width };
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag) return;
    const container = rootRef.current?.parentElement;
    setWidth(
      clampPanelWidth(
        drag.startWidth - (event.clientX - drag.startX),
        window.innerWidth,
        container ? container.clientWidth : window.innerWidth,
      ),
    );
  }

  function onPointerUp() {
    if (!dragRef.current) return;
    dragRef.current = null;
    setWidth(width, true);
  }

  const active = state.surfaces.find((surface) => surface.id === state.activeSurfaceId);

  return (
    <>
      {overlay ? (
        <div className="right-panel-scrim" onClick={() => dispatch({ type: "hide" })} />
      ) : null}
      <div
        ref={rootRef}
        className={
          overlay ? "right-panel overlay" : maximized ? "right-panel maximized" : "right-panel"
        }
        style={overlay || maximized ? undefined : { width: `${width}px` }}
      >
        {overlay || maximized ? null : (
          <div
            className="right-panel-handle"
            role="separator"
            aria-label="Resize panel"
            aria-orientation="vertical"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          />
        )}
        <RightPanelTabs
          state={state}
          dispatch={dispatch}
          maximized={maximized}
          onMaximize={() => setMaximized((value) => !value)}
        />
        <div className="right-panel-body">
          {active?.kind === "changes" ? (
            <PanelChanges
              cwd={cwd}
              changes={changes}
              loading={changesLoading}
              error={changesError}
              onRefresh={onRefreshChanges}
              onOpenInEditor={(path) => onOpenInEditor(path)}
            />
          ) : null}
          {active?.kind === "files" ? (
            <PanelFiles
              cwd={cwd}
              onOpenFile={(path) => dispatch({ type: "openFile", path })}
            />
          ) : null}
          {active?.kind === "file" ? (
            <PanelFile
              cwd={cwd}
              path={active.path}
              revealLine={active.revealLine}
              revealRequestId={active.revealRequestId}
              onOpenInEditor={onOpenInEditor}
            />
          ) : null}
          {active?.kind === "plan" ? <PanelPlan entries={planEntries} /> : null}
        </div>
      </div>
    </>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/right-panel-shell.test.tsx`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/right-panel/RightPanel.tsx tests/right-panel-shell.test.tsx
git commit -m "Assemble the right panel shell"
```

---

### Task 14: Mount the panel and add the toolbar toggle

**Files:**
- Create: `src/renderer/right-panel/PanelToggle.tsx`
- Modify: `src/renderer/App.tsx` (hooks near `planEntries` at `src/renderer/App.tsx:425`; canvas render at `src/renderer/App.tsx:1572-1614`; keymap around `src/renderer/App.tsx:1169`)
- Modify: `src/renderer/styles.css` (`.canvas-body` if not already added, plus `.panel-toggle`)
- Test: `tests/panel-toggle.test.tsx`

**Interfaces:**
- Consumes: `usePanelStore` (Task 8), `useGitChanges` (Task 10), `RightPanel` (Task 13), `IconPanelRight` (Task 9).
- Produces: `PanelToggle({ pressed, count, disabled, onToggle })`; App wires `mod+alt+b`, `.canvas-body`, and the panel.

- [ ] **Step 1: Write the failing test**

Create `tests/panel-toggle.test.tsx`:

```tsx
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { PanelToggle } from "../src/renderer/right-panel/PanelToggle.tsx";

afterEach(cleanup);

describe("PanelToggle", () => {
  it("reflects the pressed state and toggles", () => {
    const onToggle = vi.fn();
    render(<PanelToggle pressed={false} count={0} disabled={false} onToggle={onToggle} />);
    const button = screen.getByRole("button", { name: /Toggle right panel/ });
    expect(button.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(button);
    expect(onToggle).toHaveBeenCalled();
  });

  it("shows the changed file count while closed and caps it at 99+", () => {
    const { rerender } = render(
      <PanelToggle pressed={false} count={3} disabled={false} onToggle={() => {}} />,
    );
    expect(screen.getByText("3")).toBeTruthy();
    rerender(<PanelToggle pressed={true} count={3} disabled={false} onToggle={() => {}} />);
    expect(screen.queryByText("3")).toBeNull();
    rerender(
      <PanelToggle pressed={false} count={120} disabled={false} onToggle={() => {}} />,
    );
    expect(screen.getByText("99+")).toBeTruthy();
  });

  it("is disabled without a session", () => {
    render(<PanelToggle pressed={false} count={0} disabled={true} onToggle={() => {}} />);
    expect(
      (screen.getByRole("button", { name: /Toggle right panel/ }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/panel-toggle.test.tsx`
Expected: FAIL — cannot resolve `../src/renderer/right-panel/PanelToggle.tsx`.

- [ ] **Step 3: Write the implementation**

Create `src/renderer/right-panel/PanelToggle.tsx`:

```tsx
import { IconPanelRight } from "../icons";

type Props = {
  pressed: boolean;
  count: number;
  disabled: boolean;
  onToggle: () => void;
};

export function PanelToggle({ pressed, count, disabled, onToggle }: Props) {
  const showBadge = !pressed && count > 0;
  return (
    <button
      type="button"
      className="icon-btn panel-toggle"
      aria-pressed={pressed}
      aria-label="Toggle right panel (⌘⌥B)"
      title="Toggle right panel (⌘⌥B)"
      disabled={disabled}
      onClick={onToggle}
    >
      <IconPanelRight />
      {showBadge ? (
        <span className="panel-toggle-badge">{count > 99 ? "99+" : count}</span>
      ) : null}
    </button>
  );
}
```

Append to `src/renderer/styles.css`:

```css
.panel-toggle {
  position: relative;
}

.panel-toggle[aria-pressed="true"] {
  color: var(--text);
  background: var(--active);
}

.panel-toggle-badge {
  position: absolute;
  top: -2px;
  right: -2px;
  min-width: 14px;
  height: 14px;
  padding: 0 3px;
  border-radius: 99px;
  background: var(--working);
  color: var(--chrome);
  font-size: 9px;
  line-height: 14px;
  text-align: center;
}
```

In `src/renderer/App.tsx`:

1. Add imports next to the other renderer imports:

```tsx
import { PanelToggle } from "./right-panel/PanelToggle";
import { RightPanel } from "./right-panel/RightPanel";
import { useGitChanges } from "./right-panel/useGitChanges";
import { usePanelStore } from "./right-panel/usePanelStore";
```

2. Immediately after the `planEntries` memo at `src/renderer/App.tsx:425-434`, add:

```tsx
  const panel = usePanelStore(selected?.id ?? null);
  const gitChanges = useGitChanges(selected?.workingDirectory ?? null);
  const openInEditor = useCallback(
    (path: string, line?: number) => {
      if (!selected) return;
      void window.relay
        .openInEditor(selected.workingDirectory, "vscode", path, line)
        .then((result) => {
          if (!result.ok) console.error(result.message);
        })
        .catch((error: unknown) => console.error(error));
    },
    [selected],
  );
```

Replace the `"vscode"` literal in the next task (Task 15) with the preferred editor.

3. Add a binding to `baseBindings` right after the `sidebar` binding at `src/renderer/App.tsx:1169`:

```tsx
    {
      id: "panel",
      keys: "mod+alt+b",
      label: "Toggle right panel",
      scope: "global",
      run: () => panel.dispatch({ type: "togglePanel" }),
    },
```

4. Add a palette entry after the `toggle-sidebar` command:

```tsx
    {
      id: "toggle-panel",
      label: "Toggle right panel",
      hint: "Changes, files, and plan",
      shortcut: "mod+alt+b",
      run: () => panel.dispatch({ type: "togglePanel" }),
    },
```

5. Replace the `canvas-tools-right` span at `src/renderer/App.tsx:1588-1595` with:

```tsx
          <span className="canvas-tools-right">
            <PanelToggle
              pressed={panel.state.isOpen}
              count={gitChanges.changes?.files.length ?? 0}
              disabled={!selected}
              onToggle={() => panel.dispatch({ type: "togglePanel" })}
            />
            <span className="ide-link" aria-disabled="true">
              IDE
              <IconOut />
            </span>
            <span className="icon-btn static" aria-hidden>
              <IconMore />
            </span>
          </span>
```

6. Wrap the thread column so the panel can sit beside it. Replace `<div className="thread">` at `src/renderer/App.tsx:1614` with a body row, and close it after the panel:

```tsx
        ) : selected ? (
          <div className="canvas-body">
            <div className="thread">
```

and where the thread `</div>` closes at `src/renderer/App.tsx:1723`, replace it with:

```tsx
            </div>
            <RightPanel
              sessionId={selected.id}
              cwd={selected.workingDirectory}
              state={panel.state}
              dispatch={panel.dispatch}
              width={panel.width}
              setWidth={panel.setWidth}
              changes={gitChanges.changes}
              changesLoading={gitChanges.loading}
              changesError={gitChanges.error}
              onRefreshChanges={gitChanges.refresh}
              planEntries={planEntries}
              onOpenInEditor={openInEditor}
            />
          </div>
```

Ensure `IconOut` is still imported (it is) and that removing the old `.ide-link` markup does not orphan imports.

- [ ] **Step 4: Run the tests and the typecheck**

Run: `npx vitest run tests/panel-toggle.test.tsx`
Expected: PASS, 3 tests.

Run: `npm test`
Expected: all suites pass.

Run: `npm run typecheck`
Expected: exit 0.

Run: `npm run build`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/right-panel/PanelToggle.tsx src/renderer/App.tsx src/renderer/styles.css tests/panel-toggle.test.tsx
git commit -m "Mount the right panel and its toolbar toggle"
```

---

### Task 15: The open-in-editor button

**Files:**
- Create: `src/renderer/right-panel/EditorButton.tsx`
- Modify: `src/renderer/App.tsx` (replace the `.ide-link` placeholder with `EditorButton`, pass the preferred editor, add `mod+o`)
- Modify: `src/renderer/styles.css` (replace the `.ide-link` rule set with `.editor-button*`)
- Test: `tests/editor-button.test.tsx`

**Interfaces:**
- Consumes: bridge `availableEditors` / `openInEditor` / `revealInFinder` (Task 7), `EditorInfo`, `OpenInEditorResult` (Task 6), `IconOut` (icons).
- Produces: `EditorButton({ cwd, path, preferred, onPreferred, disabled })`.

- [ ] **Step 1: Write the failing test**

Create `tests/editor-button.test.tsx`:

```tsx
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { EditorButton } from "../src/renderer/right-panel/EditorButton.tsx";
import type { RelayBridge } from "../src/renderer/env.d.ts";

afterEach(() => {
  cleanup();
  delete (window as { relay?: unknown }).relay;
});

function bridge(overrides: Partial<RelayBridge> = {}): RelayBridge {
  return {
    availableEditors: async () => [
      { id: "vscode", label: "VS Code", command: "code" },
      { id: "zed", label: "Zed", command: "zed" },
    ],
    openInEditor: async () => ({ ok: true }),
    revealInFinder: async () => true,
    ...overrides,
  } as unknown as RelayBridge;
}

describe("EditorButton", () => {
  it("opens the preferred editor and remembers a new choice", async () => {
    const openInEditor = vi.fn(async () => ({ ok: true }));
    const onPreferred = vi.fn();
    window.relay = bridge({ openInEditor });
    render(
      <EditorButton
        cwd="/repo"
        preferred={null}
        onPreferred={onPreferred}
        disabled={false}
      />,
    );
    await waitFor(() => expect(screen.getByText("Open in VS Code")).toBeTruthy());
    fireEvent.click(screen.getByText("Open in VS Code"));
    expect(openInEditor).toHaveBeenCalledWith("/repo", "vscode", undefined, undefined);

    fireEvent.click(screen.getByRole("button", { name: "Choose editor" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Zed" }));
    expect(onPreferred).toHaveBeenCalledWith("zed");
  });

  it("offers Reveal in Finder and reports failures", async () => {
    const revealInFinder = vi.fn(async () => true);
    window.relay = bridge({ revealInFinder });
    render(
      <EditorButton cwd="/repo" preferred="vscode" onPreferred={() => {}} disabled={false} />,
    );
    await waitFor(() => expect(screen.getByRole("button", { name: "Choose editor" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Choose editor" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Reveal in Finder" }));
    expect(revealInFinder).toHaveBeenCalledWith("/repo", ".");

    cleanup();
    window.relay = bridge({
      openInEditor: async () => ({ ok: false, message: "VS Code is not installed" }),
    });
    render(
      <EditorButton cwd="/repo" preferred="vscode" onPreferred={() => {}} disabled={false} />,
    );
    await waitFor(() => expect(screen.getByText("Open in VS Code")).toBeTruthy());
    fireEvent.click(screen.getByText("Open in VS Code"));
    await waitFor(() => expect(screen.getByText("VS Code is not installed")).toBeTruthy());
  });

  it("falls back to Reveal in Finder when no editor is installed", async () => {
    window.relay = bridge({ availableEditors: async () => [] });
    render(
      <EditorButton cwd="/repo" preferred={null} onPreferred={() => {}} disabled={false} />,
    );
    await waitFor(() => expect(screen.getByText("Reveal in Finder")).toBeTruthy());
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/editor-button.test.tsx`
Expected: FAIL — cannot resolve `../src/renderer/right-panel/EditorButton.tsx`.

- [ ] **Step 3: Write the implementation**

Create `src/renderer/right-panel/EditorButton.tsx`:

```tsx
import { useEffect, useState } from "react";
import type { EditorInfo } from "../../shared/editors.ts";
import { IconChevron, IconOut } from "../icons";

type Props = {
  cwd: string;
  path?: string;
  line?: number;
  preferred: string | null;
  onPreferred: (id: string) => void;
  disabled: boolean;
};

export function EditorButton({
  cwd,
  path,
  line,
  preferred,
  onPreferred,
  disabled,
}: Props) {
  const [editors, setEditors] = useState<EditorInfo[]>([]);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void window.relay
      .availableEditors()
      .then((result) => {
        if (!cancelled) setEditors(result);
      })
      .catch(() => {
        if (!cancelled) setEditors([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const preferredEditor =
    editors.find((editor) => editor.id === preferred) ?? editors[0] ?? null;

  function openIn(id: string) {
    setOpen(false);
    void window.relay
      .openInEditor(cwd, id, path, line)
      .then((result) => {
        setError(result.ok ? null : result.message);
      })
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : String(cause));
      });
  }

  function reveal() {
    setOpen(false);
    void window.relay
      .revealInFinder(cwd, path ?? ".")
      .then((ok) => setError(ok ? null : "Could not reveal the folder"))
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : String(cause));
      });
  }

  const label = preferredEditor ? `Open in ${preferredEditor.label}` : "Reveal in Finder";

  return (
    <span className="editor-button">
      <button
        type="button"
        className="editor-button-main"
        disabled={disabled}
        onClick={() => {
          if (preferredEditor) openIn(preferredEditor.id);
          else reveal();
        }}
      >
        {label}
        <IconOut />
      </button>
      <button
        type="button"
        className="editor-button-menu icon-btn"
        aria-label="Choose editor"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((value) => !value)}
      >
        <IconChevron />
      </button>
      {open ? (
        <div className="right-panel-menu" role="menu">
          {editors.map((editor) => (
            <button
              key={editor.id}
              type="button"
              role="menuitem"
              onClick={() => {
                onPreferred(editor.id);
                openIn(editor.id);
              }}
            >
              {editor.label}
            </button>
          ))}
          <button type="button" role="menuitem" onClick={reveal}>
            Reveal in Finder
          </button>
        </div>
      ) : null}
      {error ? <span className="editor-button-error">{error}</span> : null}
    </span>
  );
}
```

In `src/renderer/App.tsx`:

1. Add the import:

```tsx
import { EditorButton } from "./right-panel/EditorButton";
```

2. Replace the `openInEditor` callback added in Task 14 with a version that honours the preferred editor:

```tsx
  const openInEditor = useCallback(
    (path: string, line?: number) => {
      if (!selected) return;
      void window.relay
        .openInEditor(
          selected.workingDirectory,
          state.settings.preferredEditor || "vscode",
          path,
          line,
        )
        .then((result) => {
          if (!result.ok) console.error(result.message);
        })
        .catch((error: unknown) => console.error(error));
    },
    [selected, state.settings.preferredEditor],
  );
```

3. Add the `mod+o` binding right after the `panel` binding:

```tsx
    {
      id: "editor",
      keys: "mod+o",
      label: "Open in editor",
      scope: "global",
      run: () => openInEditor("."),
    },
```

4. Replace the `.ide-link` placeholder span in `canvas-tools-right` with:

```tsx
            <EditorButton
              cwd={selected?.workingDirectory ?? ""}
              preferred={state.settings.preferredEditor ?? null}
              disabled={!selected}
              onPreferred={(id) => void window.relay.setSetting("preferredEditor", id)}
            />
```

5. In `src/renderer/styles.css`, replace the `.ide-link` rules at `src/renderer/styles.css:737-741` with:

```css
.editor-button {
  display: inline-flex;
  align-items: center;
  gap: var(--space-0-5);
  position: relative;
}

.editor-button-main {
  border: 0;
  background: transparent;
  color: var(--tertiary);
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  height: var(--height-sm);
  padding: 0 var(--space-2);
  border-radius: var(--radius-sm);
  font-size: var(--font-size-sm);
}

.editor-button-main:hover {
  background: var(--hover);
  color: var(--text);
}

.editor-button-menu {
  width: 18px;
  height: var(--height-sm);
}

.editor-button-error {
  position: absolute;
  top: calc(100% + var(--space-1));
  right: 0;
  white-space: nowrap;
  color: var(--danger);
  font-size: var(--font-size-xs);
}
```

- [ ] **Step 4: Run the tests, typecheck, and build**

Run: `npx vitest run tests/editor-button.test.tsx`
Expected: PASS, 3 tests.

Run: `npm test`
Expected: all suites pass.

Run: `npm run typecheck`
Expected: exit 0.

Run: `npm run build`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/right-panel/EditorButton.tsx src/renderer/App.tsx src/renderer/styles.css tests/editor-button.test.tsx
git commit -m "Replace the IDE placeholder with a working editor button"
```

---

## Manual verification

After Task 15, run the dev app and confirm by hand:

```bash
env -u ELECTRON_RUN_AS_NODE npm run dev
```

1. Open a session in a git repository. The toolbar shows a panel toggle and an `Open in VS Code` button.
2. Click the toggle: the panel opens with a `Changes` tab listing the working tree changes with counts, and the badge disappears.
3. Click a changed file: its diff renders below the list.
4. `+` → `Files`, filter, click a file: a `file:` tab opens with the file text.
5. `+` → `Plan` after the agent emits a plan.
6. Drag the left edge: the panel resizes; after restart the width is remembered.
7. `mod+alt+b` toggles, `mod+o` opens the session directory in VS Code, `Reveal in Finder` works.
8. Open a session in a non-repository folder: the Changes tab shows `No repository in this folder` and no badge.

## Notes for the executor

- Task 7's mock edit is inside `tests/index.test.ts`'s existing `vi.mock("electron", ...)` factory; keep the change minimal and do not restructure that file.
- `EditorButton` never renders `path` for the toolbar case; `PanelFile` passes its own path.
- If `npm run build` fails on unused imports in `App.tsx` after the markup swaps, remove the orphaned import rather than disabling the check.
- Task 14 and Task 15 both touch `openInEditor` in `App.tsx`; apply Task 14's version first so Task 15's diff applies cleanly.
