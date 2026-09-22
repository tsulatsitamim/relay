# Terminal Surface — Design Spec (Spec 2 of 3)

Follows `2026-09-20-right-panel-design.md` (Spec 1), which deferred the
Terminal surface and named the intended dependencies (`node-pty` +
`@xterm/xterm`). Spec 3 is the Preview/browser surface.

## Goal

Let the user open one or more real interactive shells inside a session's right
panel, running in that session's working directory, so builds, tests, git, and
debugging can happen beside the agent instead of in a separate terminal app.

Success looks like: open a terminal from the panel's `+` menu, run a
full-screen TUI (vim, htop), resize the panel and watch the program reflow,
switch tabs or sessions and come back to find the same scrollback, reload the
renderer (⌘R) without losing the shell, exit and restart the shell, and close
the tab knowing the process is actually dead.

## Non-goals (explicitly deferred)

- **Agent-driven terminals.** ACP 0.14.1 defines client-side
  `terminal/create|output|wait_for_exit|kill|release` (behind
  `ClientCapabilities.terminal`). Relay still advertises `clientCapabilities: {}`
  and implements none of them. Not in this spec; a natural follow-up that could
  reuse this PTY manager.
- **Restoring a terminal's *process* across app restarts.** A PTY cannot be
  restored. Terminal surfaces *are* persisted so the tab survives a renderer
  reload, but after an app restart the restored tab has no process behind it:
  it renders a "no longer running" notice with a Start-new-terminal action
  rather than pretending to be live.
- **cwd syncing.** New terminals start in the session cwd; existing terminals
  keep their own cwd.
- **Split panes, tabs-inside-tabs, search-in-scrollback, terminal profiles,
  per-terminal env overrides.**
- **"Open Terminal Here" from the Files explorer**, palette entries, and
  toolbar buttons. The `+` menu is the only entry point in this spec.

## Global constraints

- **Spec 1's "no new runtime dependencies" is superseded here.** This spec adds
  `node-pty`, `@xterm/xterm`, and `@xterm/addon-fit` as runtime dependencies.
- TDD for every unit of production logic. Vitest; `npm test`,
  `npm run typecheck`, `npm run build` must stay green.
- All IPC input is validated in the main process.
- `node-pty` is a native module: it must be built for the Electron ABI, not the
  local Node ABI, and unpacked from asar.

## Decisions from brainstorming

- **Purpose:** a user shell in the panel (not an agent-command viewer, not both).
- **Fidelity:** full real PTY — interactive programs, colors, signals, and
  resize behave normally. The native dependency is accepted.
- **Cardinality:** multiple terminals per session, each its own tab.
- **Lifecycle:** a shell dies when its tab closes or the app quits. Tabs
  survive a renderer reload and re-attach to the running shell; after an app
  restart a restored tab reports that its terminal is gone.
- **Entry point:** the panel's `+` menu only.
- **Architecture:** main-owned PTY manager with a bounded scrollback replay;
  the renderer view mounts/unmounts per active tab and re-attaches from the
  buffer.

## 1. Surface model

A terminal is an *instance* surface, like `file:` — not a singleton.

```ts
export type TerminalSurface = {
  id: `terminal:${string}`;
  kind: "terminal";
  title: string;
};
```

- **Identity is owned by main and is a UUID.** The renderer asks main to create
  a PTY; main mints `terminal:<uuid>` and returns `{ terminalId, title }`. The
  id is the PTY's key in main and the surface id in the reducer, so there is no
  second identifier to keep in sync and the reducer stays pure. A UUID — not a
  counter ordinal — is required because surfaces are persisted: a restored
  `terminal:2` must never be claimed by a different, freshly allocated PTY.
- **Title** is a per-session ordinal computed by main at creation
  (`"Terminal 1"`, `"Terminal 2"`, …). It is stable for that PTY's lifetime —
  closing another terminal does not renumber it — and survives Restart. Because
  ordinals restart with the app, two tabs can share a title after a restart;
  accepted as cosmetic.
- **Action:** `{ type: "openTerminal"; id: \`terminal:${string}\`; title: string }`
  upserts, activates, and sets `isOpen: true`. It does not interact with the
  `files`/`file:` mutual-exclusion rules.
- `RightPanelKind` gains `"terminal"`; `RightPanelSurface` gains
  `TerminalSurface`.
- **Tab title/icon:** `surfaceTitle` returns `surface.title`; `surfaceIcon`
  returns a new `IconTerminal` built from the lucide `Terminal` icon already
  imported in `icons.tsx` (currently only exported as `IconToolExecute`).
- **Add menu:** `ADD_ACTIONS` gains a Terminal entry. Unlike the others it
  cannot dispatch directly, because creation is async — it calls an
  `onNewTerminal()` prop. On success the panel dispatches `openTerminal`; on
  failure no tab appears and the panel reports it (see §7).

## 2. Lifecycle and kill semantics

Closing a tab must kill its PTY. There are four removal paths (`close`,
`closeOthers`, `closeAll`, `removeSession`), so the renderer does not scatter
kill calls across handlers. Instead it wraps panel dispatch:

```ts
function dispatchPanel(action: PanelAction): void {
  const before = panel.state.surfaces;
  panel.dispatch(action);
  const after = panelReducer(panel.state, action).surfaces; // pure, so computable
  for (const surface of before) {
    if (surface.kind !== "terminal") continue;
    if (after.some((entry) => entry.id === surface.id)) continue;
    void window.relay.terminal.close(surface.id);
  }
}
```

One place, no missed path, unit-testable. Main additionally:

- kills a session's terminals when that session is deleted
  (`SessionManager.delete`, `src/main/session-manager.ts:494`);
- sweeps on every `sessions` event, closing terminals whose session no longer
  exists — a safety net against any removal path the renderer misses;
- closes every terminal on app shutdown.

A renderer reload (⌘R, or a crashed renderer) is **not** a reason to kill
anything: main keeps every PTY, the reloaded renderer restores its terminal
tabs from persisted state and re-attaches to them. Nothing else in the system
owns that signal, so this is stated explicitly.

Terminals belonging to a **background** session keep running, so a dev server
survives a session switch. The manager is keyed
`terminalId -> { sessionId, pty, chunks, bytes, exited }`.

`terminalClose` on an already-exited terminal is a no-op, not an error.

## 3. Persistence

Terminal surfaces **are** persisted — `{ id, kind: "terminal", title }`, with a
validator that requires the id to match `^terminal:[0-9a-fA-F-]{36}$` (a UUID)
and the title to be a non-empty string — so a renderer reload restores the tabs
and re-attaches to the still-running shells. This is what makes "reload without
losing the shell" true; dropping terminal surfaces instead would leave live
PTYs unreachable.

What is *not* restored is the process itself. After an app restart the restored
tab calls `terminalAttach` with an id main has never heard of; main answers
`{ ok: false, reason: "missing" }` and the tab renders a "no longer running"
notice with a **Start a new terminal** action (see §7). No dead tab is ever
shown as live, and no id can collide (see §1).

## 4. Main process: `TerminalManager`

New module `src/main/terminal-manager.ts`, dependency-injected like
`src/main/editors.ts` so unit tests never touch a real PTY:

```ts
export type PtyLike = {
  pid: number;
  onData(cb: (data: string) => void): void;
  onExit(cb: (e: { exitCode: number; signal?: number }) => void): void;
  write(data: string): void;
  resize(cols: number, rows: number): void;
  kill(signal?: string): void;
};

export type PtySpawner = (opts: {
  file: string;
  args: string[];
  cwd: string;
  env: Record<string, string>;
  cols: number;
  rows: number;
}) => PtyLike;
```

The default spawner calls `node-pty` with `name: "xterm-256color"`, the given
cwd/env, and the given size.

**API:** `create({ sessionId, cwd, cols, rows }) -> { terminalId, title }`,
`attach(id) -> { ok: true; data; seq; exited; exitCode; signal } | { ok: false; reason: "missing" }`,
`write(id, data)`, `resize(id, cols, rows)`, `close(id)`, `restart(id)`,
`removeSession(sessionId)`, `sweep(activeSessionIds)`, `shutdown()`, and
`onEvent(cb)` mirroring `SessionManager.onEvent`. `create` receives an already
resolved cwd; the manager knows nothing about sessions beyond the opaque
`sessionId` it stores for scoping and sweeping.

**Scrollback buffer.** Per terminal, an array of raw output chunks capped at
**256 KB of raw output bytes**, trimmed from the oldest whole chunk. `attach` returns the
concatenation prefixed with `\x1b[0m\x1b[?25h` so a replay that begins
mid-escape-sequence normalizes SGR state and cursor visibility instead of
rendering garbage. This is the one accepted fidelity compromise.

**Coalescing.** `onData` can fire many times per tick. Chunks accumulate and
flush on `setImmediate`, with an immediate flush past 64 KB, so a `yes`-style
flood becomes one IPC message per tick instead of thousands.

**Events** (`src/shared/terminal.ts`):

```ts
export type TerminalEvent =
  | { type: "terminalData"; terminalId: string; data: string; seq: number }
  | { type: "terminalExit"; terminalId: string; exitCode: number | null; signal: number | null }
  | { type: "terminalReset"; terminalId: string };
```

**Sequence numbers.** Every flush stamps the chunk with an increasing
per-terminal `seq`, and `attach` returns the `seq` its snapshot covers. The view
buffers events until the snapshot resolves, then drops any chunk at or below
that `seq`. Without it, a chunk flushing between subscribe and attach is written
twice — once as an event and once inside the replay — so a busy terminal shows
duplicated output after a tab switch.

**Restart** kills the current PTY, spawns a fresh one under the *same* id,
clears the buffer, keeps the title, and emits `terminalReset`.

## 5. IPC surface

All channels are `relay:<camelCase>` and all inputs are validated in main:
`sessionId` must be a known session, `cols`/`rows` are clamped to positive
integers (cols 1–1000, rows 1–1000), and every id is shape-checked before use.
A **missing** terminal is a normal state, not an error: `terminalAttach`
answers `{ ok: false, reason: "missing" }`, and `write`/`resize`/`close`/
`restart` on a missing id are no-ops, so a stale renderer can never crash main
or resurrect a process.

| Channel | Direction | Payload |
| --- | --- | --- |
| `relay:terminalCreate` | invoke | `{ sessionId, cols, rows } -> { terminalId, title }` |
| `relay:terminalAttach` | invoke | `{ terminalId } -> { ok: true; data; seq; exited; exitCode; signal } \| { ok: false; reason: "missing" }` |
| `relay:terminalWrite` | invoke | `{ terminalId, data } -> void` |
| `relay:terminalResize` | invoke | `{ terminalId, cols, rows } -> void` |
| `relay:terminalClose` | invoke | `{ terminalId } -> void` |
| `relay:terminalRestart` | invoke | `{ terminalId } -> void` |
| `relay:terminalEvent` | push | `TerminalEvent` |

`terminalCreate` takes **no cwd**: main resolves it from the session, so the
renderer cannot aim a shell at an arbitrary directory.

**Push channel is separate from `relay:event`.** Terminal data is
high-frequency, and the existing `relay:event` subscribers do session-state work
and fire notifications per event; mixing them would run that machinery on every
PTY chunk. `relay:claudeInstallProgress` (`src/main/index.ts:482`,
`src/preload/index.ts:83`) is the precedent for a second channel. The preload
gains `terminal: { create, attach, write, resize, close, restart, onEvent }` and
`src/renderer/env.d.ts` declares it.

## 6. Shell, cwd, and environment

- **cwd** is the session's current working directory at creation time, resolved
  by main.
- **Shell** is the user's login shell resolved through the existing
  `src/main/path-env.ts`, falling back to `/bin/zsh`, spawned with `-l` so
  profile/rc files load; the PTY makes it interactive.
- **Env** is the app's environment plus the login-resolved `PATH` — *not* the
  agent session's env, so agent credentials never leak into a shell.
- **Containment is deliberately waived.** Spec 1 requires that everything the
  renderer asks for stays inside the session cwd (`resolveWithinReal`). A shell
  can `cd` anywhere and run anything; that is the point. This is a documented,
  accepted exception, not an oversight.

## 7. Renderer UI

New `src/renderer/right-panel/PanelTerminal.tsx`. Because `RightPanel.tsx`
renders only the *active* surface, the component mounts when its tab activates
and unmounts when it does not — that is the re-attach point.

- **Mount:** create an xterm `Terminal` (scrollback 5000), load `FitAddon`,
  `terminalAttach(id)` then `term.write(data)`, subscribe to
  `relay:terminalEvent` filtered by `terminalId`, wire
  `term.onData -> terminalWrite` and `term.onResize -> terminalResize`, and
  focus the view. Events for this id arriving before the attach snapshot
  resolves are buffered and replayed after it, so nothing is written twice or
  out of order. The view is keyed by `terminalId`, so switching tabs rebuilds it
  and no exit or missing state can leak between terminals.
- **Resize:** a `ResizeObserver` on the container debounces ~100 ms (the panel
  is drag-resizable) into `fit()`.
- **Theme:** `terminalTheme()` reads the app's live CSS custom properties
  (`--editor`, `--text`, `--muted`, `--danger`, `--ok`, `--mono`,
  `--font-size`) with dark fallbacks, so the terminal follows the existing
  `:root[data-theme="dark"]` / `theme.ts` system. A `MutationObserver` on the
  `data-theme` attribute updates `term.options.theme` on change.
- **Keys:** `attachCustomKeyEventHandler` passes plain and Ctrl-modified keys to
  the shell (Ctrl-C is SIGINT, always) while ⌘-combos stay with the app, so
  existing shortcuts (⌘⌥B, ⌘K) keep working; ⌘C/⌘V use xterm's selection and
  clipboard. The global handler in `App.tsx:397` already routes through
  `isTypingTarget` (`src/renderer/keys.ts:33`); if xterm's hidden textarea is
  not classified as a typing target, extend that helper rather than adding a
  second guard.
- **Exit state:** on `terminalExit`, write a dim `[process exited with code N]`
  line and show a **Restart** button calling `terminalRestart(id)`; on
  `terminalReset`, `term.reset()` and clear the exited state. A restart whose
  respawn fails leaves no terminal behind in main, so the view falls back to the
  same recovery notice rather than pretending the shell is alive.
- **Missing terminal:** when `terminalAttach` reports `missing` (the tab was
  restored after an app restart), do not open xterm against nothing — render a
  `<p className="panel-note">` notice plus a **Start a new terminal** button.
  That button calls `terminalCreate`, dispatches `openTerminal` for the new id
  and `close` for the stale surface; main treats the stale id as a no-op, and
  no new action type or rebind is needed.
- **Failure:** if `terminalCreate` rejects (shell missing), no tab is opened and
  the message is shown with the panel's existing idiom,
  `<p className="panel-note">`.

## 8. Packaging and the native dependency

- `dependencies`: `node-pty@^1.1.0`, `@xterm/xterm@^6`, `@xterm/addon-fit@^0.11`.
  (node-pty must be a runtime dependency so `electron-vite` externalizes it
  rather than bundling a native module.)
- `devDependencies`: `@electron/rebuild`.
- `package.json` gains `"postinstall": "electron-rebuild -f -w node-pty"` so
  `npm install` leaves an **Electron-ABI** binary. Dev mode needs this too,
  since `electron-vite dev` runs the main process under Electron.
- `electron-builder.yml`: `npmRebuild: false -> true`, and `asarUnpack` gains
  `**/node_modules/node-pty/**`.
- `tests/packaging.test.ts` expectations update with the above.
- **Hard gate (plan step 0):** install, rebuild, and smoke-spawn a shell under
  Electron dev on macOS arm64 before any other work. The toolchain is present
  (Xcode CLT, clang 21, python3), but an Electron 37 ABI build is unproven here
  and the whole design depends on it.

## 9. Testing

- `tests/terminal-manager.test.ts` — injected fake spawner: create, attach
  replay, the 256 KB trim, `setImmediate` coalescing (fake timers), the 64 KB
  immediate flush, close, restart (same id, cleared buffer, `terminalReset`),
  `removeSession`, `sweep`, `shutdown`, `attach` on a missing id, and
  idempotent close after exit.
- `tests/right-panel.test.ts` — `openTerminal` upserts, activates, opens the
  panel, and does not disturb the `files`/`file:` exclusion rules.
- `tests/right-panel-persist.test.ts` — a well-formed terminal surface round
  trips; malformed ones (bad id, missing title) are dropped by name.
- `tests/right-panel-tabs.test.tsx` — the title comes from `surface.title`; the
  add menu exposes Terminal and calls `onNewTerminal`.
- `tests/index.test.ts` — handlers are registered, `attach` on an unknown
  `terminalId` answers `missing` while `write`/`resize`/`restart` on it are
  no-ops, sizes are clamped, a deleted session's terminals are swept, and events
  broadcast on `relay:terminalEvent`.
- `tests/panel-terminal.test.tsx` — mock `@xterm/xterm` and assert the wiring
  (attach on mount, events routed by id, resize emitted, exit/restart state)
  plus the `missing` notice and its Start-a-new-terminal flow, rather than
  running xterm in jsdom.
- **Known limitation:** `postinstall` builds node-pty for the Electron ABI,
  while Vitest runs under plain Node 24, so a real-PTY integration test cannot
  load that binary. Any real-shell test is `skipIf` the module fails to load,
  with the reason stated, and real verification moves to the manual checklist.

**Manual checklist:** open from `+`; type and run a TUI (vim/htop); resize the
panel; switch tab and back (replay); switch session and back (shell survived);
reload with ⌘R (tabs restored, scrollback survived, same shell — check the PID
is unchanged); quit and relaunch and confirm the restored tab shows the
"no longer running" notice and Start-a-new-terminal works; exit and Restart;
close the tab and confirm with `ps` that the shell is gone; quit the app and
confirm no orphans; toggle the app theme and confirm the terminal follows.

## 10. Risks

- **Native build/packaging is the dominant risk.** `npmRebuild: true` makes
  packaging slower and requires a toolchain on every build machine, including
  any CI and any other OS target; a prebuilt-binary fallback
  (`@homebridge/node-pty-prebuilt-multiarch`) exists if source builds prove
  unreliable. Mitigated by the plan step-0 gate.
- **`npm install` now compiles a native module**, a real change to contributor
  setup and CI time.
- **Buffer replay can begin mid-sequence.** Trimmed to whole chunks and
  normalized with a leading SGR reset; minor artifacts are possible at the very
  top of a replayed scrollback.
- **A shell bypasses cwd containment** by design (accepted).
- **High-volume output** is bounded by coalescing, but a pathological program
  can still produce sustained IPC traffic.
- **Multiple windows showing the same session** would render the same terminal
  twice and both would send resize events (last writer wins). Accepted for v1
  and documented; an exclusive-attach scheme is the fix if it matters.
- **Persisted tabs can outlive their process** (an app restart, or a crash that
  reaped the PTYs). Handled by the `missing` path rather than a lie, but a
  restored panel can contain a terminal tab that does nothing until the user
  starts a new one.
- **Renderer bundle** grows by xterm and its addon.

## 11. Open questions

None blocking. Deferred deliberately: ACP `terminal/*` support, "Open Terminal
Here", terminal profiles, and exclusive multi-window attach.
