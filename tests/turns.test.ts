import { describe, expect, it } from "vitest";
import { buildRows } from "../src/renderer/transcript-rows.ts";
import {
  buildTurns,
  isTurnOpen,
  turnSummary,
  type Turn,
} from "../src/renderer/turns.ts";
import type { TranscriptEvent } from "../src/shared/types.ts";

function ev(
  id: string,
  kind: TranscriptEvent["kind"],
  payload: Record<string, unknown>,
  createdAt?: number,
): TranscriptEvent {
  return createdAt == null ? { id, kind, payload } : { id, kind, payload, createdAt };
}

function turn(events: TranscriptEvent[]): Turn[] {
  return buildTurns(buildRows(events));
}

function partial(overrides: Partial<Turn>): Turn {
  return {
    key: "k",
    userEventId: "u",
    rows: [],
    steps: 0,
    files: 0,
    prompt: "",
    reply: "",
    ...overrides,
  };
}

describe("buildTurns", () => {
  it("returns an empty list for empty rows", () => {
    expect(buildTurns([])).toEqual([]);
    expect(turn([])).toEqual([]);
  });

  it("splits rows into one turn per user message", () => {
    const turns = turn([
      ev("u1", "user", { text: "first" }),
      ev("a1", "agent_message", { text: "one" }),
      ev("u2", "user", { text: "second" }),
      ev("a2", "agent_message", { text: "two" }),
    ]);

    expect(turns).toHaveLength(2);
    expect(turns[0]!.key).toBe("u1");
    expect(turns[0]!.userEventId).toBe("u1");
    expect(turns[0]!.prompt).toBe("first");
    expect(turns[0]!.reply).toBe("one");
    expect(turns[0]!.rows.map((r) => r.event.id)).toEqual(["u1", "a1"]);
    expect(turns[1]!.key).toBe("u2");
    expect(turns[1]!.userEventId).toBe("u2");
    expect(turns[1]!.prompt).toBe("second");
    expect(turns[1]!.reply).toBe("two");
    expect(turns[1]!.rows.map((r) => r.event.id)).toEqual(["u2", "a2"]);
  });

  it("collects leading non-user rows into a stable leading turn", () => {
    const turns = turn([
      ev("s1", "status", { text: "booting" }),
      ev("e1", "error", { text: "boom" }),
      ev("u1", "user", { text: "go" }),
      ev("a1", "agent_message", { text: "done" }),
    ]);

    expect(turns).toHaveLength(2);
    expect(turns[0]!.key).toBe("lead");
    expect(turns[0]!.userEventId).toBe("");
    expect(turns[0]!.prompt).toBe("");
    expect(turns[0]!.duration).toBeUndefined();
    expect(turns[0]!.rows.map((r) => r.event.id)).toEqual(["s1", "e1"]);
    expect(turns[1]!.userEventId).toBe("u1");
  });

  it("reports the last agent message in the turn as the reply", () => {
    const turns = turn([
      ev("u1", "user", { text: "q" }),
      ev("a1", "agent_message", { text: "first" }),
      ev("a2", "agent_message", { text: "last" }),
    ]);
    expect(turns[0]!.reply).toBe("last");
  });

  it("counts every tool call in the turn, including grouped runs", () => {
    const turns = turn([
      ev("u1", "user", { text: "q" }),
      ev("t1", "tool_call", { title: "one", kind: "read", status: "completed" }),
      ev("t2", "tool_call", { title: "two", kind: "edit", status: "completed" }),
      ev("t3", "tool_call", { title: "three", kind: "execute", status: "completed" }),
      ev("a1", "agent_message", { text: "done" }),
    ]);

    const grouped = turns[0]!.rows.filter((r) => r.event.kind === "tool_call");
    expect(grouped).toHaveLength(1);
    expect(grouped[0]!.group).toHaveLength(3);
    expect(turns[0]!.steps).toBe(3);
  });

  it("counts distinct diff paths as files", () => {
    const turns = turn([
      ev("u1", "user", { text: "q" }),
      ev("d1", "diff", { path: "src/a.ts", newText: "a" }),
      ev("d2", "diff", { path: "src/b.ts", newText: "b" }),
      ev("t1", "tool_call", { title: "read", kind: "read", status: "completed" }),
      ev("d3", "diff", { path: "src/a.ts", newText: "a2" }),
    ]);

    expect(turns[0]!.files).toBe(2);
    expect(turns[0]!.steps).toBe(1);
  });

  it("derives the turn duration from user to last event", () => {
    const start = new Date(2026, 0, 2, 9, 0, 0).getTime();
    const turns = turn([
      ev("u1", "user", { text: "q" }, start),
      ev("a1", "agent_message", { text: "done" }, start + 42000),
    ]);
    expect(turns[0]!.duration).toBe(42000);
  });

  it("leaves duration undefined when timestamps are missing", () => {
    const turns = turn([
      ev("u1", "user", { text: "q" }),
      ev("a1", "agent_message", { text: "done" }),
    ]);
    expect(turns[0]!.duration).toBeUndefined();
  });
});

describe("isTurnOpen", () => {
  const turns = turn([
    ev("u1", "user", { text: "1" }),
    ev("u2", "user", { text: "2" }),
    ev("u3", "user", { text: "3" }),
    ev("u4", "user", { text: "4" }),
    ev("u5", "user", { text: "5" }),
    ev("u6", "user", { text: "6" }),
    ev("u7", "user", { text: "7" }),
  ]);

  it("keeps the trailing openCount turns open", () => {
    expect(turns).toHaveLength(7);
    expect(isTurnOpen(turns, 0, new Set(), 5)).toBe(false);
    expect(isTurnOpen(turns, 1, new Set(), 5)).toBe(false);
    expect(isTurnOpen(turns, 2, new Set(), 5)).toBe(true);
    expect(isTurnOpen(turns, 6, new Set(), 5)).toBe(true);
  });

  it("opens an older turn when it is explicitly expanded", () => {
    expect(isTurnOpen(turns, 0, new Set(["u1"]), 5)).toBe(true);
    expect(isTurnOpen(turns, 1, new Set(["u1"]), 5)).toBe(false);
  });

  it("treats openCount of zero as fully folded", () => {
    expect(isTurnOpen(turns, 6, new Set(), 0)).toBe(false);
    expect(isTurnOpen(turns, 6, new Set(["u7"]), 0)).toBe(true);
  });
});

describe("turnSummary", () => {
  it("combines duration, steps and files", () => {
    expect(turnSummary(partial({ duration: 42000, steps: 4 }))).toBe(
      "Worked for 42s · 4 steps",
    );
    expect(turnSummary(partial({ duration: 42000, steps: 1, files: 2 }))).toBe(
      "Worked for 42s · 1 step · 2 files",
    );
  });

  it("singularizes steps and files", () => {
    expect(turnSummary(partial({ steps: 1 }))).toBe("1 step");
    expect(turnSummary(partial({ steps: 2 }))).toBe("2 steps");
    expect(turnSummary(partial({ steps: 3, files: 1 }))).toBe("3 steps · 1 file");
  });

  it("degrades when parts are missing", () => {
    expect(turnSummary(partial({ duration: 42000 }))).toBe("Worked for 42s");
    expect(turnSummary(partial({}))).toBe("No steps");
  });
});