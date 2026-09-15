# Agent Input Features Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add prompt queueing, `/` slash commands, `@` file context, image attachments, and cheap sidebar list rendering to Relay's chat window.

**Architecture:** Renderer-side queue with per-session flush; ACP `available_commands_update` surfaced as a transcript event feeding a reusable suggestion menu; a new main-process file index for `@` mentions; image content blocks threaded through the existing text-only prompt path with backward-compatible defaults; CSS `content-visibility` for list cost.

**Tech Stack:** Electron, React 19, TypeScript, Vitest (jsdom for components), `@agentclientprotocol/sdk` 0.14.1 (supports `ContentBlock` images).

**Spec:** `docs/superpowers/specs/2026-09-15-agent-input-features-design.md`

## Global Constraints

- TDD: failing test first, watch it fail, implement, watch it pass, commit.
- Vitest. Component tests begin with `// @vitest-environment jsdom` and call `afterEach(cleanup)` explicitly.
- `npm test`, `npm run typecheck`, `npm run build` stay green after every task.
- No new runtime dependencies.
- New function parameters default so existing call sites keep working.
- Do not send attachment bytes back to the renderer for display; store names/mimeTypes only.
- All shell commands run from the worktree root.

---

### Task 1: Queue prompts while the agent is working

**Files:**
- Create: `src/renderer/queue.ts`
- Create: `tests/queue.test.ts`
- Modify: `src/renderer/Composer.tsx`
- Modify: `src/renderer/App.tsx`
- Modify: `src/renderer/styles.css`
- Test: `tests/composer.test.tsx`

**Interfaces:**
- Produces: `nextQueued(queue: string[], status: string): string | null`.
- Produces: `Composer` props `queued?: string[]`, `onQueue?: (text: string) => void`, `onRemoveQueued?: (index: number) => void`.
- Consumes: existing `Composer` props `disabled`, `working`, `onSend`, `onCancel`.

- [ ] **Step 1: Write the failing test for `nextQueued`**

```ts
// tests/queue.test.ts
import { describe, expect, it } from "vitest";
import { nextQueued } from "../src/renderer/queue.ts";

describe("nextQueued", () => {
  it("returns nothing when the queue is empty", () => {
    expect(nextQueued([], "idle")).toBeNull();
  });

  it("returns the head when the session is idle", () => {
    expect(nextQueued(["second", "third"], "idle")).toBe("second");
  });

  it("holds the queue while the session is working", () => {
    expect(nextQueued(["second"], "working")).toBeNull();
  });

  it("holds the queue when the session errored or exited", () => {
    expect(nextQueued(["second"], "error")).toBeNull();
    expect(nextQueued(["second"], "exited")).toBeNull();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run tests/queue.test.ts`
Expected: FAIL — cannot resolve `../src/renderer/queue.ts`.

- [ ] **Step 3: Implement `queue.ts`**

```ts
// src/renderer/queue.ts
export function nextQueued(queue: string[], status: string): string | null {
  if (queue.length === 0) return null;
  return status === "idle" ? queue[0] : null;
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `npx vitest run tests/queue.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Write failing Composer tests for queueing**

Append to `tests/composer.test.tsx`:

```tsx
it("enqueues instead of sending while working", () => {
  const onSend = vi.fn();
  const onQueue = vi.fn();
  render(
    <Composer
      disabled={false}
      working
      onSend={onSend}
      onCancel={noop}
      onQueue={onQueue}
    />,
  );
  const box = screen.getByRole("textbox");
  fireEvent.change(box, { target: { value: "queue me" } });
  fireEvent.keyDown(box, { key: "Enter" });
  expect(onQueue).toHaveBeenCalledWith("queue me");
  expect(onSend).not.toHaveBeenCalled();
});

it("renders queued chips with a remove control", () => {
  const onRemoveQueued = vi.fn();
  render(
    <Composer
      disabled={false}
      working={false}
      onSend={vi.fn()}
      onCancel={noop}
      queued={["first", "second"]}
      onRemoveQueued={onRemoveQueued}
    />,
  );
  expect(screen.getByText("first")).toBeTruthy();
  fireEvent.click(screen.getAllByLabelText("Remove queued message")[1]);
  expect(onRemoveQueued).toHaveBeenCalledWith(1);
});
```

- [ ] **Step 6: Run and watch them fail**

Run: `npx vitest run tests/composer.test.tsx`
Expected: FAIL — `onQueue` never called; queued chips absent.

- [ ] **Step 7: Implement Composer queueing**

In `src/renderer/Composer.tsx`:
- Extend `Props` with `queued?: string[]`, `onQueue?: (text: string) => void`, `onRemoveQueued?: (index: number) => void`; destructure with defaults (`queued = []`).
- Replace `const canSend = Boolean(text.trim()) && !disabled && !working;` with
  `const canSubmit = Boolean(text.trim()) && !disabled;` and keep the orb logic but drive the send/mic state from `canSubmit` instead of `canSend`.
- In `submit()`: after computing `value` and the guard, branch:

```ts
if (working) {
  onQueue?.(value);
  setText("");
  return;
}
setText("");
void onSend(value);
```

- In the Enter handler, keep `if (e.key !== "Enter" || e.shiftKey) return; e.preventDefault(); void submit();`.
- Render queued chips above the textarea, inside the dock:

```tsx
{queued.length > 0 ? (
  <div className="composer-queued">
    {queued.map((item, index) => (
      <span className="queued-chip" key={`${index}-${item}`}>
        <span className="queued-text">{item}</span>
        <button
          className="queued-remove"
          aria-label="Remove queued message"
          onClick={() => onRemoveQueued?.(index)}
        >
          ×
        </button>
      </span>
    ))}
  </div>
) : null}
```

- [ ] **Step 8: Run Composer tests**

Run: `npx vitest run tests/composer.test.tsx tests/queue.test.ts`
Expected: PASS.

- [ ] **Step 9: Wire the queue into `App.tsx`**

- Add state: `const [queued, setQueued] = useState<Record<string, string[]>>({});`
  and a ref: `const flushing = useRef<Set<string>>(new Set());`
- Add helpers near `sendToSession`:

```ts
const enqueue = (sessionId: string, text: string) => {
  setQueued((prev) => ({
    ...prev,
    [sessionId]: [...(prev[sessionId] ?? []), text],
  }));
};

const removeQueued = (sessionId: string, index: number) => {
  setQueued((prev) => ({
    ...prev,
    [sessionId]: (prev[sessionId] ?? []).filter((_, i) => i !== index),
  }));
};
```

- Add the flush effect (after `sendToSession` is defined):

```ts
useEffect(() => {
  for (const session of state.sessions) {
    const next = nextQueued(queued[session.id] ?? [], session.status);
    if (!next || flushing.current.has(session.id)) continue;
    flushing.current.add(session.id);
    setQueued((prev) => ({
      ...prev,
      [session.id]: (prev[session.id] ?? []).slice(1),
    }));
    void sendToSession(session.id, next).finally(() => {
      flushing.current.delete(session.id);
    });
  }
}, [state.sessions, queued]);
```

- Import `nextQueued` from `./queue`.
- Change the Composer render so typing stays enabled while working:
  `disabled={busy}` (drop `composerLocked`), keep `working={composerLocked}`, and add
  `queued={queued[selected.id] ?? []}`, `onQueue={(text) => enqueue(selected.id, text)}`,
  `onRemoveQueued={(index) => removeQueued(selected.id, index)}`.

- [ ] **Step 10: Add styles**

Append to `src/renderer/styles.css`:

```css
.composer-queued {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1);
  padding: var(--space-1-5) var(--space-2) 0;
}

.queued-chip {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  max-width: 100%;
  padding: 2px var(--space-1-5);
  border-radius: var(--radius-sm);
  background: var(--hover);
  color: var(--muted);
  font-size: var(--font-size-xs);
}

.queued-text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.queued-remove {
  border: none;
  background: transparent;
  color: var(--faint);
  cursor: pointer;
  line-height: 1;
  padding: 0 2px;
}

.queued-remove:hover {
  color: var(--text);
}
```

- [ ] **Step 11: Full verification**

Run: `npm test && npm run typecheck && npm run build`
Expected: all green.

- [ ] **Step 12: Commit**

```bash
git add -A
git commit -m "Queue prompts while an agent is working"
```

---

### Task 2: Slash commands from `available_commands_update`

**Files:**
- Modify: `src/shared/types.ts`
- Modify: `src/main/transcript.ts`
- Modify: `src/renderer/Transcript.tsx`
- Create: `src/renderer/SuggestionMenu.tsx`
- Create: `tests/suggestion-menu.test.tsx`
- Modify: `src/renderer/Composer.tsx`
- Modify: `src/renderer/App.tsx`
- Modify: `agents/fake-acp-agent.mjs`
- Test: `tests/transcript.test.ts`, `tests/composer.test.tsx`

**Interfaces:**
- Consumes from Task 1: `Composer` props and `queue.ts`.
- Produces: `AvailableCommandLike = { name: string; description: string; inputHint?: string }` in `src/shared/types.ts`.
- Produces: `TranscriptEvent.kind` includes `"commands"`.
- Produces: `SuggestionMenu` props `{ items: Suggestion[]; activeIndex: number; onPick: (index: number) => void }` where
  `Suggestion = { id: string; label: string; detail?: string }`.
- Produces: `Composer` prop `commands?: AvailableCommandLike[]`.

- [ ] **Step 1: Write failing reducer tests**

Append to `tests/transcript.test.ts`:

```ts
it("records available commands as a replaceable event", () => {
  let events = reduceSessionUpdate([], {
    sessionUpdate: "available_commands_update",
    availableCommands: [
      { name: "init", description: "Create AGENTS.md" },
      { name: "review", description: "Review the diff" },
    ],
  }, nextId());
  const first = events[events.length - 1];
  expect(first.kind).toBe("commands");
  expect(first.payload.commands).toEqual([
    { name: "init", description: "Create AGENTS.md" },
    { name: "review", description: "Review the diff" },
  ]);

  events = reduceSessionUpdate(events, {
    sessionUpdate: "available_commands_update",
    availableCommands: [{ name: "init", description: "Create AGENTS.md" }],
  }, nextId());
  const commands = events.filter((event) => event.kind === "commands");
  expect(commands).toHaveLength(1);
  expect(commands[0].payload.commands).toEqual([
    { name: "init", description: "Create AGENTS.md" },
  ]);
});
```

(Match the file's existing helper for producing ids; if it uses a local `nextId` closure, reuse that pattern instead.)

- [ ] **Step 2: Run and watch it fail**

Run: `npx vitest run tests/transcript.test.ts`
Expected: FAIL — no `commands` event produced.

- [ ] **Step 3: Add the shared type and reducer branch**

In `src/shared/types.ts`:

```ts
export type AvailableCommandLike = {
  name: string;
  description: string;
  inputHint?: string;
};
```

Add `| "commands"` to the `TranscriptEvent.kind` union.

In `src/main/transcript.ts`, add a branch before the final `return events;`:

```ts
if (kind === "available_commands_update") {
  const commands = commandsFrom(update.availableCommands);
  const event: TranscriptEvent = {
    id: nextId(),
    kind: "commands",
    payload: { commands },
  };
  const last = events[events.length - 1];
  if (last && last.kind === "commands") {
    return [...events.slice(0, -1), { ...last, payload: event.payload }];
  }
  return [...events, event];
}
```

And the sanitizer (next to `planEntries`):

```ts
function commandsFrom(raw: unknown): AvailableCommandLike[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const record = entry as Record<string, unknown>;
    const name = typeof record.name === "string" ? record.name : "";
    if (!name) return [];
    const description =
      typeof record.description === "string" ? record.description : "";
    const hintSource = record.input as { hint?: unknown } | undefined;
    const inputHint =
      hintSource && typeof hintSource.hint === "string"
        ? hintSource.hint
        : undefined;
    return [{ name, description, ...(inputHint ? { inputHint } : {}) }];
  });
}
```

Import `AvailableCommandLike` alongside the existing types.

- [ ] **Step 4: Run and watch it pass**

Run: `npx vitest run tests/transcript.test.ts`
Expected: PASS.

- [ ] **Step 5: Suppress commands events in the transcript**

In `src/renderer/Transcript.tsx` `EventRow`, add before the fallback branches:

```tsx
if (event.kind === "commands") return null;
```

- [ ] **Step 6: Write failing SuggestionMenu tests**

```tsx
// tests/suggestion-menu.test.tsx
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { SuggestionMenu } from "../src/renderer/SuggestionMenu.tsx";

afterEach(cleanup);

describe("SuggestionMenu", () => {
  it("renders labels and details", () => {
    render(
      <SuggestionMenu
        items={[
          { id: "init", label: "/init", detail: "Create AGENTS.md" },
          { id: "review", label: "/review", detail: "Review the diff" },
        ]}
        activeIndex={0}
        onPick={() => {}}
      />,
    );
    expect(screen.getByText("/init")).toBeTruthy();
    expect(screen.getByText("Create AGENTS.md")).toBeTruthy();
  });

  it("reports the picked index on click", () => {
    const onPick = vi.fn();
    render(
      <SuggestionMenu
        items={[
          { id: "init", label: "/init" },
          { id: "review", label: "/review" },
        ]}
        activeIndex={0}
        onPick={onPick}
      />,
    );
    fireEvent.click(screen.getByText("/review"));
    expect(onPick).toHaveBeenCalledWith(1);
  });
});
```

- [ ] **Step 7: Run and watch it fail**

Run: `npx vitest run tests/suggestion-menu.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 8: Implement SuggestionMenu**

```tsx
// src/renderer/SuggestionMenu.tsx
export type Suggestion = { id: string; label: string; detail?: string };

type Props = {
  items: Suggestion[];
  activeIndex: number;
  onPick: (index: number) => void;
};

export function SuggestionMenu({ items, activeIndex, onPick }: Props) {
  if (items.length === 0) return null;
  return (
    <div className="suggest" role="listbox">
      {items.map((item, index) => (
        <button
          key={item.id}
          type="button"
          role="option"
          aria-selected={index === activeIndex}
          className={`suggest-item ${index === activeIndex ? "active" : ""}`}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onPick(index)}
        >
          <span className="suggest-label">{item.label}</span>
          {item.detail ? <span className="suggest-detail">{item.detail}</span> : null}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 9: Write failing Composer slash tests**

Append to `tests/composer.test.tsx`:

```tsx
it("offers slash commands and picks one", () => {
  const onSend = vi.fn();
  render(
    <Composer
      disabled={false}
      working={false}
      onSend={onSend}
      onCancel={noop}
      commands={[
        { name: "init", description: "Create AGENTS.md" },
        { name: "review", description: "Review the diff" },
      ]}
    />,
  );
  const box = screen.getByRole("textbox") as HTMLTextAreaElement;
  fireEvent.change(box, { target: { value: "/in" } });
  expect(screen.getByText("/init")).toBeTruthy();
  fireEvent.keyDown(box, { key: "Enter" });
  expect(box.value).toBe("/init ");
  expect(onSend).not.toHaveBeenCalled();
});
```

- [ ] **Step 10: Run and watch it fail**

Run: `npx vitest run tests/composer.test.tsx`
Expected: FAIL — no menu.

- [ ] **Step 11: Implement slash menu in Composer**

- Extend `Props` with `commands?: AvailableCommandLike[]` (default `[]`).
- Derive the open state and items:

```ts
const slashMatch = /^\/([^\s\n]*)$/.exec(text);
const slashItems = slashMatch
  ? commands
      .filter((c) => c.name.toLowerCase().includes(slashMatch[1].toLowerCase()))
      .map((c) => ({ id: c.name, label: `/${c.name}`, detail: c.description }))
  : [];
const [activeIndex, setActiveIndex] = useState(0);
const menuOpen = slashItems.length > 0;
```

- Reset `activeIndex` to 0 whenever the query text changes (`useEffect` on `text`).
- In `onKeyDown`, when `menuOpen`:

```ts
if (e.key === "ArrowDown") { e.preventDefault(); setActiveIndex((i) => (i + 1) % slashItems.length); return; }
if (e.key === "ArrowUp") { e.preventDefault(); setActiveIndex((i) => (i - 1 + slashItems.length) % slashItems.length); return; }
if (e.key === "Enter") { e.preventDefault(); pickSlash(activeIndex); return; }
if (e.key === "Escape") { e.preventDefault(); setText(""); return; }
```

- `pickSlash(index)` sets `setText(\`/${slashItems[index].id} \`)`.
- Render `<SuggestionMenu items={slashItems} activeIndex={activeIndex} onPick={pickSlash} />` above the input when `menuOpen`.

- [ ] **Step 12: Wire commands from App**

In `src/renderer/App.tsx`, derive from the selected session's transcript:

```ts
const commands = (() => {
  if (!selected) return [];
  const events = state.transcripts[selected.id] ?? [];
  for (let i = events.length - 1; i >= 0; i--) {
    if (events[i].kind === "commands") {
      return (events[i].payload.commands as AvailableCommandLike[]) ?? [];
    }
  }
  return [];
})();
```

Pass `commands={commands}` to `Composer`.

- [ ] **Step 13: Emit commands from the fake agent**

In `agents/fake-acp-agent.mjs`, add a `COMMANDS` keyword branch next to `RICH` that calls the session update:

```js
await sessionUpdate({
  sessionUpdate: "available_commands_update",
  availableCommands: [
    { name: "init", description: "Create AGENTS.md" },
    { name: "review", description: "Review the diff" },
  ],
});
```

(Use the same update-sending helper the `RICH` branch uses.)

- [ ] **Step 14: Add styles + full verification**

Append `.suggest`, `.suggest-item`, `.suggest-item.active`, `.suggest-label`, `.suggest-detail` to `styles.css` (mirror the existing `.tool-*` visual language: card background, `--line` border, `--radius-sm`).

Run: `npm test && npm run typecheck && npm run build`
Expected: all green.

- [ ] **Step 15: Commit**

```bash
git add -A
git commit -m "Add slash command suggestions from ACP capabilities"
```

---

### Task 3: `@` file context

**Files:**
- Create: `src/main/file-index.ts`
- Create: `tests/file-index.test.ts`
- Modify: `src/main/index.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/env.d.ts`
- Modify: `src/renderer/Composer.tsx`
- Modify: `src/renderer/App.tsx`
- Test: `tests/composer.test.tsx`

**Interfaces:**
- Consumes from Task 2: `SuggestionMenu`, `Composer` `commands` prop.
- Produces: `shouldIgnore(name: string): boolean`.
- Produces: `listFiles(cwd: string, opts?: { limit?: number; maxDepth?: number }): string[]`.
- Produces: `window.relay.listFiles(cwd: string): Promise<string[]>`.
- Produces: `Composer` prop `cwd?: string`.

- [ ] **Step 1: Write failing file-index tests**

```ts
// tests/file-index.test.ts
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { listFiles, shouldIgnore } from "../src/main/file-index.ts";

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function fixture(): string {
  const root = mkdtempSync(join(tmpdir(), "relay-files-"));
  dirs.push(root);
  writeFileSync(join(root, "README.md"), "hi");
  mkdirSync(join(root, "src"));
  writeFileSync(join(root, "src", "index.ts"), "");
  mkdirSync(join(root, "node_modules"));
  writeFileSync(join(root, "node_modules", "pkg.js"), "");
  mkdirSync(join(root, ".git"));
  writeFileSync(join(root, ".git", "config"), "");
  writeFileSync(join(root, ".env"), "SECRET=1");
  return root;
}

describe("shouldIgnore", () => {
  it("ignores dependency, vcs, and dotted entries", () => {
    expect(shouldIgnore("node_modules")).toBe(true);
    expect(shouldIgnore(".git")).toBe(true);
    expect(shouldIgnore(".env")).toBe(true);
    expect(shouldIgnore("src")).toBe(false);
  });
});

describe("listFiles", () => {
  it("lists files as relative posix paths and skips ignored trees", () => {
    const files = listFiles(fixture());
    expect(files).toContain("README.md");
    expect(files).toContain("src/index.ts");
    expect(files).not.toContain("node_modules/pkg.js");
    expect(files).not.toContain(".git/config");
    expect(files).not.toContain(".env");
  });

  it("honors the limit", () => {
    expect(listFiles(fixture(), { limit: 1 })).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `npx vitest run tests/file-index.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement file-index**

```ts
// src/main/file-index.ts
import { readdirSync } from "node:fs";
import { join, posix } from "node:path";

const IGNORED = new Set([
  "node_modules",
  ".git",
  ".worktrees",
  "out",
  "dist",
  "build",
  ".next",
  ".turbo",
  "coverage",
  ".superpowers",
]);

export function shouldIgnore(name: string): boolean {
  return name.startsWith(".") || IGNORED.has(name);
}

export function listFiles(
  cwd: string,
  opts: { limit?: number; maxDepth?: number } = {},
): string[] {
  const limit = opts.limit ?? 200;
  const maxDepth = opts.maxDepth ?? 6;
  const files: string[] = [];

  const walk = (dir: string, prefix: string, depth: number) => {
    if (depth > maxDepth || files.length >= limit) return;
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (files.length >= limit) return;
      if (shouldIgnore(entry.name)) continue;
      const relative = prefix ? posix.join(prefix, entry.name) : entry.name;
      if (entry.isDirectory()) walk(join(dir, entry.name), relative, depth + 1);
      else if (entry.isFile()) files.push(relative);
    }
  };

  walk(cwd, "", 1);
  return files.sort();
}
```

- [ ] **Step 4: Run and watch it pass**

Run: `npx vitest run tests/file-index.test.ts`
Expected: PASS.

- [ ] **Step 5: Add the IPC + preload + types**

`src/main/index.ts` (next to `relay:pickDirectory`):

```ts
ipcMain.handle("relay:listFiles", (_e, cwd: string) => {
  if (!cwd) return [];
  return listFiles(cwd);
});
```

`src/preload/index.ts`:

```ts
listFiles: (cwd: string): Promise<string[]> => ipcRenderer.invoke("relay:listFiles", cwd),
```

`src/renderer/env.d.ts`: `listFiles: (cwd: string) => Promise<string[]>;`

- [ ] **Step 6: Write failing Composer mention test**

Append to `tests/composer.test.tsx`:

```tsx
it("offers files for an @ token and picks one", async () => {
  const listFiles = vi.fn().mockResolvedValue(["src/index.ts", "README.md"]);
  // @ts-expect-error test shim
  window.relay = { listFiles };
  render(
    <Composer
      disabled={false}
      working={false}
      onSend={vi.fn()}
      onCancel={noop}
      cwd="/tmp/repo"
    />,
  );
  const box = screen.getByRole("textbox") as HTMLTextAreaElement;
  fireEvent.change(box, { target: { value: "look at @ind" } });
  const option = await screen.findByText("src/index.ts");
  fireEvent.click(option);
  expect(box.value).toBe("look at @src/index.ts ");
  expect(listFiles).toHaveBeenCalledWith("/tmp/repo");
});
```

- [ ] **Step 7: Run and watch it fail**

Run: `npx vitest run tests/composer.test.tsx`
Expected: FAIL — no mention menu.

- [ ] **Step 8: Implement the mention menu in Composer**

- Add `cwd?: string` to `Props`.
- Local state `const [files, setFiles] = useState<string[]>([]);`
- Detect the trailing mention token:

```ts
const mentionMatch = /(?:^|\s)@([^\s@]*)$/.exec(text);
const mentionQuery = mentionMatch ? mentionMatch[1] : null;
```

- Effect (debounced) that loads files when a mention token is present:

```ts
useEffect(() => {
  if (mentionQuery === null || !cwd) {
    setFiles([]);
    return;
  }
  const handle = setTimeout(() => {
    void window.relay
      .listFiles(cwd)
      .then((all) =>
        setFiles(
          all
            .filter((file) => file.toLowerCase().includes(mentionQuery.toLowerCase()))
            .slice(0, 8),
        ),
      )
      .catch(() => setFiles([]));
  }, 120);
  return () => clearTimeout(handle);
}, [mentionQuery, cwd]);
```

- `mentionItems = files.map((file) => ({ id: file, label: file }))`.
- Extend the keyboard handler and menu rendering so that when `mentionItems.length > 0`, ArrowUp/Down/Enter/Escape drive `mentionItems`, and Enter picks:

```ts
const pickMention = (index: number) => {
  const file = mentionItems[index].id;
  setText((prev) => prev.replace(/@([^\s@]*)$/, `@${file} `));
};
```

Only one menu is open at a time: show slash menu when `slashItems.length > 0`, else the mention menu.

- [ ] **Step 9: Pass `cwd` from App**

In the `Composer` render, add `cwd={selected.workingDirectory}`.

- [ ] **Step 10: Full verification**

Run: `npm test && npm run typecheck && npm run build`
Expected: all green.

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "Add @ file context menu backed by a file index"
```

---

### Task 4: Image attachments

**Files:**
- Create: `src/main/attachments.ts`
- Create: `tests/attachments.test.ts`
- Modify: `src/shared/types.ts`
- Modify: `src/shared/ipc.ts`
- Modify: `src/main/index.ts`
- Modify: `src/main/acp-session.ts`
- Modify: `src/main/session-manager.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/env.d.ts`
- Modify: `src/renderer/Composer.tsx`
- Modify: `src/renderer/App.tsx`
- Modify: `src/renderer/Transcript.tsx`
- Test: `tests/acp-session.test.ts`, `tests/session-manager.test.ts`, `tests/composer.test.tsx`, `tests/transcript-render.test.tsx`

**Interfaces:**
- Consumes from Task 3: `Composer` `cwd` prop, `window.relay.listFiles`.
- Produces: `PromptAttachment = { name: string; mimeType: string; data: string }`.
- Produces: `promptBlocks(text: string, attachments?: PromptAttachment[]): unknown[]`.
- Produces: `AcpSession.prompt(text: string, attachments?: PromptAttachment[])`.
- Produces: `SessionManager.send(id, text, attachments?)` and `create({ ..., attachments? })`.
- Produces: `window.relay.pickImages(): Promise<PromptAttachment[]>`.
- Produces: `Composer` `onSend: (text: string, attachments?: PromptAttachment[]) => void | Promise<void>`.

- [ ] **Step 1: Write failing attachment tests**

```ts
// tests/attachments.test.ts
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { mimeForExt, readAttachment } from "../src/main/attachments.ts";

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("mimeForExt", () => {
  it("maps common image extensions", () => {
    expect(mimeForExt("png")).toBe("image/png");
    expect(mimeForExt("JPG")).toBe("image/jpeg");
    expect(mimeForExt("webp")).toBe("image/webp");
    expect(mimeForExt("txt")).toBeNull();
  });
});

describe("readAttachment", () => {
  it("reads a file to a base64 attachment", () => {
    const root = mkdtempSync(join(tmpdir(), "relay-att-"));
    dirs.push(root);
    const file = join(root, "shot.png");
    writeFileSync(file, Buffer.from([1, 2, 3]));
    const attachment = readAttachment(file);
    expect(attachment).toEqual({
      name: "shot.png",
      mimeType: "image/png",
      data: Buffer.from([1, 2, 3]).toString("base64"),
    });
  });

  it("returns null for a non-image file", () => {
    const root = mkdtempSync(join(tmpdir(), "relay-att-"));
    dirs.push(root);
    const file = join(root, "notes.txt");
    writeFileSync(file, "hello");
    expect(readAttachment(file)).toBeNull();
  });
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `npx vitest run tests/attachments.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement attachments helper**

```ts
// src/main/attachments.ts
import { readFileSync, statSync } from "node:fs";
import { basename, extname } from "node:path";
import type { PromptAttachment } from "../shared/types.ts";

const MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  bmp: "image/bmp",
  svg: "image/svg+xml",
};

export const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024;

export function mimeForExt(ext: string): string | null {
  return MIME[ext.replace(/^\./, "").toLowerCase()] ?? null;
}

export function readAttachment(filePath: string): PromptAttachment | null {
  const mimeType = mimeForExt(extname(filePath));
  if (!mimeType) return null;
  try {
    if (statSync(filePath).size > MAX_ATTACHMENT_BYTES) return null;
    const data = readFileSync(filePath).toString("base64");
    return { name: basename(filePath), mimeType, data };
  } catch {
    return null;
  }
}
```

Add `PromptAttachment` to `src/shared/types.ts`:

```ts
export type PromptAttachment = {
  name: string;
  mimeType: string;
  data: string;
};
```

- [ ] **Step 4: Run and watch it pass**

Run: `npx vitest run tests/attachments.test.ts`
Expected: PASS.

- [ ] **Step 5: Write failing `promptBlocks` test**

Append to `tests/acp-session.test.ts`:

```ts
it("builds image content blocks for attachments", () => {
  const blocks = promptBlocks("look", [
    { name: "a.png", mimeType: "image/png", data: "AAAA" },
  ]);
  expect(blocks).toEqual([
    { type: "text", text: "look" },
    { type: "image", mimeType: "image/png", data: "AAAA", uri: null },
  ]);
});
```

- [ ] **Step 6: Run and watch it fail**

Run: `npx vitest run tests/acp-session.test.ts`
Expected: FAIL — `promptBlocks` not exported.

- [ ] **Step 7: Implement `promptBlocks` and thread attachments**

In `src/main/acp-session.ts`, add an exported helper and use it in `prompt`:

```ts
export function promptBlocks(
  text: string,
  attachments: PromptAttachment[] = [],
): ContentBlock[] {
  const blocks: ContentBlock[] = [{ type: "text", text }];
  for (const attachment of attachments) {
    blocks.push({
      type: "image",
      mimeType: attachment.mimeType,
      data: attachment.data,
      uri: null,
    });
  }
  return blocks;
}
```

Change `prompt`:

```ts
async prompt(text: string, attachments: PromptAttachment[] = []): Promise<{ stopReason: string }> {
  if (!this.connection || !this.sessionId) {
    throw new Error("session is not started");
  }
  const run = this.connection.prompt({
    sessionId: this.sessionId,
    prompt: promptBlocks(text, attachments),
  });
  // ... unchanged body ...
}
```

Import `ContentBlock` type from the SDK and `PromptAttachment` from shared.

- [ ] **Step 8: Run and watch it pass**

Run: `npx vitest run tests/acp-session.test.ts`
Expected: PASS.

- [ ] **Step 9: Thread attachments through the session manager**

In `src/main/session-manager.ts`:
- `CreateSessionInput` gains `attachments?: PromptAttachment[]`.
- `create`: pass `input.attachments` into the user event and `runPrompt`.
- `send(id, text, attachments: PromptAttachment[] = [])`: user event stores
  `attachments: attachments.map((a) => ({ name: a.name, mimeType: a.mimeType }))`
  and forwards to `runPrompt`.
- `runPrompt(id, text, attachments: PromptAttachment[] = [])` calls
  `acp.prompt(text, attachments)`.

Add a tests/session-manager.test.ts case:

```ts
it("records attachment names on the user event", async () => {
  const { manager, session } = await createFakeSession();
  await manager.send(session.id, "see this", [
    { name: "shot.png", mimeType: "image/png", data: "AAAA" },
  ]);
  const user = manager
    .transcript(session.id)
    .find((event) => event.kind === "user");
  expect(user?.payload.attachments).toEqual([
    { name: "shot.png", mimeType: "image/png" },
  ]);
});
```

(Reuse the file's existing session-creation helper; adapt names to whatever exists.)

- [ ] **Step 10: Add the picker IPC and preload**

`src/main/index.ts`:

```ts
ipcMain.handle("relay:pickImages", async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender) ?? BrowserWindow.getFocusedWindow();
  if (!win) return [];
  const result = await dialog.showOpenDialog(win, {
    properties: ["openFile", "multiSelections"],
    filters: [
      { name: "Images", extensions: ["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg"] },
    ],
  });
  if (result.canceled) return [];
  return result.filePaths
    .map(readAttachment)
    .filter((a): a is PromptAttachment => a !== null)
    .slice(0, 8);
});
```

Update `relay:send` to `(_e, id: string, text: string, attachments?: PromptAttachment[])` and pass attachments to `manager.send`.

`src/shared/ipc.ts`: `CreatePayload` gains `attachments?: PromptAttachment[];` and `relay:create` passes them through.

`src/preload/index.ts`: `send: (id, text, attachments?) => ipcRenderer.invoke("relay:send", id, text, attachments)` and `pickImages: () => ipcRenderer.invoke("relay:pickImages")`.

`src/renderer/env.d.ts`: update `send` and add `pickImages: () => Promise<PromptAttachment[]>`.

- [ ] **Step 11: Write failing Composer attachment tests**

Append to `tests/composer.test.tsx`:

```tsx
it("attaches picked images and sends them", async () => {
  const onSend = vi.fn();
  const pickImages = vi
    .fn()
    .mockResolvedValue([{ name: "shot.png", mimeType: "image/png", data: "AAAA" }]);
  // @ts-expect-error test shim
  window.relay = { pickImages };
  render(<Composer disabled={false} working={false} onSend={onSend} onCancel={noop} />);
  fireEvent.click(screen.getByLabelText("Attach image"));
  expect(await screen.findByText("shot.png")).toBeTruthy();
  const box = screen.getByRole("textbox");
  fireEvent.change(box, { target: { value: "look" } });
  fireEvent.keyDown(box, { key: "Enter" });
  expect(onSend).toHaveBeenCalledWith("look", [
    { name: "shot.png", mimeType: "image/png", data: "AAAA" },
  ]);
});

it("sends text with no second argument when there are no attachments", () => {
  const onSend = vi.fn();
  render(<Composer disabled={false} working={false} onSend={onSend} onCancel={noop} />);
  const box = screen.getByRole("textbox");
  fireEvent.change(box, { target: { value: "plain" } });
  fireEvent.keyDown(box, { key: "Enter" });
  expect(onSend).toHaveBeenCalledWith("plain");
});
```

- [ ] **Step 12: Run and watch them fail**

Run: `npx vitest run tests/composer.test.tsx`
Expected: FAIL.

- [ ] **Step 13: Implement attachments in Composer**

- Turn the `+` `<span className="plus">` into:

```tsx
<button
  type="button"
  className="plus"
  aria-label="Attach image"
  onClick={() => {
    void window.relay.pickImages().then((picked) => {
      if (picked.length > 0) setAttachments((prev) => [...prev, ...picked]);
    });
  }}
>
  <IconCirclePlus size={16} />
</button>
```

- Add `const [attachments, setAttachments] = useState<PromptAttachment[]>([]);`
- `canSubmit = (Boolean(text.trim()) || attachments.length > 0) && !disabled`.
- In `submit()`: when not working, call `onSend(value)` if `attachments.length === 0`, else `onSend(value, attachments)`; clear both.
- Render attachment chips (reuse `.queued-chip` styling) with a remove button `aria-label="Remove attachment"` showing `attachment.name`.

- [ ] **Step 14: Update the send path in App and the user transcript render**

- `sendToSession(sessionId, text, attachments?)` forwards attachments to `window.relay.send`.
- `Composer` `onSend={(text, attachments) => sendToSession(selected.id, text, attachments)}`.
- In `src/renderer/Transcript.tsx`, the `user` branch renders payload `attachments` names when present:

```tsx
{(event.payload.attachments as { name: string }[] | undefined)?.length ? (
  <div className="msg-attachments">
    {(event.payload.attachments as { name: string }[]).map((a) => (
      <span className="msg-attachment" key={a.name}>{a.name}</span>
    ))}
  </div>
) : null}
```

- [ ] **Step 15: Full verification**

Run: `npm test && npm run typecheck && npm run build`
Expected: all green.

- [ ] **Step 16: Commit**

```bash
git add -A
git commit -m "Attach images to prompts as ACP image content blocks"
```

---

### Task 5: Cheaper sidebar rows

**Files:**
- Modify: `src/renderer/styles.css`

**Interfaces:**
- Consumes: existing `.row-item` class.

- [ ] **Step 1: Add the CSS**

Append to the `.row-item` rule block in `src/renderer/styles.css`:

```css
.row-item {
  content-visibility: auto;
  contain-intrinsic-size: auto 28px;
}
```

(Add these two declarations to the existing `.row-item` rule rather than duplicating the selector.)

- [ ] **Step 2: Verify**

Run: `npm test && npm run typecheck && npm run build`
Expected: all green.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "Skip offscreen sidebar row rendering with content-visibility"
```
