# Agent Input Features — Design Spec

Date: 2026-09-15
Status: Approved by human partner (chat), executing via subagent-driven-development.

## Goal

Complete the agent command-center input experience: queue prompts while an
agent is working, discover `/` slash commands and `@` file context, attach
images, and make the sidebar list cheaper to render.

## Non-goals (explicitly deferred)

- **Checkpoint/restore** — ambiguous semantics (git snapshot vs ACP
  `loadSession` resume). Needs its own design. Not in this batch.
- **Main-process send queue** — the queue lives in the renderer (lost on
  reload). Acceptable for this batch; revisit only if reload-survival is
  requested.
- **Full list virtualization** (`react-window`) — sidebar is grouped and
  collapsible; variable-height virtualization is high-risk. Use CSS
  `content-visibility` instead.
- Executing slash commands via a dedicated ACP path — a selected command is
  inserted as text and sent through the normal prompt path; the agent
  interprets it.

## Global constraints

- TDD for every unit of production logic: failing test first, watch it fail,
  implement, watch it pass, commit.
- Test runner: Vitest. Component tests start with `// @vitest-environment jsdom`
  and call `afterEach(cleanup)` explicitly (globals are off).
- Every task must keep `npm test`, `npm run typecheck`, and `npm run build`
  green.
- No new runtime dependencies.
- Keep existing signatures backward compatible by defaulting new parameters
  (e.g. `prompt(text, attachments = [])`).
- Renderer never receives raw attachment bytes back from the main process for
  display; user transcript events store attachment **names/mimeTypes only**.

## Data flow / interfaces

### W1 — Queue while working
- `src/renderer/queue.ts`: pure `nextQueued(queue: string[], status: string): string | null`
  — returns `queue[0]` only when `status === "idle"` and the queue is non-empty.
- `App` owns `queued: Record<string, string[]>` and flushes per session when
  status becomes idle, guarded by an in-flight `Set` ref.
- `Composer` accepts `queued`, `onQueue`, `onRemoveQueued`. While `working`,
  Enter enqueues instead of sending.

### W2 — Slash commands
- `reduceSessionUpdate` handles `available_commands_update` → transcript event
  `kind: "commands"`, payload `{ commands: AvailableCommandLike[] }`, with
  replace-last semantics (same as `plan`).
- `AvailableCommandLike = { name: string; description: string; inputHint?: string }`.
- `Transcript` renders `commands` events as `null`.
- `SuggestionMenu` is a presentational list (label + detail, active highlight).
- `Composer` opens the menu when the text is a single `/token` with no space,
  filters by name/description, and on pick sets text to `/name `.

### W3 — `@` file context
- `src/main/file-index.ts`: `shouldIgnore(name): boolean` and
  `listFiles(cwd, { limit = 200, maxDepth = 6 }): string[]` returning relative
  POSIX paths, sorted, capped. Ignores dotfiles and
  `node_modules|.git|.worktrees|out|dist|build|.next|.turbo|coverage|.superpowers`.
- IPC `relay:listFiles(cwd)`; preload `listFiles(cwd) -> Promise<string[]>`.
- `Composer` detects a trailing `@query` token, debounces ~120 ms, calls
  `listFiles`, filters client-side, and on pick replaces the token with
  `@path `.

### W4 — Image attachments
- `PromptAttachment = { name: string; mimeType: string; data: string }`
  (`data` = base64, no data-URL prefix).
- `AcpSession.prompt(text, attachments = [])` builds
  `[{ type: "text", text }, ...attachments.map(a => ({ type: "image", mimeType, data, uri: null }))]`.
  A pure `promptBlocks(text, attachments)` is exported for unit testing.
- `SessionManager.send(id, text, attachments = [])` and `create({ ..., attachments })`
  thread attachments to `runPrompt`; the user transcript event stores
  `attachments: [{ name, mimeType }]`.
- `CreatePayload.attachments?: PromptAttachment[]`.
- IPC `relay:pickImages` opens an image-filtered dialog, reads each file to
  base64, caps size (8 MB each, max 8 files), returns `PromptAttachment[]`.
  `src/main/attachments.ts` holds `mimeForExt(ext)` + `readAttachment(path)`.
- `Composer` `+` becomes a real button; shows attachment chips with remove;
  send includes attachments.

### W5 — Sidebar perf
- `.row-item { content-visibility: auto; contain-intrinsic-size: auto 28px; }`.

## Testing strategy

- Pure modules (`queue`, `file-index`, `attachments`, `promptBlocks`) get direct
  unit tests.
- Reducer changes are tested in `tests/transcript.test.ts`.
- Components get jsdom tests with `@testing-library/react`.
- Main-process file work uses `mkdtempSync` fixtures and cleanup.
