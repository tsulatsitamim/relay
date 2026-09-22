# Terminal Surface Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user open real, persistent PTY-backed shells as tabs in a
session's right panel, running in that session's working directory.

**Architecture:** One main-process `TerminalManager` owns every PTY, keyed by a
UUID terminal id, with a bounded raw-byte scrollback buffer for replay. The
renderer panel stores terminal tabs as surfaces (`terminal:<uuid>`) alongside
the existing `file:` surfaces; a single wrapper around panel dispatch kills the
PTY whenever a terminal surface is removed. Idle terminals keep running; the
renderer re-attaches and replays the buffer whenever a terminal tab becomes
active, after a tab switch, or after a renderer reload.

**Tech Stack:** Electron 37 (main/renderer split, `contextIsolation: true`),
React 19, TypeScript 5.9, Vitest 3, `node-pty` 1.1 (native), `@xterm/xterm` 6
with `@xterm/addon-fit`.

**Spec:** `docs/superpowers/specs/2026-09-22-terminal-surface-design.md`

## Global Constraints

- TDD for every unit of production logic. Vitest, `environment: "node"` by
  default; renderer component tests opt into jsdom with
  `// @vitest-environment jsdom` as the first line.
- `npm test`, `npm run typecheck` and `npm run build` must all stay green. There
  is no lint script in this repo.
- All IPC input is validated in the main process; a **missing** terminal is a
  normal state, never an exception.
- `node-pty` is a native module: it must be built for the **Electron ABI** and
  is loaded only through a dynamic `import("node-pty")` inside
  `defaultPtySpawner`. Never import it at module scope — `tests/index.test.ts`
  imports `src/main/index.ts` under plain Node.
- Terminal surfaces are persisted; PTYs are not. Nothing may kill a PTY on a
  renderer reload.
- Terminal ids are main-minted UUIDs matching `^terminal:[0-9a-fA-F-]{36}$`.
- New runtime dependencies: `node-pty@^1.1.0`, `@xterm/xterm@^6.0.0`,
  `@xterm/addon-fit@^0.11.0`. New dev dependency: `@electron/rebuild@^4.2.0`.
- `electron-builder.yml`: `npmRebuild: true`; `asarUnpack` covers
  `**/node_modules/sql.js/**` **and** `**/node_modules/node-pty/**`.

## Review Focus

Inputs and failure modes the spec implies but whose owning task is easy to
under-test. Each line is pinned to a test in the task named:

1. **A shell binary that does not exist** (bad `$SHELL`, or a removed binary).
   `terminalCreate` must reject; the panel shows a `panel-note` and opens no tab
   — never an unhandled rejection or a blank tab. *(Task 4,
   `tests/use-terminal-launcher.test.tsx`.)*
2. **A restored tab whose PTY is gone** (app restart). Attach must answer
   `missing`; the tab shows the notice and Start-a-new-terminal works, and the
   stale id is a no-op in main. *(Tasks 2, 3, 5.)*
3. **Output arriving while a tab is unmounted** (tool running in a background
   tab). Nothing may be lost by the unmount: the buffer keeps filling and the
   re-attach replays it. *(Task 2, "attach replay after unmount".)*
4. **A `yes`-style output flood.** Chunks must be coalesced into one IPC message
   per tick with an immediate flush past 64 KB, and the buffer must stay bounded
   and trim by whole chunks. *(Task 2, coalescing + trim.)*
5. **Nonsense geometry** (panel collapsed to zero, `cols`/`rows` of `0`, `NaN`,
   `1e9`, a string). Clamped to 1–1000 / 1–1000 with sane fallbacks, no crash.
   *(Tasks 1 and 2.)*
6. **Removing a terminal surface by any path** (`close`, `closeOthers`,
   `closeAll`, session deletion). The PTY must die in every one — verified once
   in the pure helper and once end-to-end in main's sweep. *(Tasks 2, 3, 4.)*

---

### Task 0: Gate — prove `node-pty` builds for Electron 37 and spawns a shell

The whole design depends on a native build that this repo has never done
(`npmRebuild: false`, no `@electron/rebuild`, only sql.js in `asarUnpack`). Do
this first; if it fails, stop and report rather than continuing.

**Files:**
- Modify: `package.json`
- Create (temporary, deleted in Step 5): `pty-smoke.cjs`

**Interfaces:**
- Consumes: nothing.
- Produces: installed `node-pty@^1.1.0`, `@xterm/xterm@^6.0.0`,
  `@xterm/addon-fit@^0.11.0`, `@electron/rebuild@^4.2.0`, and a
  `"postinstall": "electron-rebuild -f -w node-pty"` script that leaves an
  Electron-ABI `pty.node` in place. Every later task assumes these exist.

- [ ] **Step 1: Install the dependencies**

Run: `npm install node-pty@^1.1.0 @xterm/xterm@^6.0.0 @xterm/addon-fit@^0.11.0 && npm install --save-dev @electron/rebuild@^4.2.0`
Expected: install completes; `node_modules/node-pty` exists.

- [ ] **Step 2: Add the postinstall script**

Add to `scripts` in `package.json` (this is the exact line the packaging test in
Task 6 asserts):

```json
    "postinstall": "electron-rebuild -f -w node-pty"
```

Then run: `npx electron-rebuild -f -w node-pty`
Expected: "Rebuild Complete" with no ABI error.

- [ ] **Step 3: Write the smoke script**

`pty-smoke.cjs` (CommonJS on purpose — `package.json` sets `"type": "module"`):

```js
const { app } = require("electron");
const pty = require("node-pty");

app.whenReady().then(() => {
  const shell = process.env.SHELL || "/bin/zsh";
  const term = pty.spawn(shell, ["-l"], {
    name: "xterm-256color",
    cols: 80,
    rows: 24,
    cwd: process.cwd(),
    env: { ...process.env },
  });
  let out = "";
  const done = (ok) => {
    if (ok) console.log("PTY_SMOKE_OK");
    else console.log("PTY_SMOKE_FAIL", JSON.stringify(out.slice(-300)));
    app.exit(ok ? 0 : 1);
  };
  term.onData((data) => {
    out += data;
    if (out.includes("__PTY_OK__")) done(true);
  });
  term.write("printf '__PTY_OK__\\n'\r");
  setTimeout(() => done(false), 10000);
});
```

- [ ] **Step 4: Run the smoke script under Electron**

Run: `npx electron pty-smoke.cjs`
Expected: `PTY_SMOKE_OK` and exit code 0. If this fails with a module version /
`NODE_MODULE_VERSION` error, the rebuild in Step 2 did not target Electron 37 —
stop here and report it.

- [ ] **Step 5: Delete the smoke script and commit**

```bash
rm pty-smoke.cjs
git add package.json package-lock.json
git commit -m "Add node-pty, xterm and the Electron ABI rebuild step"
```

---

### Task 1: Shared terminal contract and the terminal surface

**Files:**
- Create: `src/shared/terminal.ts`
- Create: `tests/terminal.test.ts`
- Modify: `src/shared/right-panel.ts:1-44`
- Modify: `tests/right-panel.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces (used by every later task):
  - `SCROLLBACK_LIMIT_BYTES = 262_144`, `FLUSH_THRESHOLD_BYTES = 65_536`,
    `REPLAY_PREFIX = "\x1b[0m\x1b[?25h"`, `DEFAULT_COLS = 80`,
    `DEFAULT_ROWS = 24`, `MAX_COLS = 1000`, `MAX_ROWS = 1000`
  - `type TerminalEvent = { type: "terminalData"; terminalId: string; data: string } | { type: "terminalExit"; terminalId: string; exitCode: number | null; signal: number | null } | { type: "terminalReset"; terminalId: string }`
  - `type TerminalCreateResult = { terminalId: string; title: string }`
  - `type TerminalAttachResult = { ok: true; data: string; exited: boolean; exitCode: number | null; signal: number | null } | { ok: false; reason: "missing" }`
  - `clampCols(value: unknown): number`, `clampRows(value: unknown): number`
  - `isTerminalId(value: unknown): value is \`terminal:${string}\``
  - `type TerminalSurface = { id: \`terminal:${string}\`; kind: "terminal"; title: string }`
  - `{ type: "openTerminal"; id: \`terminal:${string}\`; title: string }` panel action

- [ ] **Step 1: Write the failing shared-contract test**

Create `tests/terminal.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  DEFAULT_COLS,
  DEFAULT_ROWS,
  MAX_COLS,
  MAX_ROWS,
  clampCols,
  clampRows,
  isTerminalId,
} from "../src/shared/terminal.ts";

describe("clampCols and clampRows", () => {
  it("passes through a sane size and floors fractions", () => {
    expect(clampCols(120)).toBe(120);
    expect(clampRows(33.9)).toBe(33);
  });

  it("clamps to the supported range", () => {
    expect(clampCols(0)).toBe(1);
    expect(clampCols(-40)).toBe(1);
    expect(clampCols(1e9)).toBe(MAX_COLS);
    expect(clampRows(1e9)).toBe(MAX_ROWS);
  });

  it("falls back for junk", () => {
    expect(clampCols(Number.NaN)).toBe(DEFAULT_COLS);
    expect(clampCols("80")).toBe(DEFAULT_COLS);
    expect(clampCols(null)).toBe(DEFAULT_COLS);
    expect(clampRows(undefined)).toBe(DEFAULT_ROWS);
  });
});

describe("isTerminalId", () => {
  it("accepts a main-minted uuid id", () => {
    expect(isTerminalId("terminal:2f1a3c4d-5b6e-4f70-8a9b-0c1d2e3f4a5b")).toBe(true);
  });

  it("rejects counters, other kinds and non-strings", () => {
    expect(isTerminalId("terminal:1")).toBe(false);
    expect(isTerminalId("file:src/a.ts")).toBe(false);
    expect(isTerminalId("terminal:2f1a3c4d5b6e4f708a9b0c1d2e3f4a5b")).toBe(false);
    expect(isTerminalId(null)).toBe(false);
    expect(isTerminalId(7)).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run tests/terminal.test.ts`
Expected: FAIL — cannot resolve `../src/shared/terminal.ts`.

- [ ] **Step 3: Implement `src/shared/terminal.ts`**

```ts
export const SCROLLBACK_LIMIT_BYTES = 262_144;
export const FLUSH_THRESHOLD_BYTES = 65_536;
export const REPLAY_PREFIX = "\x1b[0m\x1b[?25h";
export const DEFAULT_COLS = 80;
export const DEFAULT_ROWS = 24;
export const MAX_COLS = 1000;
export const MAX_ROWS = 1000;

const TERMINAL_ID = /^terminal:[0-9a-fA-F-]{36}$/;

export type TerminalEvent =
  | { type: "terminalData"; terminalId: string; data: string }
  | {
      type: "terminalExit";
      terminalId: string;
      exitCode: number | null;
      signal: number | null;
    }
  | { type: "terminalReset"; terminalId: string };

export type TerminalCreateResult = { terminalId: string; title: string };

export type TerminalAttachResult =
  | {
      ok: true;
      data: string;
      exited: boolean;
      exitCode: number | null;
      signal: number | null;
    }
  | { ok: false; reason: "missing" };

export function isTerminalId(value: unknown): value is `terminal:${string}` {
  return typeof value === "string" && TERMINAL_ID.test(value);
}

function clampDimension(value: unknown, max: number, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  const rounded = Math.floor(value);
  if (rounded < 1) return 1;
  return rounded > max ? max : rounded;
}

export function clampCols(value: unknown): number {
  return clampDimension(value, MAX_COLS, DEFAULT_COLS);
}

export function clampRows(value: unknown): number {
  return clampDimension(value, MAX_ROWS, DEFAULT_ROWS);
}
```

- [ ] **Step 4: Run it to make sure it passes**

Run: `npx vitest run tests/terminal.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing surface-model test**

Append to `tests/right-panel.test.ts`:

```ts
  it("opens a terminal surface and keeps it alongside other kinds", () => {
    const id = "terminal:2f1a3c4d-5b6e-4f70-8a9b-0c1d2e3f4a5b";
    const state = panelReducer(openChanges(), {
      type: "openTerminal",
      id,
      title: "Terminal 1",
    });
    expect(state.isOpen).toBe(true);
    expect(state.activeSurfaceId).toBe(id);
    expect(state.surfaces).toEqual([
      { id: "changes", kind: "changes" },
      { id, kind: "terminal", title: "Terminal 1" },
    ]);
  });

  it("upserts a terminal surface by id without duplicating it", () => {
    const id = "terminal:2f1a3c4d-5b6e-4f70-8a9b-0c1d2e3f4a5b";
    const once = panelReducer(EMPTY_PANEL_STATE, {
      type: "openTerminal",
      id,
      title: "Terminal 1",
    });
    const twice = panelReducer(once, { type: "openTerminal", id, title: "Terminal 1" });
    expect(twice.surfaces).toHaveLength(1);
  });

  it("leaves the files and file exclusion rules alone when a terminal opens", () => {
    const files = panelReducer(EMPTY_PANEL_STATE, { type: "open", kind: "files" });
    const file = panelReducer(files, { type: "openFile", path: "src/a.ts" });
    const terminal = panelReducer(file, {
      type: "openTerminal",
      id: "terminal:2f1a3c4d-5b6e-4f70-8a9b-0c1d2e3f4a5b",
      title: "Terminal 1",
    });
    expect(terminal.surfaces.map((surface) => surface.kind)).toEqual([
      "file",
      "terminal",
    ]);
  });
```

- [ ] **Step 6: Run it to make sure it fails**

Run: `npx vitest run tests/right-panel.test.ts`
Expected: FAIL — `openTerminal` is not a known action type.

- [ ] **Step 7: Implement the surface model**

In `src/shared/right-panel.ts`:

```ts
export type RightPanelKind = "changes" | "files" | "plan" | "file" | "terminal";
```

after `FileSurface`:

```ts
export type TerminalSurface = {
  id: `terminal:${string}`;
  kind: "terminal";
  title: string;
};

export type RightPanelSurface = SingletonSurface | FileSurface | TerminalSurface;
```

in `PanelAction` (after `openFile`):

```ts
  | { type: "openTerminal"; id: `terminal:${string}`; title: string }
```

and a reducer case, placed after the `openFile` case:

```ts
    case "openTerminal": {
      const surface: TerminalSurface = {
        id: action.id,
        kind: "terminal",
        title: action.title,
      };
      return {
        isOpen: true,
        activeSurfaceId: surface.id,
        surfaces: upsert(state.surfaces, surface),
      };
    }
```

- [ ] **Step 8: Run both suites and the typechecker**

Run: `npx vitest run tests/right-panel.test.ts tests/terminal.test.ts && npm run typecheck`
Expected: PASS, and typecheck must be clean — the widened union will surface
every place that switches on `RightPanelSurface` (Tasks 4 and 5 fix the ones in
the renderer; `persist.ts` and `RightPanelTabs.tsx` are two of them, so a
typecheck failure here is expected and is fixed in those tasks. If it is easier,
land Step 7 and Task 4's `persist.ts`/`RightPanelTabs.tsx` edits together and
typecheck at the end of Task 4).

- [ ] **Step 9: Commit**

```bash
git add src/shared/terminal.ts src/shared/right-panel.ts tests/terminal.test.ts tests/right-panel.test.ts
git commit -m "Add the shared terminal contract and terminal panel surfaces"
```

---

### Task 2: `TerminalManager`

**Files:**
- Create: `src/main/terminal-manager.ts`
- Create: `tests/terminal-manager.test.ts`
- Create: `tests/terminal-manager.integration.test.ts`

**Interfaces:**
- Consumes: everything from Task 1's `src/shared/terminal.ts`.
- Produces:
  - `type PtyLike = { pid: number; onData(cb: (data: string) => void): unknown; onExit(cb: (event: { exitCode: number; signal?: number }) => void): unknown; write(data: string): void; resize(cols: number, rows: number): void; kill(signal?: string): void }`
  - `type PtySpawnOptions = { file: string; args: string[]; cwd: string; env: Record<string, string>; cols: number; rows: number }`
  - `type PtySpawner = (options: PtySpawnOptions) => PtyLike | Promise<PtyLike>`
  - `defaultPtySpawner(options: PtySpawnOptions): Promise<PtyLike>` — the only
    place that imports `node-pty`, dynamically
  - `class TerminalManager` with
    `create({ sessionId, cwd, cols, rows }): Promise<TerminalCreateResult>`,
    `attach(id): TerminalAttachResult`, `write(id, data): void`,
    `resize(id, cols, rows): void`, `close(id): void`,
    `restart(id): Promise<void>`, `removeSession(sessionId): void`,
    `sweep(activeSessionIds: Iterable<string>): void`, `shutdown(): void`,
    `onEvent(listener: (event: TerminalEvent) => void): () => void`
  - Constructor deps: `{ spawnPty, shell?, env?, schedule?, createId? }`

- [ ] **Step 1: Write the failing manager test**

Create `tests/terminal-manager.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import {
  FLUSH_THRESHOLD_BYTES,
  SCROLLBACK_LIMIT_BYTES,
  type TerminalEvent,
} from "../src/shared/terminal.ts";
import {
  TerminalManager,
  type PtyLike,
  type PtySpawnOptions,
} from "../src/main/terminal-manager.ts";

class FakePty implements PtyLike {
  pid = 4242;
  written: string[] = [];
  sizes: Array<[number, number]> = [];
  kills = 0;
  private dataListeners: Array<(data: string) => void> = [];
  private exitListeners: Array<(event: { exitCode: number; signal?: number }) => void> = [];

  onData(listener: (data: string) => void): void {
    this.dataListeners.push(listener);
  }

  onExit(listener: (event: { exitCode: number; signal?: number }) => void): void {
    this.exitListeners.push(listener);
  }

  write(data: string): void {
    this.written.push(data);
  }

  resize(cols: number, rows: number): void {
    this.sizes.push([cols, rows]);
  }

  kill(): void {
    this.kills += 1;
  }

  emitData(data: string): void {
    for (const listener of this.dataListeners) listener(data);
  }

  emitExit(event: { exitCode: number; signal?: number }): void {
    for (const listener of this.exitListeners) listener(event);
  }
}

function setup() {
  const ptys: FakePty[] = [];
  const spawns: PtySpawnOptions[] = [];
  const scheduled: Array<() => void> = [];
  let seq = 0;
  const manager = new TerminalManager({
    spawnPty: (options) => {
      spawns.push(options);
      const pty = new FakePty();
      ptys.push(pty);
      return pty;
    },
    shell: () => "/bin/zsh",
    env: () => ({ PATH: "/usr/bin" }),
    schedule: (callback) => {
      scheduled.push(callback);
    },
    createId: () => `terminal:00000000-0000-4000-8000-00000000000${seq++}`,
  });
  const events: TerminalEvent[] = [];
  manager.onEvent((event) => events.push(event));
  const flushScheduled = () => {
    while (scheduled.length > 0) scheduled.shift()!();
  };
  return { manager, ptys, spawns, events, flushScheduled };
}

const SESSION = "s1";
const CWD = "/tmp/project";

describe("TerminalManager create", () => {
  it("mints a uuid id, titles by per-session ordinal, and spawns a login shell in the session cwd", async () => {
    const { manager, spawns } = setup();
    const first = await manager.create({ sessionId: SESSION, cwd: CWD, cols: 120, rows: 30 });
    const second = await manager.create({ sessionId: SESSION, cwd: CWD, cols: 80, rows: 24 });
    expect(first.terminalId).not.toBe(second.terminalId);
    expect(first.title).toBe("Terminal 1");
    expect(second.title).toBe("Terminal 2");
    expect(spawns[0]).toEqual({
      file: "/bin/zsh",
      args: ["-l"],
      cwd: CWD,
      env: { PATH: "/usr/bin" },
      cols: 120,
      rows: 30,
    });
  });

  it("clamps the initial size", async () => {
    const { manager, spawns } = setup();
    await manager.create({ sessionId: SESSION, cwd: CWD, cols: 0, rows: 1e9 });
    expect(spawns[0]!.cols).toBe(1);
    expect(spawns[0]!.rows).toBe(1000);
  });

  it("titles independently per session", async () => {
    const { manager } = setup();
    await manager.create({ sessionId: SESSION, cwd: CWD, cols: 80, rows: 24 });
    const other = await manager.create({ sessionId: "s2", cwd: CWD, cols: 80, rows: 24 });
    expect(other.title).toBe("Terminal 1");
  });
});

describe("TerminalManager attach", () => {
  it("answers missing for an unknown or malformed id", () => {
    const { manager } = setup();
    expect(manager.attach("terminal:00000000-0000-4000-8000-0000000000ff")).toEqual({
      ok: false,
      reason: "missing",
    });
    expect(manager.attach("terminal:1")).toEqual({ ok: false, reason: "missing" });
  });

  it("replays the buffered output prefixed with the reset sequence", async () => {
    const { manager, ptys, events, flushScheduled } = setup();
    const { terminalId } = await manager.create({
      sessionId: SESSION,
      cwd: CWD,
      cols: 80,
      rows: 24,
    });
    expect(manager.attach(terminalId)).toMatchObject({ ok: true, data: "" });
    ptys[0]!.emitData("hello ");
    ptys[0]!.emitData("world");
    expect(events).toHaveLength(0);
    flushScheduled();
    expect(events).toEqual([
      { type: "terminalData", terminalId, data: "hello world" },
    ]);
    expect(manager.attach(terminalId)).toEqual({
      ok: true,
      data: `${"\x1b[0m\x1b[?25h"}hello world`,
      exited: false,
      exitCode: null,
      signal: null,
    });
  });
});

describe("TerminalManager coalescing and buffering", () => {
  it("coalesces a tick of writes into one event", async () => {
    const { manager, ptys, events, flushScheduled } = setup();
    const { terminalId } = await manager.create({
      sessionId: SESSION,
      cwd: CWD,
      cols: 80,
      rows: 24,
    });
    for (let index = 0; index < 50; index += 1) ptys[0]!.emitData("x");
    flushScheduled();
    expect(events).toEqual([
      { type: "terminalData", terminalId, data: "x".repeat(50) },
    ]);
  });

  it("flushes immediately past the threshold instead of waiting for the tick", async () => {
    const { manager, ptys, events } = setup();
    await manager.create({ sessionId: SESSION, cwd: CWD, cols: 80, rows: 24 });
    ptys[0]!.emitData("y".repeat(FLUSH_THRESHOLD_BYTES));
    expect(events).toHaveLength(1);
    expect((events[0] as { data: string }).data).toHaveLength(FLUSH_THRESHOLD_BYTES);
  });

  it("trims the buffer to whole chunks once it exceeds the cap", async () => {
    const { manager, ptys, flushScheduled } = setup();
    const { terminalId } = await manager.create({
      sessionId: SESSION,
      cwd: CWD,
      cols: 80,
      rows: 24,
    });
    const chunk = "z".repeat(Math.ceil(SCROLLBACK_LIMIT_BYTES / 2));
    for (let index = 0; index < 4; index += 1) {
      ptys[0]!.emitData(chunk);
      flushScheduled();
    }
    const replay = manager.attach(terminalId);
    expect(replay.ok).toBe(true);
    if (!replay.ok) return;
    const body = replay.data.slice("\x1b[0m\x1b[?25h".length);
    expect(body.length).toBeLessThanOrEqual(SCROLLBACK_LIMIT_BYTES);
    expect(body.length).toBe(chunk.length * 2);
  });

  it("keeps buffering while the renderer is detached", async () => {
    const { manager, ptys, flushScheduled } = setup();
    const { terminalId } = await manager.create({
      sessionId: SESSION,
      cwd: CWD,
      cols: 80,
      rows: 24,
    });
    ptys[0]!.emitData("before-unmount");
    flushScheduled();
    ptys[0]!.emitData("while-unmounted");
    flushScheduled();
    const replay = manager.attach(terminalId);
    expect(replay).toMatchObject({ ok: true, data: expect.stringContaining("while-unmounted") });
  });
});

describe("TerminalManager lifecycle", () => {
  it("reports an exit and stops accepting writes", async () => {
    const { manager, ptys, events } = setup();
    const { terminalId } = await manager.create({
      sessionId: SESSION,
      cwd: CWD,
      cols: 80,
      rows: 24,
    });
    ptys[0]!.emitExit({ exitCode: 3 });
    expect(events).toContainEqual({
      type: "terminalExit",
      terminalId,
      exitCode: 3,
      signal: null,
    });
    expect(manager.attach(terminalId)).toMatchObject({ ok: true, exited: true, exitCode: 3 });
    manager.write(terminalId, "echo hi");
    expect(ptys[0]!.written).toEqual([]);
  });

  it("closes a terminal, kills the pty and stays idempotent", async () => {
    const { manager, ptys } = setup();
    const { terminalId } = await manager.create({
      sessionId: SESSION,
      cwd: CWD,
      cols: 80,
      rows: 24,
    });
    manager.close(terminalId);
    expect(ptys[0]!.kills).toBe(1);
    expect(manager.attach(terminalId)).toEqual({ ok: false, reason: "missing" });
    manager.close(terminalId);
    expect(ptys[0]!.kills).toBe(1);
  });

  it("stays a no-op after the pty already exited", async () => {
    const { manager, ptys } = setup();
    const { terminalId } = await manager.create({
      sessionId: SESSION,
      cwd: CWD,
      cols: 80,
      rows: 24,
    });
    ptys[0]!.emitExit({ exitCode: 0 });
    manager.close(terminalId);
    expect(ptys[0]!.kills).toBe(0);
  });

  it("does not report an exit for a terminal it killed itself", async () => {
    const { manager, ptys, events } = setup();
    const { terminalId } = await manager.create({
      sessionId: SESSION,
      cwd: CWD,
      cols: 80,
      rows: 24,
    });
    manager.close(terminalId);
    ptys[0]!.emitExit({ exitCode: 0 });
    expect(events.filter((event) => event.type === "terminalExit")).toEqual([]);
  });

  it("resizes with clamped numbers", async () => {
    const { manager, ptys } = setup();
    const { terminalId } = await manager.create({
      sessionId: SESSION,
      cwd: CWD,
      cols: 80,
      rows: 24,
    });
    manager.resize(terminalId, 0, 1e9);
    expect(ptys[0]!.sizes).toEqual([[1, 1000]]);
  });

  it("restarts under the same id with a cleared buffer and a reset event", async () => {
    const { manager, ptys, events, flushScheduled } = setup();
    const { terminalId } = await manager.create({
      sessionId: SESSION,
      cwd: CWD,
      cols: 80,
      rows: 24,
    });
    ptys[0]!.emitData("old output");
    flushScheduled();
    await manager.restart(terminalId);
    expect(ptys).toHaveLength(2);
    expect(ptys[0]!.kills).toBe(1);
    expect(events).toContainEqual({ type: "terminalReset", terminalId });
    expect(manager.attach(terminalId)).toEqual({
      ok: true,
      data: "",
      exited: false,
      exitCode: null,
      signal: null,
    });
  });

  it("keeps the title and the ordinal across a restart", async () => {
    const { manager } = setup();
    const created = await manager.create({
      sessionId: SESSION,
      cwd: CWD,
      cols: 80,
      rows: 24,
    });
    await manager.restart(created.terminalId);
    const next = await manager.create({
      sessionId: SESSION,
      cwd: CWD,
      cols: 80,
      rows: 24,
    });
    expect(next.title).toBe("Terminal 2");
  });

  it("sweeps terminals whose session is gone and keeps the rest", async () => {
    const { manager, ptys } = setup();
    await manager.create({ sessionId: SESSION, cwd: CWD, cols: 80, rows: 24 });
    const kept = await manager.create({ sessionId: "s2", cwd: CWD, cols: 80, rows: 24 });
    manager.sweep(["s2"]);
    expect(ptys[0]!.kills).toBe(1);
    expect(manager.attach(kept.terminalId)).toMatchObject({ ok: true });
  });

  it("removes every terminal of one session", async () => {
    const { manager, ptys } = setup();
    const one = await manager.create({ sessionId: SESSION, cwd: CWD, cols: 80, rows: 24 });
    const two = await manager.create({ sessionId: SESSION, cwd: CWD, cols: 80, rows: 24 });
    manager.removeSession(SESSION);
    expect(manager.attach(one.terminalId)).toEqual({ ok: false, reason: "missing" });
    expect(manager.attach(two.terminalId)).toEqual({ ok: false, reason: "missing" });
    expect(ptys.every((pty) => pty.kills === 1)).toBe(true);
  });

  it("shuts everything down and unsubscribes listeners", async () => {
    const { manager, ptys } = setup();
    await manager.create({ sessionId: SESSION, cwd: CWD, cols: 80, rows: 24 });
    const listener = vi.fn();
    const unsubscribe = manager.onEvent(listener);
    unsubscribe();
    manager.shutdown();
    expect(ptys[0]!.kills).toBe(1);
    expect(listener).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run tests/terminal-manager.test.ts`
Expected: FAIL — cannot resolve `../src/main/terminal-manager.ts`.

- [ ] **Step 3: Implement `src/main/terminal-manager.ts`**

```ts
import { randomUUID } from "node:crypto";
import {
  FLUSH_THRESHOLD_BYTES,
  REPLAY_PREFIX,
  SCROLLBACK_LIMIT_BYTES,
  clampCols,
  clampRows,
  type TerminalAttachResult,
  type TerminalCreateResult,
  type TerminalEvent,
} from "../shared/terminal.ts";

export type PtyLike = {
  pid: number;
  onData(listener: (data: string) => void): unknown;
  onExit(listener: (event: { exitCode: number; signal?: number }) => void): unknown;
  write(data: string): void;
  resize(cols: number, rows: number): void;
  kill(signal?: string): void;
};

export type PtySpawnOptions = {
  file: string;
  args: string[];
  cwd: string;
  env: Record<string, string>;
  cols: number;
  rows: number;
};

export type PtySpawner = (options: PtySpawnOptions) => PtyLike | Promise<PtyLike>;

export type TerminalManagerDeps = {
  spawnPty: PtySpawner;
  shell?: () => string;
  env?: () => Record<string, string>;
  schedule?: (callback: () => void) => void;
  createId?: () => string;
};

type Entry = {
  terminalId: string;
  sessionId: string;
  title: string;
  cwd: string;
  cols: number;
  rows: number;
  pty: PtyLike;
  chunks: Array<{ data: string; size: number }>;
  bytes: number;
  pending: string;
  scheduled: boolean;
  disposed: boolean;
  exited: boolean;
  exitCode: number | null;
  signal: number | null;
};

function processEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === "string") env[key] = value;
  }
  return env;
}

export async function defaultPtySpawner(options: PtySpawnOptions): Promise<PtyLike> {
  const nodePty = await import("node-pty");
  return nodePty.spawn(options.file, options.args, {
    name: "xterm-256color",
    cwd: options.cwd,
    env: options.env,
    cols: options.cols,
    rows: options.rows,
  });
}

export class TerminalManager {
  private readonly entries = new Map<string, Entry>();
  private readonly ordinals = new Map<string, number>();
  private readonly listeners = new Set<(event: TerminalEvent) => void>();
  private readonly spawnPty: PtySpawner;
  private readonly resolveShell: () => string;
  private readonly resolveEnv: () => Record<string, string>;
  private readonly schedule: (callback: () => void) => void;
  private readonly createId: () => string;

  constructor(deps: TerminalManagerDeps) {
    this.spawnPty = deps.spawnPty;
    this.resolveShell = deps.shell ?? (() => "/bin/zsh");
    this.resolveEnv = deps.env ?? processEnv;
    this.schedule = deps.schedule ?? ((callback) => void setImmediate(callback));
    this.createId = deps.createId ?? (() => `terminal:${randomUUID()}`);
  }

  onEvent(listener: (event: TerminalEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async create(input: {
    sessionId: string;
    cwd: string;
    cols: unknown;
    rows: unknown;
  }): Promise<TerminalCreateResult> {
    const terminalId = this.createId();
    const ordinal = (this.ordinals.get(input.sessionId) ?? 0) + 1;
    this.ordinals.set(input.sessionId, ordinal);
    const entry = await this.spawnEntry({
      terminalId,
      sessionId: input.sessionId,
      title: `Terminal ${ordinal}`,
      cwd: input.cwd,
      cols: clampCols(input.cols),
      rows: clampRows(input.rows),
    });
    this.entries.set(terminalId, entry);
    return { terminalId, title: entry.title };
  }

  attach(terminalId: string): TerminalAttachResult {
    const entry = this.entries.get(terminalId);
    if (!entry) return { ok: false, reason: "missing" };
    return {
      ok: true,
      data: entry.chunks.length ? REPLAY_PREFIX + entry.chunks.map((c) => c.data).join("") : "",
      exited: entry.exited,
      exitCode: entry.exitCode,
      signal: entry.signal,
    };
  }

  write(terminalId: string, data: string): void {
    const entry = this.entries.get(terminalId);
    if (!entry || entry.exited || !data) return;
    entry.pty.write(data);
  }

  resize(terminalId: string, cols: unknown, rows: unknown): void {
    const entry = this.entries.get(terminalId);
    if (!entry || entry.disposed) return;
    entry.cols = clampCols(cols);
    entry.rows = clampRows(rows);
    entry.pty.resize(entry.cols, entry.rows);
  }

  close(terminalId: string): void {
    const entry = this.entries.get(terminalId);
    if (!entry) return;
    this.entries.delete(terminalId);
    this.dispose(entry);
  }

  async restart(terminalId: string): Promise<void> {
    const entry = this.entries.get(terminalId);
    if (!entry) return;
    this.dispose(entry);
    const replacement = await this.spawnEntry({
      terminalId: entry.terminalId,
      sessionId: entry.sessionId,
      title: entry.title,
      cwd: entry.cwd,
      cols: entry.cols,
      rows: entry.rows,
    });
    this.entries.set(terminalId, replacement);
    this.emit({ type: "terminalReset", terminalId });
  }

  removeSession(sessionId: string): void {
    for (const [terminalId, entry] of [...this.entries]) {
      if (entry.sessionId !== sessionId) continue;
      this.entries.delete(terminalId);
      this.dispose(entry);
    }
    this.ordinals.delete(sessionId);
  }

  sweep(activeSessionIds: Iterable<string>): void {
    const active = new Set(activeSessionIds);
    for (const [terminalId, entry] of [...this.entries]) {
      if (active.has(entry.sessionId)) continue;
      this.entries.delete(terminalId);
      this.dispose(entry);
    }
  }

  shutdown(): void {
    for (const terminalId of [...this.entries.keys()]) this.close(terminalId);
  }

  private async spawnEntry(base: {
    terminalId: string;
    sessionId: string;
    title: string;
    cwd: string;
    cols: number;
    rows: number;
  }): Promise<Entry> {
    const pty = await this.spawnPty({
      file: this.resolveShell(),
      args: ["-l"],
      cwd: base.cwd,
      env: this.resolveEnv(),
      cols: base.cols,
      rows: base.rows,
    });
    const entry: Entry = {
      ...base,
      pty,
      chunks: [],
      bytes: 0,
      pending: "",
      scheduled: false,
      disposed: false,
      exited: false,
      exitCode: null,
      signal: null,
    };
    pty.onData((data) => this.push(entry, data));
    pty.onExit((event) => this.handleExit(entry, event));
    return entry;
  }

  private push(entry: Entry, data: string): void {
    if (!data || entry.disposed || entry.exited) return;
    entry.pending += data;
    if (entry.pending.length >= FLUSH_THRESHOLD_BYTES) {
      this.flush(entry);
      return;
    }
    if (entry.scheduled) return;
    entry.scheduled = true;
    this.schedule(() => this.flush(entry));
  }

  private flush(entry: Entry): void {
    entry.scheduled = false;
    const data = entry.pending;
    if (!data) return;
    entry.pending = "";
    this.append(entry, data);
    this.emit({ type: "terminalData", terminalId: entry.terminalId, data });
  }

  private append(entry: Entry, data: string): void {
    const size = Buffer.byteLength(data, "utf8");
    entry.chunks.push({ data, size });
    entry.bytes += size;
    while (entry.bytes > SCROLLBACK_LIMIT_BYTES && entry.chunks.length > 1) {
      const removed = entry.chunks.shift();
      if (!removed) break;
      entry.bytes -= removed.size;
    }
  }

  private handleExit(entry: Entry, event: { exitCode: number; signal?: number }): void {
    if (entry.disposed) return;
    entry.exited = true;
    entry.exitCode = Number.isFinite(event.exitCode) ? Math.floor(event.exitCode) : null;
    entry.signal = typeof event.signal === "number" ? event.signal : null;
    this.flush(entry);
    this.emit({
      type: "terminalExit",
      terminalId: entry.terminalId,
      exitCode: entry.exitCode,
      signal: entry.signal,
    });
  }

  private dispose(entry: Entry): void {
    entry.disposed = true;
    if (entry.exited) return;
    entry.exited = true;
    try {
      entry.pty.kill();
    } catch {
      return;
    }
  }

  private emit(event: TerminalEvent): void {
    for (const listener of this.listeners) listener(event);
  }
}
```

- [ ] **Step 4: Run it to make sure it passes**

Run: `npx vitest run tests/terminal-manager.test.ts`
Expected: PASS (18 tests).

- [ ] **Step 5: Add the real-PTY integration test, skipped when the ABI does not match**

Create `tests/terminal-manager.integration.test.ts`:

```ts
import { afterEach, describe, expect, it } from "vitest";
import { TerminalManager, defaultPtySpawner } from "../src/main/terminal-manager.ts";

async function ptyLoadable(): Promise<boolean> {
  try {
    await import("node-pty");
    return true;
  } catch {
    return false;
  }
}

const available = await ptyLoadable();
const managers: TerminalManager[] = [];

afterEach(() => {
  for (const manager of managers.splice(0)) manager.shutdown();
});

describe.skipIf(!available)("TerminalManager with a real pty", () => {
  it("runs a command and replays its output", async () => {
    const manager = new TerminalManager({ spawnPty: defaultPtySpawner });
    managers.push(manager);
    const { terminalId } = await manager.create({
      sessionId: "s1",
      cwd: process.cwd(),
      cols: 80,
      rows: 24,
    });
    manager.write(terminalId, "printf '__REAL_PTY__\\n'\r");
    const started = Date.now();
    let replay = manager.attach(terminalId);
    while (started + 8000 > Date.now()) {
      replay = manager.attach(terminalId);
      if (replay.ok && replay.data.includes("__REAL_PTY__")) break;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    expect(replay.ok).toBe(true);
    expect(replay.ok && replay.data).toContain("__REAL_PTY__");
  });
});
```

Note in the file's own words (comment above `describe.skipIf`): postinstall builds
`node-pty` for the Electron ABI, so under Vitest's Node 24 the binary may not
load; the suite skips rather than fails, and the manual checklist covers this
for real.

- [ ] **Step 6: Run the whole suite**

Run: `npm test && npm run typecheck`
Expected: PASS. The integration test is skipped unless `node-pty` loads.

- [ ] **Step 7: Commit**

```bash
git add src/main/terminal-manager.ts tests/terminal-manager.test.ts tests/terminal-manager.integration.test.ts
git commit -m "Add the terminal manager with bounded replay and coalescing"
```

---

### Task 3: Main-process wiring, IPC handlers, preload bridge

**Files:**
- Modify: `src/main/index.ts` (imports, after `broadcast` ~line 223, `manager.onEvent` ~line 240, `relay:delete` ~line 372, after `relay:windowControl` ~line 575, `before-quit` ~line 627)
- Modify: `src/preload/index.ts:23-129`
- Modify: `src/renderer/env.d.ts:1-82`
- Modify: `tests/index.test.ts` (electron mock + a new test in the right-panel describe)

**Interfaces:**
- Consumes: `TerminalManager`, `defaultPtySpawner` (Task 2);
  `clampCols`, `clampRows`, `isTerminalId`, `TerminalAttachResult` (Task 1);
  `resolveShell` from `src/main/path-env.ts:29`.
- Produces: the six `relay:terminal*` invoke handlers and the
  `relay:terminalEvent` push channel; `window.relay.terminal` with
  `create(sessionId, cols, rows)`, `attach(terminalId)`, `write(terminalId, data)`,
  `resize(terminalId, cols, rows)`, `close(terminalId)`, `restart(terminalId)`,
  `onEvent(listener) => unsubscribe`.

- [ ] **Step 1: Write the failing handler test**

In `tests/index.test.ts`, extend the electron mock so broadcasts are observable.
Declare a fake PTY class directly above the `vi.hoisted` call, and add two
recorders to the hoisted object (the `windows: [] as unknown[]` field is already
there). The class is referenced from the hoisted initializer only in a type
position, so hoisting order is safe:

```ts
class FakePty {
  pid = 4242;
  written: string[] = [];
  sizes: Array<[number, number]> = [];
  kills = 0;
  private dataListeners: Array<(data: string) => void> = [];
  private exitListeners: Array<(event: { exitCode: number; signal?: number }) => void> = [];

  onData(listener: (data: string) => void): void {
    this.dataListeners.push(listener);
  }

  onExit(listener: (event: { exitCode: number; signal?: number }) => void): void {
    this.exitListeners.push(listener);
  }

  write(data: string): void {
    this.written.push(data);
  }

  resize(cols: number, rows: number): void {
    this.sizes.push([cols, rows]);
  }

  kill(): void {
    this.kills += 1;
  }

  emitData(data: string): void {
    for (const listener of this.dataListeners) listener(data);
  }

  emitExit(event: { exitCode: number; signal?: number }): void {
    for (const listener of this.exitListeners) listener(event);
  }
}
```

```ts
  broadcasts: [] as Array<{ channel: string; payload: unknown }>,
  ptys: [] as FakePty[],
```

Then change the mocked `webContents` in the `BrowserWindow` class (line 42) to:

```ts
    webContents = {
      send: (channel: string, payload: unknown) =>
        void h.broadcasts.push({ channel, payload }),
    };
```

Add `vi.mock` for the terminal manager next to the electron mock (top of file,
after `vi.mock("electron", ...)`). It replaces only the spawner, so the real
`TerminalManager` under test is the production class:

```ts
vi.mock("../src/main/terminal-manager.ts", async (importActual) => {
  const actual =
    await importActual<typeof import("../src/main/terminal-manager.ts")>();
  return {
    ...actual,
    defaultPtySpawner: async () => {
      const pty = new FakePty();
      h.ptys.push(pty);
      return pty;
    },
  };
});
```

Then add this test inside the existing `describe("main relay:getState", ...)`
block, after the "exposes the right panel handlers" test:

```ts
  it("exposes terminal handlers that replay, broadcast and sweep", async () => {
    h.userData = mkdtempSync(join(tmpdir(), "relay-index-"));
    h.ptys.length = 0;
    await import("../src/main/index.ts");
    await waitFor(() => h.handlers.get("relay:getState"));

    const attach = h.handlers.get("relay:terminalAttach")!;
    expect(attach({}, "terminal:not-a-uuid")).toEqual({ ok: false, reason: "missing" });
    expect(attach({}, "terminal:2f1a3c4d-5b6e-4f70-8a9b-0c1d2e3f4a5b")).toEqual({
      ok: false,
      reason: "missing",
    });

    const write = h.handlers.get("relay:terminalWrite")!;
    const resize = h.handlers.get("relay:terminalResize")!;
    const restart = h.handlers.get("relay:terminalRestart")!;
    const close = h.handlers.get("relay:terminalClose")!;
    expect(write({}, "terminal:1", "x")).toBeUndefined();
    expect(resize({}, "terminal:1", 10, 10)).toBeUndefined();
    expect(await restart({}, "terminal:1")).toBeUndefined();
    expect(close({}, "terminal:1")).toBeUndefined();

    const create = h.handlers.get("relay:terminalCreate")!;
    await expect(create({}, "no-such-session", 80, 24)).rejects.toThrow("Unknown session");

    const saveAgent = h.handlers.get("relay:saveAgent")!;
    const createSession = h.handlers.get("relay:create")!;
    saveAgent({}, {
      id: "fake",
      name: "Fake ACP",
      command: process.execPath,
      args: [agentPath],
      env: {},
    });
    const session = (await createSession({}, {
      agentId: "fake",
      cwd: process.cwd(),
      prompt: "hello",
    })) as Session;

    const created = (await create({}, session.id, 2000, 0)) as {
      terminalId: string;
      title: string;
    };
    expect(created.terminalId).toMatch(/^terminal:[0-9a-fA-F-]{36}$/);
    expect(created.title).toBe("Terminal 1");
    expect(h.ptys).toHaveLength(1);
    expect(h.ptys[0]!.kills).toBe(0);

    h.ptys[0]!.emitData("boot");
    await waitFor(() => (h.broadcasts.length > 0 ? true : undefined));
    expect(h.broadcasts).toContainEqual({
      channel: "relay:terminalEvent",
      payload: { type: "terminalData", terminalId: created.terminalId, data: "boot" },
    });

    expect(attach({}, created.terminalId)).toMatchObject({ ok: true, data: expect.stringContaining("boot") });

    write({}, created.terminalId, "ls\r");
    expect(h.ptys[0]!.written).toEqual(["ls\r"]);

    const remove = h.handlers.get("relay:delete")!;
    await remove({}, session.id);
    expect(h.ptys[0]!.kills).toBe(1);
    expect(attach({}, created.terminalId)).toEqual({ ok: false, reason: "missing" });
  });
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run tests/index.test.ts`
Expected: FAIL — the terminal handlers are not registered yet
(`waitFor`/`undefined` handler access).

- [ ] **Step 3: Wire the manager and the handlers into `src/main/index.ts`**

Add to the imports:

```ts
import { applyLoginPath, resolveShell } from "./path-env.ts";
import { TerminalManager, defaultPtySpawner } from "./terminal-manager.ts";
import { clampCols, clampRows, isTerminalId } from "../shared/terminal.ts";
```

Immediately after the `broadcast` helper (~line 223):

```ts
  const terminals = new TerminalManager({
    spawnPty: defaultPtySpawner,
    shell: () => resolveShell(process.env),
  });
  terminals.onEvent((event) => broadcast("relay:terminalEvent", event));
```

Inside `manager.onEvent`'s `sessions` branch (~line 242), after the status loop:

```ts
      terminals.sweep(event.sessions.map((session) => session.id));
```

In the `relay:delete` handler (~line 372):

```ts
  ipcMain.handle("relay:delete", async (_e, id: string) => {
    logger.info("delete", { sessionId: id });
    await manager.delete(id);
    terminals.removeSession(id);
  });
```

After the `relay:windowControl` handler (~line 575):

```ts
  ipcMain.handle(
    "relay:terminalCreate",
    async (_e, sessionId: unknown, cols: unknown, rows: unknown) => {
      if (typeof sessionId !== "string") throw new Error("Unknown session");
      const session = manager.get(sessionId);
      if (!session) throw new Error("Unknown session");
      return terminals.create({
        sessionId,
        cwd: session.workingDirectory,
        cols: clampCols(cols),
        rows: clampRows(rows),
      });
    },
  );

  ipcMain.handle("relay:terminalAttach", (_e, terminalId: unknown) =>
    isTerminalId(terminalId) ? terminals.attach(terminalId) : { ok: false, reason: "missing" },
  );

  ipcMain.handle("relay:terminalWrite", (_e, terminalId: unknown, data: unknown) => {
    if (!isTerminalId(terminalId) || typeof data !== "string") return;
    terminals.write(terminalId, data);
  });

  ipcMain.handle(
    "relay:terminalResize",
    (_e, terminalId: unknown, cols: unknown, rows: unknown) => {
      if (!isTerminalId(terminalId)) return;
      terminals.resize(terminalId, cols, rows);
    },
  );

  ipcMain.handle("relay:terminalClose", (_e, terminalId: unknown) => {
    if (isTerminalId(terminalId)) terminals.close(terminalId);
  });

  ipcMain.handle("relay:terminalRestart", async (_e, terminalId: unknown) => {
    if (isTerminalId(terminalId)) await terminals.restart(terminalId);
  });
```

In `before-quit` (~line 627), shutdown the PTYs before the agent sessions:

```ts
    shuttingDown = true;
    terminals.shutdown();
    store.flushNow();
    void manager.shutdown().finally(() => app.exit(0));
```

- [ ] **Step 4: Add the preload bridge and its type**

In `src/preload/index.ts`, add the import:

```ts
import type {
  TerminalAttachResult,
  TerminalCreateResult,
  TerminalEvent,
} from "../shared/terminal.ts";
```

and add this property to the `contextBridge.exposeInMainWorld("relay", { ... })`
object, just before `subscribe`:

```ts
  terminal: {
    create: (
      sessionId: string,
      cols: number,
      rows: number,
    ): Promise<TerminalCreateResult> =>
      ipcRenderer.invoke("relay:terminalCreate", sessionId, cols, rows),
    attach: (terminalId: string): Promise<TerminalAttachResult> =>
      ipcRenderer.invoke("relay:terminalAttach", terminalId),
    write: (terminalId: string, data: string): Promise<void> =>
      ipcRenderer.invoke("relay:terminalWrite", terminalId, data),
    resize: (terminalId: string, cols: number, rows: number): Promise<void> =>
      ipcRenderer.invoke("relay:terminalResize", terminalId, cols, rows),
    close: (terminalId: string): Promise<void> =>
      ipcRenderer.invoke("relay:terminalClose", terminalId),
    restart: (terminalId: string): Promise<void> =>
      ipcRenderer.invoke("relay:terminalRestart", terminalId),
    onEvent: (listener: (event: TerminalEvent) => void): (() => void) => {
      const handler = (_e: unknown, event: TerminalEvent) => listener(event);
      ipcRenderer.on("relay:terminalEvent", handler);
      return () => ipcRenderer.removeListener("relay:terminalEvent", handler);
    },
  },
```

In `src/renderer/env.d.ts`, add the same import and mirror the property on
`RelayBridge`:

```ts
  terminal: {
    create: (
      sessionId: string,
      cols: number,
      rows: number,
    ) => Promise<TerminalCreateResult>;
    attach: (terminalId: string) => Promise<TerminalAttachResult>;
    write: (terminalId: string, data: string) => Promise<void>;
    resize: (terminalId: string, cols: number, rows: number) => Promise<void>;
    close: (terminalId: string) => Promise<void>;
    restart: (terminalId: string) => Promise<void>;
    onEvent: (listener: (event: TerminalEvent) => void) => () => void;
  };
```

- [ ] **Step 5: Run the handler test, the suite and the typechecker**

Run: `npx vitest run tests/index.test.ts && npm test && npm run typecheck`
Expected: PASS. The full suite must stay green — in particular
`tests/index.test.ts` must not load `node-pty`, because the mock replaces
`defaultPtySpawner`.

- [ ] **Step 6: Commit**

```bash
git add src/main/index.ts src/preload/index.ts src/renderer/env.d.ts tests/index.test.ts
git commit -m "Expose the terminal manager over IPC"
```

---

### Task 4: Panel integration — tabs, launch, kill-on-remove, persistence

**Files:**
- Create: `src/renderer/right-panel/terminal-lifecycle.ts`
- Create: `src/renderer/right-panel/useTerminalLauncher.ts`
- Create: `tests/terminal-lifecycle.test.ts`
- Create: `tests/use-terminal-launcher.test.tsx`
- Modify: `src/renderer/icons.tsx:51,128`
- Modify: `src/renderer/right-panel/RightPanelTabs.tsx:25-44,46-51,194-206`
- Modify: `src/renderer/right-panel/RightPanel.tsx:12-25,139-177`
- Modify: `src/renderer/right-panel/persist.ts:33-48`
- Modify: `src/renderer/right-panel/usePanelStore.ts:59-114`
- Modify: `tests/right-panel-tabs.test.tsx`, `tests/right-panel-persist.test.ts`

**Interfaces:**
- Consumes: `TerminalSurface` and the `openTerminal` action (Task 1),
  `isTerminalId` (Task 1), `window.relay.terminal.*` (Task 3).
- Produces:
  - `closedTerminalIds(before, after): string[]`
  - `usePanelStore(sessionId, closeTerminal?)` — second parameter injectable for
    tests, default `(id) => void window.relay.terminal.close(id)`
  - `RightPanelTabs` prop `onNewTerminal: () => void`
  - `useTerminalLauncher(sessionId, dispatch): { launch, error }` — the only
    place that calls `window.relay.terminal.create`
  - `RightPanel` uses that hook, renders `<p className="panel-note">{error}</p>`
    when creation fails, and renders
    `<PanelTerminal terminalId onStartNew onCloseSelf />` where `onStartNew` is
    the hook's `launch` and `onCloseSelf` dispatches `close` for the stale
    surface

- [ ] **Step 1: Write the failing lifecycle-helper test**

Create `tests/terminal-lifecycle.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { panelReducer, EMPTY_PANEL_STATE } from "../src/shared/right-panel.ts";
import { closedTerminalIds } from "../src/renderer/right-panel/terminal-lifecycle.ts";

const A = "terminal:11111111-1111-4111-8111-111111111111";
const B = "terminal:22222222-2222-4222-8222-222222222222";

function stateWithTerminals() {
  let state = panelReducer(EMPTY_PANEL_STATE, { type: "open", kind: "changes" });
  state = panelReducer(state, { type: "openTerminal", id: A, title: "Terminal 1" });
  state = panelReducer(state, { type: "openTerminal", id: B, title: "Terminal 2" });
  return state;
}

describe("closedTerminalIds", () => {
  it("reports nothing when a terminal survives", () => {
    const state = stateWithTerminals();
    const after = panelReducer(state, { type: "close", id: "changes" });
    expect(closedTerminalIds(state.surfaces, after.surfaces)).toEqual([]);
  });

  it("reports a closed terminal, closeOthers and closeAll", () => {
    const state = stateWithTerminals();
    const one = panelReducer(state, { type: "close", id: A });
    expect(closedTerminalIds(state.surfaces, one.surfaces)).toEqual([A]);

    const others = panelReducer(state, { type: "closeOthers", id: A });
    expect(closedTerminalIds(state.surfaces, others.surfaces)).toEqual([B]);

    const all = panelReducer(state, { type: "closeAll" });
    expect(closedTerminalIds(state.surfaces, all.surfaces)).toEqual([A, B]);
  });

  it("reports every terminal when the session is removed", () => {
    const state = stateWithTerminals();
    const gone = panelReducer(state, { type: "removeSession" });
    expect(closedTerminalIds(state.surfaces, gone.surfaces)).toEqual([A, B]);
  });

  it("ignores non-terminal surfaces", () => {
    const state = stateWithTerminals();
    expect(closedTerminalIds(state.surfaces, [])).toEqual([A, B]);
    const files = panelReducer(EMPTY_PANEL_STATE, { type: "open", kind: "files" });
    expect(closedTerminalIds(files.surfaces, [])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run tests/terminal-lifecycle.test.ts`
Expected: FAIL — cannot resolve the module.

- [ ] **Step 3: Implement `src/renderer/right-panel/terminal-lifecycle.ts`**

```ts
import type { RightPanelSurface } from "../../shared/right-panel.ts";

export function closedTerminalIds(
  before: readonly RightPanelSurface[],
  after: readonly RightPanelSurface[],
): string[] {
  const closed: string[] = [];
  for (const surface of before) {
    if (surface.kind !== "terminal") continue;
    if (after.some((entry) => entry.id === surface.id)) continue;
    closed.push(surface.id);
  }
  return closed;
}
```

- [ ] **Step 4: Run it to make sure it passes**

Run: `npx vitest run tests/terminal-lifecycle.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing persistence test**

In `tests/right-panel-persist.test.ts`, replace the body of the
"keeps known surfaces and drops unknown ones" expectations by adding a sibling
test (leave that test alone — it still covers `kind: "bogus"`):

```ts
  it("keeps a well-formed terminal surface and drops malformed ones", () => {
    const panels = parsePanels(
      JSON.stringify({
        version: 1,
        bySession: {
          s1: {
            isOpen: true,
            activeSurfaceId: "terminal:2f1a3c4d-5b6e-4f70-8a9b-0c1d2e3f4a5b",
            surfaces: [
              {
                id: "terminal:2f1a3c4d-5b6e-4f70-8a9b-0c1d2e3f4a5b",
                kind: "terminal",
                title: "Terminal 1",
              },
              { id: "terminal:1", kind: "terminal", title: "counter id" },
              { id: "terminal:2f1a3c4d-5b6e-4f70-8a9b-0c1d2e3f4a5b", kind: "terminal" },
            ],
          },
        },
      }),
    );
    expect(panels.s1!.surfaces).toEqual([
      {
        id: "terminal:2f1a3c4d-5b6e-4f70-8a9b-0c1d2e3f4a5b",
        kind: "terminal",
        title: "Terminal 1",
      },
    ]);
  });
```

- [ ] **Step 6: Run it to make sure it fails**

Run: `npx vitest run tests/right-panel-persist.test.ts`
Expected: FAIL — the terminal surface is dropped.

- [ ] **Step 7: Implement the `persist.ts` branch**

In `src/renderer/right-panel/persist.ts`, import `isTerminalId`:

```ts
import { isTerminalId } from "../../shared/terminal.ts";
```

and insert this before `if (value.kind !== "file") return null;`:

```ts
  if (value.kind === "terminal") {
    if (!isTerminalId(value.id)) return null;
    const title = typeof value.title === "string" && value.title ? value.title : null;
    if (!title) return null;
    return { id: value.id, kind: "terminal", title };
  }
```

- [ ] **Step 8: Write the failing tabs test**

In `tests/right-panel-tabs.test.tsx`, update every existing `render(<RightPanelTabs ... />)`
to include `onNewTerminal={() => {}}` (the prop becomes required), then add:

```tsx
describe("terminal tabs", () => {
  const id = "terminal:2f1a3c4d-5b6e-4f70-8a9b-0c1d2e3f4a5b";

  it("titles a terminal tab from the surface title", () => {
    expect(surfaceTitle({ id, kind: "terminal", title: "Terminal 7" })).toBe("Terminal 7");
  });

  it("offers Terminal in the add menu and calls onNewTerminal instead of dispatching", () => {
    const dispatch = vi.fn();
    const onNewTerminal = vi.fn();
    render(
      <RightPanelTabs
        state={stateWith()}
        dispatch={dispatch}
        maximized={false}
        onMaximize={() => {}}
        onNewTerminal={onNewTerminal}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Add panel surface" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Terminal" }));
    expect(onNewTerminal).toHaveBeenCalledTimes(1);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("still dispatches the singleton kinds", () => {
    const dispatch = vi.fn();
    render(
      <RightPanelTabs
        state={stateWith()}
        dispatch={dispatch}
        maximized={false}
        onMaximize={() => {}}
        onNewTerminal={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Add panel surface" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Plan" }));
    expect(dispatch).toHaveBeenCalledWith({ type: "open", kind: "plan" });
  });
});
```

- [ ] **Step 9: Run it to make sure it fails**

Run: `npx vitest run tests/right-panel-tabs.test.tsx`
Expected: FAIL — `onNewTerminal` is not a prop, and there is no Terminal menu
item.

- [ ] **Step 10: Implement the tabs and the icon**

`src/renderer/icons.tsx`: `Terminal` is already imported (line 51). Add next to
`IconToolExecute`:

```ts
export const IconTerminal = icon(Terminal, { size: 14, strokeWidth: 1.75 });
```

`src/renderer/right-panel/RightPanelTabs.tsx`:

```ts
export function surfaceTitle(surface: RightPanelSurface): string {
  if (surface.kind === "changes") return "Changes";
  if (surface.kind === "files") return "Files";
  if (surface.kind === "plan") return "Plan";
  if (surface.kind === "terminal") return surface.title;
  const parts = surface.path.split("/");
  return parts[parts.length - 1] || surface.path;
}

function surfaceIcon(surface: RightPanelSurface): ReactNode {
  if (surface.kind === "changes") return <IconGitCompare />;
  if (surface.kind === "files") return <IconFiles />;
  if (surface.kind === "plan") return <IconListTodo />;
  if (surface.kind === "terminal") return <IconTerminal />;
  return <IconFiles />;
}

const ADD_ACTIONS: Array<{ kind: Exclude<RightPanelKind, "file">; label: string }> = [
  { kind: "changes", label: "Changes" },
  { kind: "files", label: "Files" },
  { kind: "plan", label: "Plan" },
  { kind: "terminal", label: "Terminal" },
];
```

add `IconTerminal` to the icon import list, import `RightPanelKind` from
`../../shared/right-panel.ts`, add `onNewTerminal: () => void;` to `Props`,
destructure it, and change the add-menu item handler to:

```tsx
                  onClick={() => {
                    setAddOpen(false);
                    if (action.kind === "terminal") {
                      onNewTerminal();
                      return;
                    }
                    dispatch({ type: "open", kind: action.kind });
                  }}
```

- [ ] **Step 11: Write the failing store test**

Create `tests/use-panel-store.test.tsx`:

```tsx
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
```

Note: the three dispatches happen in one click, so React batches them; each
`dispatch` reads the latest state through the store's ref, which is exactly the
behavior under test. Never move the `closeTerminal` calls inside the
`setPanels` updater — updaters may run twice under StrictMode, and closing is
only safe to attempt once per removal.

- [ ] **Step 12: Run it to make sure it fails**

Run: `npx vitest run tests/use-panel-store.test.tsx`
Expected: FAIL — `close` is never called (the store does not accept the second
parameter yet).

- [ ] **Step 13: Implement the store teardown**

In `src/renderer/right-panel/usePanelStore.ts`:

```ts
import { closedTerminalIds } from "./terminal-lifecycle.ts";

function defaultCloseTerminal(terminalId: string): void {
  try {
    void window.relay.terminal.close(terminalId);
  } catch {
    return;
  }
}
```

change the signature and keep a ref of the latest panels:

```ts
export function usePanelStore(
  sessionId: string | null,
  closeTerminal: (terminalId: string) => void = defaultCloseTerminal,
) {
  const [panels, setPanels] = useState(readPanelsSafe);
  const panelsRef = useRef(panels);
  panelsRef.current = panels;
```

and rewrite `dispatch` and `removeSession`:

```ts
  const dispatch = useCallback(
    (action: PanelAction) => {
      if (!sessionId) return;
      dirtyRef.current = true;
      const current = panelsRef.current[sessionId] ?? EMPTY_PANEL_STATE;
      const next = panelReducer(current, action);
      for (const id of closedTerminalIds(current.surfaces, next.surfaces)) {
        closeTerminal(id);
      }
      setPanels((prev) => {
        const from = prev[sessionId] ?? EMPTY_PANEL_STATE;
        const resolved = panelReducer(from, action);
        const bySession = { ...prev };
        if (resolved.surfaces.length === 0) delete bySession[sessionId];
        else bySession[sessionId] = resolved;
        return bySession;
      });
    },
    [sessionId, closeTerminal],
  );

  const removeSession = useCallback(
    (id: string) => {
      dirtyRef.current = true;
      for (const terminalId of closedTerminalIds(
        panelsRef.current[id]?.surfaces ?? [],
        [],
      )) {
        closeTerminal(terminalId);
      }
      setPanels((prev) => {
        if (!(id in prev)) return prev;
        const bySession = { ...prev };
        delete bySession[id];
        return bySession;
      });
      clearWidthSafe(id);
    },
    [closeTerminal],
  );
```

- [ ] **Step 14: Write the failing launcher test**

Create `tests/use-terminal-launcher.test.tsx`:

```tsx
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
```

- [ ] **Step 15: Run the launcher test to make sure it fails**

Run: `npx vitest run tests/use-terminal-launcher.test.tsx`
Expected: FAIL — cannot resolve `useTerminalLauncher.ts`.

- [ ] **Step 16: Implement `src/renderer/right-panel/useTerminalLauncher.ts`**

```ts
import { useCallback, useState } from "react";
import type { PanelAction } from "../../shared/right-panel.ts";
import { DEFAULT_COLS, DEFAULT_ROWS } from "../../shared/terminal.ts";

export function useTerminalLauncher(
  sessionId: string,
  dispatch: (action: PanelAction) => void,
) {
  const [error, setError] = useState<string | null>(null);

  const launch = useCallback(async () => {
    try {
      const created = await window.relay.terminal.create(
        sessionId,
        DEFAULT_COLS,
        DEFAULT_ROWS,
      );
      setError(null);
      dispatch({
        type: "openTerminal",
        id: created.terminalId,
        title: created.title,
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }, [sessionId, dispatch]);

  return { launch, error };
}
```

- [ ] **Step 17: Run it to make sure it passes, then wire `RightPanel`**

Run: `npx vitest run tests/use-terminal-launcher.test.tsx`
Expected: PASS.

`src/renderer/right-panel/RightPanel.tsx` — add to the imports:

```ts
import { useTerminalLauncher } from "./useTerminalLauncher.ts";
import { PanelTerminal } from "./PanelTerminal.tsx";
```

add to `Props`:

```ts
  onNewTerminal?: () => void;
```

(optional so the existing component tests keep compiling), destructure it as
`onNewTerminal: onNewTerminalProp`, and inside the component, before the early
`if (!state.isOpen) return null;`:

```ts
  const launcher = useTerminalLauncher(sessionId, dispatch);
  const onNewTerminal = onNewTerminalProp ?? launcher.launch;
```

Then pass `onNewTerminal={onNewTerminal}` to `RightPanelTabs`, render the error
above the body:

```tsx
        {launcher.error ? <p className="panel-note">{launcher.error}</p> : null}
```

and add the terminal branch to the body:

```tsx
          {active?.kind === "terminal" ? (
            <PanelTerminal
              terminalId={active.id}
              onStartNew={onNewTerminal}
              onCloseSelf={() => dispatch({ type: "close", id: active.id })}
            />
          ) : null}
```

- [ ] **Step 18: Add the panel layout styles**

Append to `src/renderer/styles.css` (near `.right-panel-body`, line 4582):

```css
.panel-terminal {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.panel-terminal-host {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  padding: 4px 6px 0 8px;
}

.panel-terminal-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 8px;
  border-top: 1px solid var(--line);
}
```

- [ ] **Step 19: Create a placeholder `PanelTerminal` so this task compiles**

Task 5 replaces it; this keeps every task's tests runnable on their own.

Create `src/renderer/right-panel/PanelTerminal.tsx`:

```tsx
type Props = {
  terminalId: string;
  onStartNew: () => void;
  onCloseSelf: () => void;
};

export function PanelTerminal({ terminalId, onStartNew, onCloseSelf }: Props) {
  void onStartNew;
  void onCloseSelf;
  return <div className="panel-terminal" data-terminal-id={terminalId} />;
}
```

- [ ] **Step 20: Run the task's tests, the suite and the typechecker**

Run: `npx vitest run tests/terminal-lifecycle.test.ts tests/use-terminal-launcher.test.tsx tests/right-panel-persist.test.ts tests/right-panel-tabs.test.tsx tests/use-panel-store.test.tsx && npm test && npm run typecheck`
Expected: PASS. The typechecker is the real check here: it forces the widened
surface union through `surfaceTitle`, `surfaceIcon`, `validateSurface` and the
`RightPanel` body.

- [ ] **Step 21: Commit**

```bash
git add src/renderer src/shared tests/right-panel-persist.test.ts tests/right-panel-tabs.test.tsx tests/terminal-lifecycle.test.ts tests/use-panel-store.test.tsx tests/use-terminal-launcher.test.tsx
git commit -m "Add terminal tabs, launch and pty teardown to the right panel"
```

---

### Task 5: `PanelTerminal` — xterm, theme, keys, exit and missing states

**Files:**
- Create: `src/renderer/right-panel/terminal-theme.ts`
- Create: `tests/terminal-theme.test.ts`
- Replace: `src/renderer/right-panel/PanelTerminal.tsx`
- Create: `tests/panel-terminal.test.tsx`

**Interfaces:**
- Consumes: `window.relay.terminal.*` (Task 3), `TerminalEvent` (Task 1),
  `RightPanel`'s `{ terminalId, onStartNew, onCloseSelf }` props (Task 4).
- Produces:
  - `type StyleReader = (name: string) => string`
  - `terminalTheme(read: StyleReader): ITheme`
  - `terminalFontSize(read: StyleReader): number`
  - `PanelTerminal` handling: attach + replay, id-filtered events, debounced
    fit, `data-theme` following, exit footer with Restart, and the missing
    notice with Start-a-new-terminal

- [ ] **Step 1: Write the failing theme test**

Create `tests/terminal-theme.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { terminalFontSize, terminalTheme } from "../src/renderer/right-panel/terminal-theme.ts";

const styles: Record<string, string> = {
  "--editor": "oklch(0.26 0 0)",
  "--base": "oklch(0.96 0 0)",
  "--danger": "oklch(0.72 0.196 14.313)",
  "--ok": "oklch(0.72 0.116 156.327)",
  "--mono": "Menlo, monospace",
  "--font-size": "13px",
};

const read = (name: string) => styles[name] ?? "";

describe("terminalTheme", () => {
  it("takes the surface, text, danger and ok colours from the app tokens", () => {
    const theme = terminalTheme(read);
    expect(theme.background).toBe(styles["--editor"]);
    expect(theme.foreground).toBe(styles["--base"]);
    expect(theme.cursor).toBe(styles["--base"]);
    expect(theme.red).toBe(styles["--danger"]);
    expect(theme.green).toBe(styles["--ok"]);
  });

  it("always returns a full ansi palette", () => {
    const theme = terminalTheme(read);
    for (const key of ["black", "blue", "cyan", "magenta", "white", "brightWhite"]) {
      expect(typeof theme[key as keyof typeof theme]).toBe("string");
    }
  });

  it("falls back when a token is missing", () => {
    const theme = terminalTheme(() => "");
    expect(theme.background).toBeTruthy();
    expect(theme.foreground).toBeTruthy();
    expect(theme.selectionBackground).toBeTruthy();
  });
});

describe("terminalFontSize", () => {
  it("reads the app font size", () => {
    expect(terminalFontSize(read)).toBe(13);
  });

  it("falls back for junk", () => {
    expect(terminalFontSize(() => "")).toBe(13);
    expect(terminalFontSize(() => "0")).toBe(13);
    expect(terminalFontSize(() => "400")).toBe(13);
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run tests/terminal-theme.test.ts`
Expected: FAIL — cannot resolve the module.

- [ ] **Step 3: Implement `src/renderer/right-panel/terminal-theme.ts`**

```ts
import type { ITheme } from "@xterm/xterm";

export type StyleReader = (name: string) => string;

const FALLBACK_BACKGROUND = "#1f1f1f";
const FALLBACK_FOREGROUND = "#e6e6e6";
const FALLBACK_SELECTION = "#7f7f7f59";
const FALLBACK_DANGER = "#f14c4c";
const FALLBACK_OK = "#89d185";
const FALLBACK_FONT_SIZE = 13;

const ANSI = {
  black: "#1f1f1f",
  red: "#f14c4c",
  green: "#89d185",
  yellow: "#d7ba7d",
  blue: "#569cd6",
  magenta: "#c586c0",
  cyan: "#4ec9b0",
  white: "#e6e6e6",
  brightBlack: "#6b6b6b",
  brightRed: "#f97b7b",
  brightGreen: "#b5e8b0",
  brightYellow: "#e9d8a0",
  brightBlue: "#9cdcfe",
  brightMagenta: "#d7a9e3",
  brightCyan: "#9fe8dc",
  brightWhite: "#ffffff",
} as const;

export function terminalTheme(read: StyleReader): ITheme {
  const background = read("--editor") || FALLBACK_BACKGROUND;
  const foreground = read("--base") || FALLBACK_FOREGROUND;
  const danger = read("--danger") || FALLBACK_DANGER;
  const ok = read("--ok") || FALLBACK_OK;
  return {
    ...ANSI,
    background,
    foreground,
    cursor: foreground,
    cursorAccent: background,
    selectionBackground: FALLBACK_SELECTION,
    red: danger,
    brightRed: danger,
    green: ok,
    brightGreen: ok,
  };
}

export function terminalFontSize(read: StyleReader): number {
  const size = Number.parseInt(read("--font-size"), 10);
  if (!Number.isFinite(size) || size < 8 || size > 32) return FALLBACK_FONT_SIZE;
  return size;
}
```

Note: `--base` is read instead of `--text`, and the selection tint is a fixed
translucent grey instead of `--muted`, because both of those tokens are `var()`
/ `color-mix()` expressions whose computed values are not usable colour strings.
This is the one deviation from the spec's token list and it is deliberate.

- [ ] **Step 4: Run it to make sure it passes**

Run: `npx vitest run tests/terminal-theme.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing component test**

Create `tests/panel-terminal.test.tsx`:

```tsx
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
```

- [ ] **Step 6: Run it to make sure it fails**

Run: `npx vitest run tests/panel-terminal.test.tsx`
Expected: FAIL — the placeholder renders no xterm wiring and no notice.

- [ ] **Step 7: Implement `src/renderer/right-panel/PanelTerminal.tsx`**

```tsx
import { useEffect, useRef, useState } from "react";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import { terminalFontSize, terminalTheme, type StyleReader } from "./terminal-theme.ts";

const SCROLLBACK_LINES = 5000;
const FIT_DEBOUNCE_MS = 100;

type ExitState = { exitCode: number | null; signal: number | null };

type Props = {
  terminalId: string;
  onStartNew: () => void;
  onCloseSelf: () => void;
};

const readStyle: StyleReader = (name) => {
  if (typeof window === "undefined" || typeof window.getComputedStyle !== "function") {
    return "";
  }
  return window.getComputedStyle(document.documentElement).getPropertyValue(name).trim();
};

function exitLabel(exit: ExitState): string {
  if (exit.signal !== null) return `[process exited with signal ${exit.signal}]`;
  return `[process exited with code ${exit.exitCode ?? 0}]`;
}

export function PanelTerminal({ terminalId, onStartNew, onCloseSelf }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [exit, setExit] = useState<ExitState | null>(null);
  const [missing, setMissing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || missing) return;

    const term = new Terminal({
      scrollback: SCROLLBACK_LINES,
      fontFamily: readStyle("--mono") || undefined,
      fontSize: terminalFontSize(readStyle),
      theme: terminalTheme(readStyle),
      cursorBlink: true,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(host);
    try {
      fit.fit();
    } catch {
      // The host has no layout yet; the ResizeObserver below will fit it.
    }
    term.focus();

    let disposed = false;
    let fitTimer: ReturnType<typeof setTimeout> | null = null;

    const unsubscribe = window.relay.terminal.onEvent((event) => {
      if (event.terminalId !== terminalId) return;
      if (event.type === "terminalData") {
        term.write(event.data);
        return;
      }
      if (event.type === "terminalExit") {
        term.write(`\r\n${exitLabel({ exitCode: event.exitCode, signal: event.signal })}\r\n`);
        setExit({ exitCode: event.exitCode, signal: event.signal });
        return;
      }
      setExit(null);
      term.reset();
    });

    const dataSubscription = term.onData((data) => {
      void window.relay.terminal.write(terminalId, data);
    });
    const resizeSubscription = term.onResize(({ cols, rows }) => {
      void window.relay.terminal.resize(terminalId, cols, rows);
    });

    // Ctrl-modified keys belong to the shell (Ctrl-C is SIGINT). ⌘-combos stay
    // with the app, except ⌘C/⌘V, which are xterm's selection and clipboard.
    term.attachCustomKeyEventHandler((event) => {
      if (!event.metaKey) return true;
      const key = event.key.toLowerCase();
      return key === "c" || key === "v";
    });

    const scheduleFit = () => {
      if (fitTimer !== null) clearTimeout(fitTimer);
      fitTimer = setTimeout(() => {
        fitTimer = null;
        if (disposed) return;
        try {
          fit.fit();
        } catch {
          return;
        }
      }, FIT_DEBOUNCE_MS);
    };

    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(scheduleFit);
      observer.observe(host);
    }

    let themeObserver: MutationObserver | null = null;
    if (typeof MutationObserver !== "undefined") {
      themeObserver = new MutationObserver(() => {
        term.options.theme = terminalTheme(readStyle);
      });
      themeObserver.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["data-theme"],
      });
    }

    void window.relay.terminal
      .attach(terminalId)
      .then((result) => {
        if (disposed) return;
        if (!result.ok) {
          setMissing(true);
          return;
        }
        if (result.data) term.write(result.data);
        if (result.exited) {
          setExit({ exitCode: result.exitCode, signal: result.signal });
        }
      })
      .catch((error: unknown) => {
        if (disposed) return;
        setNotice(error instanceof Error ? error.message : String(error));
      });

    return () => {
      disposed = true;
      if (fitTimer !== null) clearTimeout(fitTimer);
      unsubscribe();
      observer?.disconnect();
      themeObserver?.disconnect();
      dataSubscription.dispose();
      resizeSubscription.dispose();
      term.dispose();
    };
  }, [terminalId, missing]);

  if (missing) {
    return (
      <div className="panel-terminal">
        <p className="panel-note">
          This terminal is no longer running. It ended when Relay restarted.
        </p>
        <button
          type="button"
          className="btn"
          onClick={() => {
            onCloseSelf();
            onStartNew();
          }}
        >
          Start a new terminal
        </button>
      </div>
    );
  }

  return (
    <div className="panel-terminal">
      <div className="panel-terminal-host" ref={hostRef} />
      {notice ? <p className="panel-note">{notice}</p> : null}
      {exit ? (
        <div className="panel-terminal-footer">
          <span className="panel-note">{exitLabel(exit)}</span>
          <button
            type="button"
            className="btn"
            onClick={() => {
              setExit(null);
              void window.relay.terminal.restart(terminalId);
            }}
          >
            Restart
          </button>
        </div>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 8: Run the component test, the suite and the typechecker**

Run: `npx vitest run tests/panel-terminal.test.tsx && npm test && npm run typecheck && npm run build`
Expected: PASS. `npm run build` is the check that xterm and its CSS bundle
correctly into the renderer and that `node-pty` stays external to main.

- [ ] **Step 9: Commit**

```bash
git add src/renderer/right-panel/PanelTerminal.tsx src/renderer/right-panel/terminal-theme.ts tests/panel-terminal.test.tsx tests/terminal-theme.test.ts
git commit -m "Render terminals with xterm, theme and exit states"
```

---

### Task 6: Packaging metadata

**Files:**
- Modify: `package.json` (dependencies already installed in Task 0; verify)
- Modify: `electron-builder.yml:10-12`
- Modify: `tests/packaging.test.ts:69-73`

**Interfaces:**
- Consumes: Task 0's dependency install.
- Produces: a packaged app that rebuilds `node-pty` for Electron and unpacks it
  from asar.

- [ ] **Step 1: Write the failing packaging test**

Replace the "unpacks the sql.js wasm and skips native rebuilds" test in
`tests/packaging.test.ts` with:

```ts
  it("unpacks the native modules and rebuilds them for Electron", () => {
    const config = builderConfig();
    expect(config).toMatch(/asarUnpack:[\s\S]*?sql\.js/);
    expect(config).toMatch(/asarUnpack:[\s\S]*?node-pty/);
    expect(config).toMatch(/npmRebuild:\s*true/);
  });

  it("keeps the terminal runtime dependencies and the rebuild tool", () => {
    const pkg = packageJson();
    expect(pkg.dependencies?.["node-pty"]).toBeTruthy();
    expect(pkg.dependencies?.["@xterm/xterm"]).toBeTruthy();
    expect(pkg.dependencies?.["@xterm/addon-fit"]).toBeTruthy();
    expect(pkg.dependencies ?? {}).not.toHaveProperty("@electron/rebuild");
    expect(pkg.devDependencies?.["@electron/rebuild"]).toBeTruthy();
    expect(pkg.scripts.postinstall).toBe("electron-rebuild -f -w node-pty");
  });
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run tests/packaging.test.ts`
Expected: FAIL on `npmRebuild: true` (the file still says `false`) and on the
`node-pty` unpack entry.

- [ ] **Step 3: Update the builder config**

`electron-builder.yml`:

```yaml
asarUnpack:
  - "**/node_modules/sql.js/**"
  - "**/node_modules/node-pty/**"
npmRebuild: true
```

- [ ] **Step 4: Run it to make sure it passes**

Run: `npx vitest run tests/packaging.test.ts`
Expected: PASS.

- [ ] **Step 5: Prove the packaged layout still builds**

Run: `npm run build && npm run dist:dir`
Expected: `dist/` contains an unpacked Relay.app, and the packaged
`app.asar.unpacked` includes both `sql.js` and `node-pty`.

- [ ] **Step 6: Commit**

```bash
git add electron-builder.yml tests/packaging.test.ts package.json
git commit -m "Rebuild and unpack node-pty in the packaged app"
```

---

## Final verification (after the last task)

- [ ] `npm test` — full suite green.
- [ ] `npm run typecheck` — both tsconfigs clean.
- [ ] `npm run build` — main, preload and renderer bundle.
- [ ] `npm run dist:dir` — the packaged app still builds and unpacks both native
      modules.
- [ ] Manual checklist from the spec (macOS dev app, `npm run dev`): open from
      `+`; run a TUI (vim/htop); resize the panel; switch tab and back (replay);
      switch session and back (shell survived); reload with ⌘R (tabs restored,
      scrollback survived, `ps` shows the same shell PID); quit and relaunch
      (restored tab shows "no longer running", Start-a-new-terminal works);
      exit and Restart; close the tab and confirm with `ps` that the shell is
      gone; quit the app and confirm no orphans; toggle the app theme and confirm
      the terminal follows.
