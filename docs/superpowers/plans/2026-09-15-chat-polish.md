# Chat Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close five chat-area gaps vs Cursor 3: paste/drag-drop images, transcript thumbnails, message actions, session mode selector, working-status + usage display.

**Spec:** docs/superpowers/specs/2026-09-15-chat-polish-design.md

## Global Constraints

- TDD: failing test first, watch it fail, implement, watch it pass, commit.
- Vitest; component tests start with `// @vitest-environment jsdom` + explicit `afterEach(cleanup)`.
- `npm test`, `npm run typecheck`, `npm run build` green after every task.
- No new runtime dependencies.
- New params optional with defaults; existing call sites keep working.
- Full attachment bytes NEVER reach transcript events; only `{name, mimeType, thumb?}` (thumb = downscaled JPEG data URL, max 512px).
- Run from `/Volumes/Storage/Projects/relay`. Commit after each task with `git add -A`.

**User decisions (binding):** edit & resend restores TEXT ONLY; usage shows as a transcript status line; mode selector = chips in the Composer.

---

### Task 1: Paste & drag-drop images in Composer + chip thumbnails

**Files:**
- Create: `src/renderer/attachments.ts`
- Modify: `src/renderer/Composer.tsx`
- Modify: `src/renderer/styles.css`
- Test: `tests/attachments.test.ts` (create), `tests/composer.test.tsx` (append)

**Current state (do not break):** `Composer` props `{disabled, working, onSend(text, attachments?), onCancel, queued?, onQueue?, onRemoveQueued?, commands?, cwd?}`. The `+` button calls `window.relay.pickImages()` and appends to `attachments` state. Chips render in `.msg-attachments`-like row with remove buttons keyed `` `${index}-${a.name}` ``. `src/main/attachments.ts` exports `MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024` and `readAttachment`.

**Interfaces produced:**
- `readImageFiles(files: ArrayLike<File>, maxBytes?: number): Promise<PromptAttachment[]>` in `src/renderer/attachments.ts`. Filters to `file.type.startsWith("image/")` and `file.size <= maxBytes` (default `MAX_ATTACHMENT_BYTES` imported from `../shared/attachments.ts`); reads each via `FileReader.readAsDataURL`; returns `{name: file.name, mimeType: file.type, data: <base64 part after the comma>}`. Files that fail to read are skipped.
- `src/shared/attachments.ts` (new): `export const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024;`. `src/main/attachments.ts` must re-export from it (`export { MAX_ATTACHMENT_BYTES } from "../shared/attachments.ts";` and remove its own constant) so the value is not duplicated. Adjust its internal import.

**Composer changes:**
- Add `async function addFiles(files: ArrayLike<File> | File[])` inside Composer: `const picked = await readImageFiles(files); if (picked.length) setAttachments(prev => [...prev, ...picked]);`
- The existing `+` button handler should stay, and if `pickImages` results are appended in place, keep that behavior.
- Textarea: add `onPaste` handler — `const files = Array.from(e.clipboardData?.files ?? [])`; if any, `e.preventDefault(); void addFiles(files);` (text-only paste must still work — only preventDefault when files present).
- Wrap the composer card (`div` with className containing `composer-card`): add `onDragOver={(e) => { if (e.dataTransfer.types.includes("Files")) e.preventDefault(); }}` and `onDrop={(e) => { const files = Array.from(e.dataTransfer.files ?? []); if (files.length) { e.preventDefault(); void addFiles(files); } }}`.
- Chips: render an `<img className="attach-thumb" src={`data:${a.mimeType};base64,${a.data}`} alt={a.name} />` before the name text in each attachment chip (keep name text + remove button).

**styles.css additions:**
```css
.attach-thumb {
  width: 20px;
  height: 20px;
  object-fit: cover;
  border-radius: var(--radius-sm);
  flex-shrink: 0;
}
```

**Steps:**
1. Write failing tests: `tests/attachments.test.ts` — `readImageFiles` filters non-images, skips oversize, returns base64 without the `data:...;base64,` prefix (use `new File([bytes], "a.png", { type: "image/png" })`; jsdom supports FileReader). Append to `tests/composer.test.tsx`: pasting an image File onto the textarea adds an attachment chip with a thumbnail `img` (find via `container.querySelector(".attach-thumb")`); drop does the same via `fireEvent.drop` with `dataTransfer: { files: [file], types: ["Files"] }`; text-only paste does NOT add chips and is not prevented (assert `defaultPrevented === false` by passing `clipboardData` without files).
2. Run, watch RED.
3. Implement `src/shared/attachments.ts`, `src/renderer/attachments.ts`, Composer + CSS changes.
4. Run, watch GREEN; run full suite + typecheck + build.
5. Commit: `git add -A && git commit -m "Paste and drag-drop images into the composer with thumbnail chips"`

---

### Task 2: Transcript thumbnails

**Files:**
- Modify: `src/shared/types.ts` (`PromptAttachment` gains `thumb?: string`)
- Create: `src/renderer/thumbs.ts`
- Modify: `src/renderer/Composer.tsx`
- Modify: `src/main/session-manager.ts` (`attachmentMeta` keeps `thumb`)
- Modify: `src/renderer/Transcript.tsx` (user branch renders thumb)
- Modify: `src/renderer/styles.css`
- Test: `tests/thumbs.test.ts` (create), `tests/transcript-render.test.tsx` (append), `tests/session-manager.test.ts` (append)

**Interfaces:**
- `src/renderer/thumbs.ts`:
```ts
export async function makeThumb(dataUrl: string, maxSize = 512): Promise<string | undefined> {
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("image load failed"));
      img.src = dataUrl;
    });
    const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return undefined;
    ctx.drawImage(img, 0, 0, w, h);
    return canvas.toDataURL("image/jpeg", 0.8);
  } catch {
    return undefined;
  }
}
```
- `withThumbs(attachments: PromptAttachment[]): Promise<PromptAttachment[]>` — maps each attachment to `{...a, thumb: await makeThumb(`data:${a.mimeType};base64,${a.data}`)}` (sequential `for` loop is fine).

**Composer change:** in `submit()`'s non-working branch, before calling `onSend` with attachments: `const outgoing = await withThumbs(attachments);` then send `outgoing` (keep single-arg `onSend(value)` when no attachments). Clear state after send as today.

**session-manager change:** `attachmentMeta` becomes `{ name: a.name, mimeType: a.mimeType, ...(a.thumb ? { thumb: a.thumb } : {}) }` — still never includes `data`.

**Transcript change:** in the user branch's attachments map, when `a.thumb` exists render `<img className="msg-thumb" src={a.thumb} alt={a.name} />` before the name.

**styles.css:**
```css
.msg-thumb {
  width: 20px;
  height: 20px;
  object-fit: cover;
  border-radius: var(--radius-sm);
  flex-shrink: 0;
}
```

**Steps:**
1. Failing tests: `tests/thumbs.test.ts` — `makeThumb` returns `undefined` when the image fails to load (jsdom: `img.src = "data:invalid"` fires onerror; if jsdom never fires, instead test that a canvas-unavailable path returns undefined — choose the assertion that reliably fails before implementation and passes after; document in report). `tests/transcript-render.test.tsx` — user event with `attachments: [{name: "a.png", mimeType: "image/png", thumb: "data:image/jpeg;base64,xyz"}]` renders `img.msg-thumb` with that src; without thumb no img. `tests/session-manager.test.ts` — user transcript event stores `thumb` but NOT `data` (send with an attachment `{name, mimeType, data: "QQ==", thumb: "data:image/jpeg;base64,xyz"}`, inspect stored user event payload).
2. RED → implement → GREEN → full suite/typecheck/build → commit `"Show image thumbnails in the transcript"`.

---

### Task 3: Message actions (copy agent message, edit & resend user text)

**Files:**
- Modify: `src/renderer/Transcript.tsx`
- Modify: `src/renderer/Composer.tsx` (add `inject` prop)
- Modify: `src/renderer/App.tsx`
- Modify: `src/renderer/styles.css`
- Test: `tests/transcript-render.test.tsx` (append), `tests/composer.test.tsx` (append)

**Interfaces:**
- `Transcript` gains optional prop `onEditUser?: (text: string) => void`.
- `Composer` gains optional prop `inject?: { text: string; nonce: number }`; effect `useEffect(() => { if (inject) { setText(inject.text); setDismissed(false); field.current?.focus(); } }, [inject?.nonce]);`

**Transcript changes (EventRow):**
- Wrap `.msg.agent` content: add a hover-revealed action row. Agent message gets a `.msg-actions` div with a `button.msg-action` (aria-label "Copy message") calling `void navigator.clipboard?.writeText(String(event.payload.text ?? ""))`. User message gets the same wrapper with a `button.msg-action` (aria-label "Edit message") calling `onEditUser?.(String(event.payload.text ?? ""))` — only render the edit button when `onEditUser` is provided.
- Actions are absolutely positioned top-right of the message, visible on `.msg:hover .msg-actions`.

**App change:** state `const [inject, setInject] = useState<{ text: string; nonce: number } | undefined>()`; pass `onEditUser={(text) => setInject({ text, nonce: Date.now() })}` to Transcript and `inject={inject}` to Composer. (Composer is keyed by `selected.id`, so inject only needs to fire within the current session.)

**styles.css:**
```css
.msg.user, .msg.agent { position: relative; }
.msg-actions {
  position: absolute;
  top: -10px;
  right: 4px;
  display: none;
  gap: 2px;
}
.msg:hover .msg-actions { display: inline-flex; }
.msg-action {
  height: 20px;
  padding: 0 6px;
  font-size: var(--font-size-xs);
  color: var(--muted);
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  cursor: pointer;
}
.msg-action:hover { background: var(--hover); }
```

**Steps:**
1. Failing tests: transcript-render — agent message exposes "Copy message" button that writes `payload.text` via mocked `navigator.clipboard.writeText`; user message exposes "Edit message" button calling `onEditUser` with the text; no edit button when `onEditUser` omitted. composer — passing a new `inject` object sets the textarea value and focuses it.
2. RED → implement → GREEN → full suite/typecheck/build → commit `"Add copy and edit-resend message actions"`.

---

### Task 4: Session mode selector (composer chips)

**Files:**
- Modify: `src/shared/types.ts` (`SessionModeLike { id: string; name?: string; description?: string }`; `Session` gains `modes?: SessionModeLike[]; currentModeId?: string`)
- Modify: `src/main/acp-session.ts` (capture `modes` from newSession/loadSession response; add `async setMode(modeId: string)` calling `connection.setSessionMode({ sessionId, modeId })`)
- Modify: `src/main/session-manager.ts` (`attach` patches `{modes, currentModeId}` from start result; `handleUpdate` handles `current_mode_update` → `this.patch(sessionId, { currentModeId: update.currentModeId })`; public `async setMode(sessionId, modeId)` → `this.live.get(sessionId)?.setMode(modeId)`)
- Modify: `src/main/index.ts` (`relay:setMode` handler)
- Modify: `src/preload/index.ts` + `src/renderer/env.d.ts` (`setMode(sessionId, modeId)`)
- Modify: `src/renderer/Composer.tsx` (props `modes?: SessionModeLike[]`, `currentModeId?: string`, `onSetMode?: (modeId: string) => void`; chips row)
- Modify: `src/renderer/App.tsx` (wire `modes={selected.modes}` etc.)
- Modify: `agents/fake-acp-agent.mjs` (newSession/loadSession return `modes: { availableModes: [{id:"build",name:"Build"},{id:"plan",name:"Plan"}], currentModeId: "build" }`; handle `session/setMode` request → broadcast `current_mode_update` then respond `{}`)
- Modify: `src/renderer/styles.css`
- Test: `tests/mode.test.ts` (create; acp-session + session-manager against fake agent), `tests/composer.test.tsx` (append chips tests)

**Composer chips:** when `modes.length > 1`, render a `.mode-row` above the input: one `button.mode-chip` per mode (aria-pressed when `id === currentModeId`, label = `name ?? id`), onClick `onSetMode?.(mode.id)`.

**styles.css:**
```css
.mode-row { display: flex; gap: var(--space-1); padding: var(--space-1-5) var(--space-2) 0; }
.mode-chip {
  height: var(--height-xs);
  padding: 0 var(--space-2);
  font-size: var(--font-size-xs);
  color: var(--muted);
  background: transparent;
  border: 1px solid var(--line);
  border-radius: 999px;
  cursor: pointer;
}
.mode-chip[aria-pressed="true"] { color: var(--text); background: var(--hover); border-color: var(--muted); }
```

**Steps:**
1. Failing tests: `tests/mode.test.ts` — creating a session against the fake agent yields `session.modes` with build/plan and `currentModeId: "build"`; `manager.setMode(id, "plan")` results in the session's `currentModeId` becoming `"plan"` (after the `current_mode_update` notification round-trips). composer — chips render when `modes` has >1 entries, active has aria-pressed, click calls `onSetMode`; no row when ≤1 mode.
2. RED → implement → GREEN → full suite/typecheck/build → commit `"Add session mode selector to the composer"`.

---

### Task 5: Working status + usage line

**Files:**
- Modify: `src/main/transcript.ts` (handle `usage_update` → `usage` event; replace-last when last event is `usage`)
- Modify: `src/shared/types.ts` (kind `"usage"` added)
- Create: `src/renderer/format.ts` (`formatTokens(n)`)
- Modify: `src/renderer/Transcript.tsx` (render usage line)
- Create: `src/renderer/WorkingStatus.tsx` + wire into `App.tsx` thread-head
- Modify: `src/renderer/styles.css`
- Test: `tests/transcript.test.ts` (append), `tests/format.test.ts` (create), `tests/transcript-render.test.tsx` (append), `tests/working-status.test.tsx` (create)

**Reducer:** on `usage_update`, sanitize `{ used, size, costAmount: update.cost?.amount, costCurrency: update.cost?.currency }` (numbers only, ignore non-numbers); if last event kind is `usage`, replace in place (keep id); else append `{ kind: "usage", payload: {...} }`.

**format.ts:**
```ts
export function formatTokens(n: number): string {
  if (n < 1000) return String(n);
  return `${(n / 1000).toFixed(1)}k`;
}
export function formatUsage(p: { used?: number; size?: number; costAmount?: number; costCurrency?: string }): string {
  const parts: string[] = [];
  if (typeof p.used === "number" && typeof p.size === "number") parts.push(`${formatTokens(p.used)} / ${formatTokens(p.size)} tokens`);
  else if (typeof p.used === "number") parts.push(`${formatTokens(p.used)} tokens`);
  if (typeof p.costAmount === "number") parts.push(`${p.costCurrency ?? "$"}${p.costAmount.toFixed(4)}`);
  return parts.join(" · ");
}
```

**Transcript:** `usage` kind renders `<div className="msg usage">{formatUsage(payload)}</div>`; empty string renders nothing. CSS: `.msg.usage { color: var(--faint); font-size: var(--font-size-xs); }`.

**WorkingStatus.tsx:**
```tsx
import { useEffect, useState } from "react";

export function WorkingStatus({ status, since }: { status: string; since?: number }) {
  const [, force] = useState(0);
  useEffect(() => {
    if (status !== "working" || !since) return;
    const t = setInterval(() => force((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [status, since]);
  if (status !== "working") return null;
  const secs = since ? Math.max(0, Math.floor((Date.now() - since) / 1000)) : 0;
  return <span className="thread-status">Working · {secs}s</span>;
}
```
**App:** in `.thread-head`, render `<WorkingStatus status={selected.status} since={selected.lastPromptAt} />` after `.thread-name`. CSS: `.thread-status { flex-shrink: 0; color: var(--working); font-size: var(--font-size-sm); }`.

**Steps:**
1. Failing tests: reducer produces usage event + replaces previous usage; `formatTokens`/`formatUsage` cases (used+size, used only, with cost, empty); transcript renders the usage line; WorkingStatus shows "Working · 0s" when working and nothing when idle (pass `since: Date.now()`).
2. RED → implement → GREEN → full suite/typecheck/build → commit `"Show working status and token usage in the chat"`.

---

## Self-review notes

- Spec coverage: all five items map to T1–T5. ✓
- Type consistency: `PromptAttachment.thumb` used by T2's withThumbs/session-manager/Transcript; `SessionModeLike` used by T4 chain; `usage` kind used by T5 reducer+renderer. ✓
- T4's fake agent must also handle `session/setMode` — the SDK client-side `setSessionMode` issues a `session/setMode` request.
