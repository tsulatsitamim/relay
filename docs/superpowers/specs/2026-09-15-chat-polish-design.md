# Chat Polish Design (Cursor 3 chat parity)

**Goal:** Close the five chat-area gaps vs Cursor 3's agent panel: image paste/drag-drop, transcript thumbnails, per-message actions (copy / edit & resend), real session mode selector, and working-status + usage display.

**Non-goals:** message rewind/fork, diff accept/reject, terminal rendering, MCP, notifications.

## Global Constraints

- TDD: failing test first, watch it fail, implement, watch it pass, commit.
- Vitest. Component tests start with `// @vitest-environment jsdom` and call `afterEach(cleanup)` explicitly.
- `npm test`, `npm run typecheck`, `npm run build` green after every task.
- No new runtime dependencies.
- New function/component parameters are optional with defaults; existing call sites keep working.
- Full attachment bytes NEVER reach transcript events; only `{name, mimeType, thumb?}` (thumb = downscaled JPEG data URL, max 512px, ~quality 0.8).
- All commands run from repo root `/Volumes/Storage/Projects/relay`.

## Task summary

1. **Paste & drag-drop images in Composer + chip thumbnails** — renderer helper `readImageFiles`, paste/drop handlers, `<img>` chip preview.
2. **Transcript thumbnails** — `PromptAttachment.thumb?`, canvas downscale before send, `attachmentMeta` keeps thumb, Transcript renders thumb.
3. **Message actions** — copy button on agent messages; Edit button on user messages loads text into the composer via an inject prop.
4. **Mode selector** — ACP `modes` on session record, `relay:setMode` IPC, composer chips, `current_mode_update` handling, fake agent support.
5. **Status + usage** — `usage_update` reducer → `usage` transcript event + render line; `WorkingStatus` elapsed indicator in thread-head.

Details in `docs/superpowers/plans/2026-09-15-chat-polish.md`.
