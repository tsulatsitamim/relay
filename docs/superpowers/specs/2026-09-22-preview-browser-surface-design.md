# Preview/Browser Surface — Design Spec (Spec 3 of 3)

Follows `2026-09-20-right-panel-design.md` (Spec 1), which deferred this
surface with the note *"needs `WebContentsView` lifecycle"*, and
`2026-09-22-terminal-surface-design.md` (Spec 2), whose instance-surface pattern
this reuses.

## Goal

Let the user watch their own dev server inside a session's right panel while the
agent works — a real embedded browser pointed at `localhost`, one tab per
target — so a change the agent makes can be seen immediately instead of
alt-tabbed to a separate browser.

Success looks like: the agent prints `Local: http://localhost:5173/`, that URL
appears as a chip you can click, a preview tab opens and renders the app,
hot-reload works as you edit, the panel resize keeps the page glued in place,
menu popups do not have the page painted over them, switching tabs or sessions
comes back to the same page state, ⌘R reloads the app around the panel without
losing the page, and after an app restart the tab is still there and loads
again when you activate it.

## Non-goals (explicitly deferred)

- **General browsing.** Only `localhost`, loopback, `*.local` and private LAN
  addresses may load. Everything else is refused and offered to the system
  browser. This is the product boundary, not a limitation to be worked around.
- **ACP terminal/`fs` client capabilities.** Unrelated; still unimplemented.
- **DevTools, view-source, history/back-forward UI, bookmarks, downloads,
  find-in-page, zoom controls, user-agent or device emulation, screenshot.** A
  dev-server preview needs none of them.
- **Page-title tab labels.** The tab keeps the `host:port` it was created with.
- **Address-field autocomplete.** Detected URLs are offered as chips, not as
  text completion.
- **Injection into the previewed page.** No preload, no script execution; doing
  it later would need its own spec and an explicit trust decision.
- **A separate preview surface outside the right panel** (a floater window, a
  second column). The panel is the only home.

## Global constraints

- No new dependencies. `WebContentsView`, `contentView`, `View` and
  `shell.openExternal` are all in the installed Electron 37.10.3.
- TDD for every unit of production logic. Vitest, `environment: "node"` by
  default; renderer component tests opt into jsdom with
  `// @vitest-environment jsdom` as the first line.
- `npm test`, `npm run typecheck` and `npm run build` must all stay green. There
  is no lint script in this repo.
- All IPC input is validated in the main process. **Main is the authority on
  what may load**; the renderer's check is only for instant feedback. A missing
  preview is a normal state, never an exception.
- A real `WebContentsView` must never be constructed in a test. The manager
  takes an injected view factory, exactly as `TerminalManager` takes an injected
  PTY spawner, because `tests/index.test.ts` imports `src/main/index.ts` under
  plain Node.
- Renderer reload (⌘R) must not destroy any view. Views live in main.
- Preview ids are main-minted UUIDs matching `^preview:[0-9a-fA-F-]{36}$`.

## Decisions from brainstorming

- **Purpose:** dev-server preview first. Watch your own app; not a general
  browser.
- **Cardinality:** multiple preview tabs, each an instance surface
  (`preview:<uuid>`), mirroring terminals.
- **URL entry:** address bar **and** detected URLs — Relay scans terminal output
  and agent transcript text for local URLs and offers them as clickable chips.
- **Persistence:** tabs and URLs survive ⌘R and app restarts; a restored tab
  loads its URL when activated (and on a ⌘R if it was active), so a dead dev
  server shows a load failure inside that tab rather than blocking startup.
- **Trust:** local-only. Anything non-local is refused with a notice and offered
  to the system browser; links clicked inside a preview open in the system
  browser.
- **Embedding:** a real `WebContentsView` parented to the window's
  `contentView`, positioned by a rect the renderer measures and reports. Chosen
  over the `<webview>` tag (Electron's most discouraged API) and over a separate
  `BrowserWindow` per preview (which would abandon the surface model).
- **Partition:** `persist:relay-preview` — shared by all preview tabs so a login
  in one tab carries to another, isolated from the app's own session, and
  persistent so an app under test keeps its storage across a relaunch.
- **Self-signed certificates accepted for local hosts only**, so an `https://`
  dev server works. This deliberately narrows TLS verification for localhost
  traffic and is scoped to hosts that already pass the local policy.
- **Cap: 8 previews per session**, refused with a `panel-note`. Each preview is
  a full renderer process; this is the guard terminals did not need.

## 1. Surface model

```ts
export type PreviewSurface = {
  id: `preview:${string}`;
  kind: "preview";
  title: string; // "localhost:5173" at creation, or "Preview" when empty
  url: string;   // "" until an address is typed or a URL is detected
};
```

- **Identity is owned by main and is a UUID.** `previewCreate` mints
  `preview:<uuid>` and returns `{ previewId, title, url }`. The id is both the
  view's key in main and the surface id in the reducer, so no second identifier
  exists to drift. A UUID is required because surfaces are persisted: a restored
  `preview:2` must never be claimed by a freshly created view.
- **Title** is the URL's `host:port` computed once at creation, or `"Preview"`
  when the tab is created empty; it is stable for the tab's life.
- **Action:** `{ type: "openPreview"; id; title; url }` upserts, activates and
  sets `isOpen: true`. Like `openTerminal` it is purely additive and does not
  interact with the `files`/`file:` exclusion rules.
- `RightPanelKind` gains `"preview"`; `RightPanelSurface` gains
  `PreviewSurface`.
- **Tab title/icon:** `surfaceTitle` returns `surface.title`; `surfaceIcon`
  reuses the existing `IconToolWeb` (lucide `Globe`) — no new icon.
- **Add menu:** `ADD_ACTIONS` gains a Preview entry. Creation is async, so it
  calls an `onNewPreview()` prop rather than dispatching, exactly as the
  Terminal entry does.

## 2. URL entry and detection

**Shared pure module** `src/shared/preview.ts`:

```ts
export function isPreviewId(value: unknown): value is `preview:${string}`;
export function normalizePreviewUrl(
  input: string,
): { ok: true; url: string } | { ok: false; reason: string };
```

`normalizePreviewUrl` trims, defaults a bare `host[:port]` to `http://` (dev
servers are http), accepts only `http`/`https`, and requires the host to be
`localhost`, `127.0.0.1`, `::1`, `*.local`, or in a private range (10/8,
172.16/12, 192.168/16, 169.254/16). Everything else — remote hosts, `file:`,
`javascript:`, empty input — returns `ok: false` with a reason string. Main
re-validates every URL it is asked to load; the renderer uses the same function
for instant feedback.

**Detection** `src/main/preview-detect.ts`:

```ts
export function detectLocalUrls(text: string): string[];
```

A conservative scan for the URL shapes above (ports optional, trailing
punctuation trimmed) that catches Vite's `Local: http://localhost:5173/`, Next's
`http://127.0.0.1:3000`, and similar banners, and ignores remote URLs. A small
per-session store keeps the 8 most recent, deduped by origin+path, in memory
only, cleared when the session is deleted. Main feeds it two streams: terminal
output (the `relay:terminalEvent` data events main already observes) and agent
transcript text flowing through the existing session-update path.

Detected URLs are pushed as a new **low-frequency** `RelayEvent` variant:

```ts
| { type: "previews"; sessionId: string; urls: string[] }
```

Unlike terminal bytes, a detected URL arrives rarely, so it belongs on the
existing channel rather than a dedicated one.

**Surfacing:** the `+` menu's Preview entry creates a tab with the newest
detected URL if one exists, else an empty tab; an empty tab lists the session's
detected URLs as clickable chips. No address-field autocomplete in v1.

## 3. Lifecycle and persistence

- **Ownership.** Main owns every `WebContentsView`, keyed
  `previewId -> { sessionId, window, view, url, state }`.
- **Renderer reload (⌘R) destroys nothing.** Views outlive the renderer, as
  PTYs do. The reloaded renderer restores its tabs from persisted state and
  calls `previewShow` again, which re-parents/repositions/reveals the existing
  view; page scroll and SPA route survive untouched.
- **App restart has no views.** The restored tab activates, calls `previewShow`
  with its persisted URL, and main creates and loads the view right then — that
  *is* the "load on activation" behaviour. A dead dev server therefore fails
  inside that tab instead of blocking startup.
- **Creation is lazy.** `previewCreate` only mints the id and title; no view
  exists until a URL is actually shown. So an empty preview tab — which is what
  the `+` menu produces when the session has no detected URL — renders its empty
  state and costs no renderer process until an address is submitted, and closing
  a tab that never loaded one has nothing to destroy. Every view comes into
  existence through the same path: `previewShow` with a non-empty local URL.
- **Removal is single-pathed.** Closing a tab destroys its view. The renderer
  does not scatter close calls: `usePanelStore`'s single resource closer
  generalizes from "close a terminal" to "close a removed surface" —
  `closedTerminalIds` becomes `closedSurfaceIds(before, after): RightPanelSurface[]`
  and the App-level handler routes by kind (`terminal` → `relay.terminal.close`,
  `preview` → `relay.preview.close`). All four removal paths (`close`,
  `closeOthers`, `closeAll`, `removeSession`) then flow through one place.
- Main additionally destroys a session's views when the session is deleted
  (`relay:delete`), sweeps on every `sessions` event against the live session
  ids, and destroys everything on `before-quit`.
- **Background sessions keep their views**, so a preview survives a session
  switch — the same rule terminals follow.
- **Persistence.** Terminal and preview surfaces are both persisted, so
  `persist.ts` gains a preview branch requiring `isPreviewId(id)`, a non-empty
  string title, and a URL that is either `""` or passes
  `normalizePreviewUrl`. A malformed or non-local stored URL drops the surface
  rather than rendering a broken tab. `PANELS_VERSION` does not need a bump: an
  older blob has no preview surfaces and still parses, and unknown kinds were
  already dropped.
- `previewClose` / `previewHide` / `previewNavigate` on a missing id are
  no-ops, so a stale renderer can never crash main.

## 4. Main process: `PreviewManager`

New module `src/main/preview-manager.ts`, dependency-injected so unit tests
never construct a real view:

```ts
export type ViewLike = {
  webContents: {
    loadURL(url: string): Promise<void>;
    on(event: string, listener: (...args: unknown[]) => void): void;
    stop(): void;
    reload(): void;
    close(): void;
    isDestroyed(): boolean;
  };
  setBounds(rect: Rectangle): void;
  setVisible(visible: boolean): void;
  setBackgroundColor(color: string): void;
};

export type PreviewManagerDeps = {
  createView: () => ViewLike;
  openExternal: (url: string) => void;
  getWindow: (senderId: number) => BrowserWindow | null;
};
```

`createView` is the only place a `WebContentsView` is constructed, and it wires
the per-view security policy (§6).

**API:** `create({ sessionId, url, senderId }) -> { previewId, title, url }`,
`show(id, senderId, url)`, `setBounds(id, rect | null)`, `navigate(id, url)`,
`reload(id)`, `close(id)`, `removeSession(sessionId)`,
`sweep(activeSessionIds)`, `shutdown()`, and `onEvent(listener): () => void`
mirroring `SessionManager.onEvent`.

`create` mints the id and title but constructs no view; the view is created by
the first `show`/`navigate` carrying a non-empty local URL (see §3). Each entry
binds to the `BrowserWindow` resolved from the calling `event.sender`
(`BrowserWindow.fromWebContents`), and its view is `addChildView`'d to that
window's `contentView`. **Hiding is always expressed as `setBounds(id, null)`;
there is no separate hide call.** Main is the sole authority on the local-URL
policy for anything it loads or is asked to navigate to.

**Events** (`src/shared/preview.ts`), pushed on `relay:previewEvent`:

```ts
export type PreviewEvent =
  | { type: "previewState"; previewId: string; state: "loading" | "loaded" | "failed"; message?: string }
  | { type: "previewNavigated"; previewId: string; url: string };
```

`previewState` let the chrome show a spinner or the failure notice;
`previewNavigated` keeps the address bar honest when the page navigates itself.

## 5. Geometry protocol

A native child view is positioned in the parent `View`'s coordinate space, so the
renderer must measure and report the panel body's rect. New invoke channel
`relay:previewLayout`:

```
{ previewId, rect: { x, y, width, height } | null }   // null means hide
```

- The renderer measures the element carrying `PANEL_BODY_ID`
  (`"right-panel-body"`) with `getBoundingClientRect()` and reports rounded
  device-independent pixels.
- It re-measures and re-sends on: panel open/close, tab activation and
  deactivation, overlay/maximize toggle, window resize, and each
  `ResizeObserver` frame, coalesced to at most one report per animation frame.
- `getBoundingClientRect()` and `View.setBounds` share the same origin (the
  window's web content area) and the same unit (DIPs at zoom factor 1), so the
  mapping is the identity. **Because the renderer measures an element rather
  than deriving geometry from window metrics, the `titleBarStyle: "hidden"` and
  `padding-top: var(--titlebar)` inset needs no arithmetic.** This must still be
  confirmed visually — it is the design's main unproven assumption.
- **Hide-on-obstruct:** the view is hidden (`rect: null`) whenever the panel is
  closed, the active surface is not this preview, a panel menu/maximized
  overlay is open, or the panel handle is being dragged; the renderer sends
  `null` at drag start and a fresh rect at drag end. A native view paints above
  every HTML layer, so anything that must appear over the page requires the hide
  path.

## 6. Security policy

Per view (`createView`), with no preload:

- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`,
  `webSecurity: true`
- `partition: "persist:relay-preview"` (shared by previews, isolated from the
  app's own session, persistent across relaunches)

Enforced in main for every view:

- `will-navigate` and `will-redirect` — a target failing the local policy is
  prevented and handed to `shell.openExternal`.
- `setWindowOpenHandler` — always denies the popup; a local target becomes an
  in-place `loadURL`, a non-local one goes to `shell.openExternal`.
- `will-download` — cancelled. A preview cannot write to disk.
- `setPermissionRequestHandler` — every permission denied (geolocation,
  notifications, media, clipboard, …). A dev-server preview needs none.
- `certificate-error` — accepted **only** when the host passes the local
  policy; otherwise default handling. This deliberately narrows TLS verification
  for local hosts only, to make an `https://` dev server usable.

Separately, and in the app's own renderer window: a `setWindowOpenHandler` that
denies the popup and defers to `shell.openExternal`. Today chat markdown renders
`<a target="_blank">` with no handler, so external links have no defined route;
that window-level handler is the fix and applies to settings links too.

## 7. IPC surface

All channels are `relay:<camelCase>`, all inputs are validated in main, and a
missing preview is a normal state.

| Channel | Direction | Payload |
| --- | --- | --- |
| `relay:previewCreate` | invoke | `{ sessionId, url } -> { previewId, title, url }` (no view yet) |
| `relay:previewShow` | invoke | `{ previewId, url } -> void` (creates the view if absent) |
| `relay:previewLayout` | invoke | `{ previewId, rect \| null } -> void` |
| `relay:previewNavigate` | invoke | `{ previewId, url } -> { ok: true } \| { ok: false; reason: string }` |
| `relay:previewReload` | invoke | `{ previewId } -> void` |
| `relay:previewClose` | invoke | `{ previewId } -> void` |
| `relay:previewEvent` | push | `PreviewEvent` |

`previewCreate` refuses — with a message the panel shows as a `panel-note` —
an unknown session, a URL failing the local policy, or a ninth preview in one
session. There is no hide channel: hiding is `relay:previewLayout` with
`rect: null`. `previewCreate` and `previewShow` take a session/preview id but
never a cwd, path or window handle from the renderer; main resolves the window
from the sender.

The preload gains `preview: { create, show, layout, navigate, reload, close, onEvent }`
and `src/renderer/env.d.ts` mirrors it on `RelayBridge`.

## 8. Renderer UI

New `src/renderer/right-panel/PanelPreview.tsx` plus two hooks, mirroring the
terminal trio:

- `usePreviewLauncher.ts` — the only caller of `preview.create`; dispatches
  `openPreview` on success and surfaces a failure as the panel's existing
  `panel-note`.
- `usePreviewLayout.ts` — measures the body element and reports rects through
  `preview.layout`, including the `null` hide cases (inactive surface, open
  menu, overlay, drag in progress). Unit-tested with a stubbed
  `ResizeObserver`/rAF.
- `PanelPreview.tsx` — the chrome row and the conditional body:
  - **Chrome:** address input (local state; submit runs `normalizePreviewUrl`,
    shows the refusal notice on `ok: false`, else navigates), Reload/Stop, Open
    in browser, and a state indicator bound to `previewState`.
  - **Body:** the page itself is painted by the native view, so React renders
    nothing under it while the view is visible. The failure state
    (`did-fail-load`) shows a `panel-note` ("Can't reach localhost:5173 — is the
    dev server running?") with **Retry**; the empty state shows the session's
    detected-URL chips and a hint to type an address. Both states are reached
    with the view hidden, because nothing in HTML can cover it.
  - Events are routed by `previewId`; the chrome follows `previewNavigated`.

Integration touches: `icons.tsx` (reuse `IconToolWeb`), `RightPanelTabs.tsx`
(title/icon/`ADD_ACTIONS`/`onNewPreview`), `RightPanel.tsx` (launcher +
`onNewPreview` + the `preview` render branch + the launcher error line),
`usePanelStore.ts` (generalized surface closer), `terminal-lifecycle.ts` →
`surface-lifecycle.ts` (`closedSurfaceIds`), `persist.ts` (preview branch), and
styles for the chrome row.

## 9. Testing

- `tests/preview.test.ts` — `normalizePreviewUrl` (bare host → `http://`, port
  defaults and ranges, `*.local`, whitespace, rejects remote/`file:`/
  `javascript:`/empty), `isPreviewId`, and `detectLocalUrls` (Vite and Next
  banner shapes, dedup, trailing punctuation, remotes ignored).
- `tests/preview-manager.test.ts` — injected `createView` + `FakeView`: create
  mints a uuid id and the `host:port` title and constructs **no** view for an
  empty URL; `show` creates-if-missing and re-shows an existing view without
  reloading; `setBounds(id, null)` hides;
  `navigate` never reaches `loadURL` for a non-local URL; the registered
  `will-navigate` handler denies a remote target and calls `openExternal`;
  `setWindowOpenHandler` denies and routes; `will-download` cancels; unknown ids
  are no-ops; close/`removeSession`/`sweep`/`shutdown` dispose; the 8-preview cap
  refuses.
- `tests/index.test.ts` — a `FakeWebContentsView` above `vi.hoisted`, `views`
  and a `contentView` recorder added to the hoisted object, asserting handler
  registration, create's return shape, the layout-hide path, `relay:previewEvent`
  broadcasts, and view destruction on session delete / sweep / `before-quit`.
- Renderer — `tests/surface-lifecycle.test.ts` (the generalized closer over all
  four removal paths), `tests/use-preview-launcher.test.tsx` (success dispatches;
  a refusal sets the notice and opens no tab), `tests/use-preview-layout.test.tsx`
  (`null` on drag start/hide, rounded rects otherwise), plus additions to
  `tests/right-panel-persist.test.ts` (a well-formed preview round-trips; a
  remote URL and a malformed id are dropped by name), `tests/right-panel-tabs.test.tsx`
  (the add menu exposes Preview and calls `onNewPreview`), and a jsdom
  `tests/panel-preview.test.tsx` (chrome renders, address refusal notice, chips
  dispatch, failure state + Retry).
- **Known limitation:** none of the above constructs a real view. The embedding
  is proven only by the manual checklist: load + hot-reload a dev server; resize
  the panel and confirm the page stays glued; open a panel menu, the maximized
  overlay and a drag, and confirm the page is not painted over them; switch tabs
  and sessions and return; ⌘R and confirm the page state survives; restart the
  app and confirm the tab restores and loads on activation; stop the dev server
  and confirm the failure notice + Retry; type `https://example.com` and confirm
  the refusal + system-browser offer; click a remote link inside the page and
  confirm it opens externally; close the tab and confirm the webContents is
  destroyed.

## 10. Risks

- **A native view always paints above HTML.** Every current and future overlay
  (menus, toasts, the permission modal, a future command palette) must hide it or
  be drawn under a floating page. This is the coupling most likely to bite later;
  mitigation is a single hide path driven by the panel's own state.
- **Geometry drift.** The view can lag a resize by a frame, visible as a sliver
  of panel background. Mitigated by hiding during a drag and placing on release.
- **`WebContentsView` is unproven in this repo.** The API exists in 37.10.3
  (`addChildView`/`removeChildView`/`setBounds`/`setVisible` on `View`,
  `contentView` on `BaseWindow`), but z-order, focus behaviour and the exact
  `contentView` coordinate origin under `titleBarStyle: "hidden"` are verified
  only by the manual checklist. If the origin is offset, the fix is a constant
  correction in one place.
- **Accepted TLS weakening.** Invalid certificates are accepted for local hosts
  only; a hostile process on the machine could impersonate a local dev server.
  Accepted for a dev tool, scoped as narrowly as the policy allows.
- **Memory.** Each preview is a full renderer process; the 8-per-session cap
  bounds it per session but not per app.
- **Restored tabs can point at dead servers.** Handled by the in-tab failure
  notice, not by blocking startup.
- **Two windows on one session** would both try to parent the same view; a view
  can have one parent, so the last writer wins. Accepted, documented, matching
  the terminal spec's stance.
- **Dev-server binding.** A server bound only to `::1` or a LAN address is
  reachable only if it passes the local policy; a server behind a tunnel with a
  public hostname is deliberately out of scope.

## 11. Open questions

None blocking. Deferred deliberately: DevTools, back/forward and history UI,
page-title labels, address autocomplete, preview-scoped script injection,
tunneled/public URLs, and a preview surface outside the right panel.
