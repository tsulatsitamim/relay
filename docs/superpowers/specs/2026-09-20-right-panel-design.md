# Right Panel — Design Spec (Spec 1 of 3)

Date: 2026-09-20
Status: Approved approach (chat); awaiting review of this written spec.

## Goal

Give Relay a T3-Code-style **right panel**: a multi-surface tab workspace beside
the chat, plus a working editor button.

This spec is **Spec 1 of 3**. It delivers the panel framework and the three
local surfaces:

1. **Changes** — git working-tree changes of the session directory, rendered with
   Relay's existing diff viewer.
2. **Files** — explorer of the session working directory.
3. **File** — single-file preview, opened from the explorer or from a diff in the
   transcript.

It also makes the canvas toolbar real: a toggle button for the panel itself
(with a changed-file badge), and the dead `IDE` placeholder replaced by a real
open-in-editor button (open in editor / reveal in Finder).

Spec 2 adds a **Terminal** surface, Spec 3 a **Preview/browser** surface. Both
plug into the surface model defined here; neither is in scope now.

## Non-goals (explicitly deferred)

- **Terminal** surface (needs `node-pty` + `@xterm/xterm`) — Spec 2.
- **Preview/browser** surface (needs `WebContentsView` lifecycle) — Spec 3.
- **Agents** and **Plan-to-panel migration**: the Plan surface here only reads
  the plan already shown in the transcript.
- **Auto-open of the panel.** Decided: manual only. Therefore there is no
  `userActionRevision` / `openProactive` machinery.
- **Tab drag reorder** and tab mute (T3 has neither reorder nor a store-level
  mute; mute is preview-only and irrelevant here).
- Pull requests, devices, attachments, MCP — not affected.
- No change to the transcript diff review behavior; the panel is a **second
  view**, not a replacement.

## Global constraints

- TDD for every unit of production logic: failing test first, watch it fail,
  implement, watch it pass, commit.
- Vitest. Component tests start with `// @vitest-environment jsdom` and call
  `afterEach(cleanup)` explicitly (globals are off).
- `npm test`, `npm run typecheck`, and `npm run build` green after every task,
  run as separate commands.
- **No new runtime dependencies.**
- No code comments in source.
- New parameters are optional with defaults; existing call sites keep working.
- Everything the renderer asks for stays inside the session working directory:
  reuse `resolveWithinReal(cwd, path)` for every path from the renderer.

## Decisions from brainstorming

| Decision | Choice |
| --- | --- |
| Approach | A — multi-surface store written for Relay, no new deps |
| Changes data source | git working tree in `workingDirectory`; reuse existing diff viewer |
| Auto-open | No (manual only) |
| Editor integration | Small catalog + preferred editor, plus Reveal in Finder |
| Panel toggle | Icon button in the canvas toolbar with a changed-file badge |

## 1. Surface model

New directory `src/renderer/right-panel/`.

```ts
export type RightPanelKind = "changes" | "files" | "plan" | "file";

export type RightPanelSurface =
  | { id: "changes"; kind: "changes" }
  | { id: "files"; kind: "files" }
  | { id: "plan"; kind: "plan" }
  | {
      id: `file:${string}`;
      kind: "file";
      path: string;
      revealLine: number | null;
      revealRequestId: number;
    };

export type SessionPanelState = {
  isOpen: boolean;
  activeSurfaceId: string | null;
  surfaces: RightPanelSurface[];
};
```

`changes`, `files`, `plan` are singletons; `file:` is one instance per path.

Store = `Record<sessionId, SessionPanelState>` + `Record<sessionId, number>` for
width. Pure reducer functions are the testable core; the React layer subscribes
with `useSyncExternalStore`. `isOpen` and `activeSurfaceId` are explicit fields
maintained by the actions, never derived.

The renderer derives `sessionId` from the selected session and `cwd` from its
`workingDirectory`; the panel and the toolbar button render only while a session
is selected, and every IPC call passes that `cwd`.

`fileSurfaceId(path)` = `` `file:${path}` ``. Reopening a known path bumps
`revealRequestId` instead of adding a duplicate tab (the surface component
scrolls to `revealLine` when the request id changes).

### Actions (reducer)

| Action | Behavior |
| --- | --- |
| `open(sessionId, kind)` | upsert singleton; `isOpen = true`; activate it |
| `openFile(sessionId, path, revealLine?)` | upsert `file:` surface; bump `revealRequestId` on reopen; **drop the `files` explorer**; activate it |
| `activate(sessionId, id)` | set active + `isOpen = true` if the surface exists |
| `close(sessionId, id)` | remove; activate `surfaces[min(index, len - 1)]`; if none remain `isOpen = false`, `activeSurfaceId = null` |
| `closeOthers(sessionId, id)` | keep only `id` |
| `closeAll(sessionId)` | clear surfaces, `isOpen = false` |
| `toggle(sessionId, kind)` | if open and the active surface is already that kind → `isOpen = false`; else `open` |
| `hide(sessionId)` | `isOpen = false`, keep `activeSurfaceId` |
| `removeSession(sessionId)` | delete both the state and the width entry |
| `setWidth(sessionId, px)` | clamped width |

Opening `files` drops all `file:` surfaces (symmetric with the rule above).
A session whose state returns to empty is deleted from the map.

## 2. Persistence

- **Panel state:** `localStorage` key `relay.rightPanel`, value
  `{ version: 1, bySession: Record<string, SessionPanelState> }`.
- **Width:** `localStorage` key `relay.rightPanelWidth:<sessionId>`, one number.
  Written once on drag end, not per frame.
- **Validator** (`persist.ts`, pure and unit-tested): drops unknown kinds,
  non-string paths, and malformed ids; normalizes `revealLine` (missing/invalid →
  `null`) and `revealRequestId` (non-negative integer, otherwise `0`); pushes
  `activeSurfaceId` to the first surface if it points at a dropped one; and never
  leaves `isOpen === true` with zero surfaces.
- Unreadable or wrong-version payloads degrade to `{ version: 1, bySession: {} }`.
- Entries are pruned via `removeSession` when a session is deleted.

Width clamp: `max(360, min(preferred, max(360, min(floor(innerWidth * 0.7),
containerWidth - 360))))`, default `540`, so the chat column keeps at least
360px. When the container is too narrow for both (clamp collapses), the panel
renders as a right-anchored overlay (`position: absolute`, full height, scrim,
`Escape` closes) instead of an inline flex sibling.

Maximize is per-session React state, not persisted (matches T3).

## 3. Main process & IPC

New channels, all validated in the main process and using `resolveWithinReal`
where a path is involved.

| Channel | Returns |
| --- | --- |
| `relay:readFile(cwd, path)` | `{ text: string; truncated: boolean; binary: boolean }`; caps at 512 KB and detects NUL bytes for binary |
| `relay:gitChanges(cwd)` | `{ branch: string \| null; files: GitChange[] }` or `null` when not a repo / git missing |
| `relay:gitFileDiff(cwd, path)` | `{ path: string; status: GitChangeStatus; oldText: string \| null; newText: string; binary: boolean } \| null` |
| `relay:availableEditors()` | `EditorId[]` detected once and cached in the main process |
| `relay:openInEditor(cwd, editor, path?, line?)` | `{ ok: true } \| { ok: false; message: string }` |
| `relay:revealInFinder(cwd, path)` | `boolean` |

```ts
export type GitChangeStatus =
  | "modified" | "added" | "deleted" | "renamed" | "untracked" | "conflicted";

export type GitChange = {
  path: string;
  status: GitChangeStatus;
  oldPath?: string;
  insertions?: number;
  deletions?: number;
};
```

`relay:gitChanges` shells out to `git status --porcelain=v2 -z --untracked-files=all`
(plus `git diff --numstat HEAD -z` for line counts) with a timeout, and returns
`null` when the directory is not a git work tree. Untracked files are included;
`deleted` files have `newText: ""`; `untracked` files have `oldText: null`.

`relay:gitFileDiff` produces `oldText` from `git show HEAD:<path>` (or `null`
for added/untracked) and `newText` from disk — exactly the
`{ path, oldText, newText }` shape `DiffBlock` already consumes (`DiffBlock.tsx`
props; ACP diff payloads are `{ toolCallId, path, oldText, newText }`).

Editor catalog (small, per decision):

```ts
export const EDITORS = [
  { id: "vscode", label: "VS Code", command: "code", goto: true },
  { id: "cursor", label: "Cursor", command: "cursor", goto: true },
  { id: "zed", label: "Zed", command: "zed", direct: true },
  { id: "windsurf", label: "Windsurf", command: "windsurf", goto: true },
  { id: "webstorm", label: "WebStorm", command: "webstorm", jetbrains: true },
  { id: "idea", label: "IntelliJ IDEA", command: "idea", jetbrains: true },
] as const;
```

```ts
export type EditorId = (typeof EDITORS)[number]["id"];
```

Detection reuses the PATH already fixed by `applyLoginPath()`: probe with the
existing `hasBinaryOnPath` helper in `src/main/agents.ts`, then fall back to
`/Applications/<Name>.app/Contents/Resources/app/bin/<command>` and
`/Applications/<Name>.app/Contents/MacOS/<command>`.

Launch is `spawn(command, args, { detached: true, stdio: "ignore" })` followed by
`unref()`, with `shell: false` (macOS). Argument shape per launch style: VS Code
family `["--goto", "path:line"]` when a line is given else `[path]`, Zed
`[path]`, JetBrains `["--line", line, path]`. Opening without a path opens `cwd`.

Reveal in Finder uses Electron's `shell.showItemInFolder(cwd/path)` — no `open -R`
needed.

The preferred editor id is persisted with the existing settings mechanism: key
`preferredEditor` in the `settings` table, written through `relay:setSetting`,
read from the bootstrap `SessionState.settings` map. No new IPC is needed for it.

## 4. Renderer UI

New components in `src/renderer/right-panel/`:

| Component | Role |
| --- | --- |
| `RightPanel.tsx` | Shell: presence, width, resize handle, maximize, overlay fallback |
| `RightPanelTabs.tsx` | Tab strip, overflow scroll buttons, `+` add-surface menu, tab context menu, empty state |
| `PanelChanges.tsx` | File list + selected file's diff via `DiffBlock` |
| `PanelFiles.tsx` | Search + flat list from `listFiles` (with a raised `limit`) |
| `PanelFile.tsx` | Single file text via `CodeBlock`, reveal-line scrolling, "Open in editor" |
| `PanelPlan.tsx` | Latest plan from the transcript |
| `EditorButton.tsx` | Split button: click = preferred editor, menu = other editors + Reveal in Finder |
| `PanelToggle.tsx` | Icon button toggling the panel, with changed-file badge |

Mount point: inside `section.canvas`, the panel is a flex sibling of the chat
column, so `.canvas` becomes a row container (chat column `flex: 1`, panel fixed
px). In the canvas toolbar (`canvas-tools-right`, `App.tsx:1588-1595`) the
existing `.ide-link` span becomes `EditorButton`, and `PanelToggle` is inserted
before it. Both render only while a session is loaded.

`PanelToggle` is an `icon-btn` with `aria-pressed={isOpen}`, an `aria-label` and
tooltip that include the `mod+alt+b` shortcut, and — when the session's git
working tree has changed files and the panel is closed — a badge showing that
count (capped display at `99+`). Clicking toggles the panel with its last active
surface; the badge comes from the shared changes hook below, so it costs no
extra IPC.

Reuse rather than rewrite: `DiffBlock` + `diff-split.ts` for changes,
`CodeBlock` for file text, `PlanBlock` for the plan, `listFiles` for the
explorer, `IconOut`/existing icon set.

Keyboard: `mod+alt+b` toggles the panel (free — Relay uses `mod+b`, `mod+f`,
`mod+k`, `mod+n`, `mod+s`, `mod+/`); `mod+o` opens the workspace in the preferred
editor. Panel close stays on the per-tab `×` and the context menu, because
`mod+w` belongs to the window on macOS. Both new bindings are added to the
existing keymap + Help dialog.

## 5. Data flow & refresh

| Surface | Source | Refreshed when |
| --- | --- | --- |
| Changes | `relay:gitChanges`, `relay:gitFileDiff` | session loaded (for the badge), active surface activated, turn finished (`status` event), window regains focus, manual refresh button, working directory changes |
| Files | `relay:listFiles(cwd, query)` | explorer opened, query changes (debounced) |
| File | `relay:readFile(cwd, path)` | surface opened, `revealRequestId` changes |
| Plan | latest `plan` transcript event | transcript updates |

`gitChanges` is driven by one `useGitChanges(cwd)` hook owned by the canvas, so
the toolbar badge and `PanelChanges` share a single fetch; it runs whenever a
session is loaded (the badge needs the count while the panel is closed) and its
`refresh()` is exposed to `PanelChanges`. The other surfaces' fetches are
debounced and skipped while the panel is closed. Failed git reads (deleted
worktree, permission) surface an inline message, not a crash.

## 6. Error handling

- Not a git repository, or `git` missing → Changes empty state with copy saying
  so, plus a retry button.
- Path outside `cwd` (blocked by `resolveWithinReal`) → inline notice.
- Binary or oversized file → notice, metadata only, no text render.
- Editor binary missing at launch time → error message from
  `{ ok: false, message }` shown inline in the button's popover.
- Editor never detected → the button falls back to Reveal in Finder only.

## 7. Testing

- **Reducer**: singleton vs instance surfaces, `files`↔`file:` mutual exclusion,
  `revealRequestId` bumping, close fallback to neighbor, close-last hides the
  panel, empty-state deletion, `removeSession`.
- **Validator/migration**: unknown kinds, malformed ids, `revealLine`/
  `revealRequestId` normalization, dangling `activeSurfaceId`, and the invariant
  that a persisted payload never reopens an empty panel.
- **Width clamp**: min, default, viewport fraction, sibling reservation, and the
  too-narrow case that switches to overlay.
- **IPC**: temp-directory git fixtures — modified/added/deleted/renamed/
  untracked/conflicted status parsing, `numstat` counts, non-repo → `null`;
  `readFile` truncation and binary detection; path-escape rejection.
- **Components (jsdom)**: tab strip open/activate/close/close-others/close-all,
  context-menu actions, `+` menu, empty-state letter shortcuts, `EditorButton`
  menu contents for the detected set, `PanelToggle` pressed state and badge
  count (`99+` cap, no badge when clean or when the panel is open), and one test
  that the panel does not auto-open when a diff arrives.
- Every commit keeps `npm test`, `npm run typecheck`, `npm run build` green.

## 8. Risks

- **Porcelain v2 parsing** (renames, spaces, `-z` framing, submodules) is the
  most error-prone part; parsing lives in a pure function with fixtures from real
  git output.
- **`DiffBlock` reuse**: it takes `{ path, oldText, newText }` and computes the
  diff internally, so git data must be adapted into that shape rather than
  passing a unified-diff string. If its optional props (comments, reviewed,
  review send) don't fit a panel context, wrap it rather than modify it.
- **`listFiles` limits**: defaults are `limit: 200`, `maxDepth: 6`; the explorer
  passes a higher limit and keeps search server-side via `query`.
- **Large diffs**: diff computation in `DiffBlock` is synchronous, so a file with
  thousands of changed lines would stall a render. The Changes surface renders at
  most 4000 diff lines per file and shows a "diff truncated" row with the total
  line count when it hits the cap. Files above 1 MB are not diffed at all; the
  row instead offers "Open in editor".
- **Always-on `gitChanges`**: the badge makes the hook run for every loaded
  session, including non-repo directories. Mitigations: `relay:gitChanges`
  returns `null` immediately when the directory is not a work tree, git runs with
  a timeout, refreshes are coalesced per turn instead of per event, and in-flight
  work is cancelled when the working directory changes.
