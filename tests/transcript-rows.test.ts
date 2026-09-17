import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TranscriptEvent } from "../src/shared/types.ts";

const spies = vi.hoisted(() => ({
  formatDay: vi.fn<(ts: number) => string>(),
  formatTime: vi.fn<(ts: number) => string>(),
}));

vi.mock("../src/renderer/time.ts", () => ({
  formatDay: spies.formatDay,
  formatTime: spies.formatTime,
}));

import { buildRows } from "../src/renderer/transcript-rows.ts";

const day1 = new Date(2026, 0, 2, 9, 5).getTime();
const day2 = new Date(2026, 0, 3, 9, 5).getTime();

function event(id: string, createdAt?: number): TranscriptEvent {
  return { id, kind: "user", payload: { text: id }, createdAt };
}

function tool(id: string, createdAt?: number): TranscriptEvent {
  return {
    id,
    kind: "tool_call",
    payload: { title: id, kind: "edit", status: "completed" },
    createdAt,
  };
}

function diff(id: string, createdAt?: number): TranscriptEvent {
  return {
    id,
    kind: "diff",
    payload: { path: `${id}.ts`, oldText: "a\n", newText: "b\n" },
    createdAt,
  };
}

beforeEach(() => {
  spies.formatDay.mockReset();
  spies.formatTime.mockReset();
  spies.formatDay.mockImplementation((ts: number) => new Date(ts).toDateString());
  spies.formatTime.mockImplementation((ts: number) =>
    new Date(ts).toLocaleTimeString(),
  );
});

describe("buildRows", () => {
  it("emits a single separator for same-day events split by an untimestamped event", () => {
    const rows = buildRows([
      event("1", day1),
      event("2"),
      event("3", day1),
    ]);
    expect(rows.map((row) => row.showSeparator)).toEqual([true, false, false]);
    expect(rows.map((row) => row.time)).toEqual([
      new Date(day1).toLocaleTimeString(),
      null,
      new Date(day1).toLocaleTimeString(),
    ]);
  });

  it("emits a separator when an event lands on a new day", () => {
    const rows = buildRows([event("1", day1), event("2", day2)]);
    expect(rows.map((row) => row.showSeparator)).toEqual([true, true]);
  });

  it("formats each timestamped event at most once", () => {
    const events = [event("1", day1), event("2"), event("3", day1), event("4", day2)];
    buildRows(events);
    expect(spies.formatDay.mock.calls.length).toBeLessThanOrEqual(events.length);
    expect(spies.formatDay).toHaveBeenCalledTimes(3);
    expect(spies.formatTime).toHaveBeenCalledTimes(3);
  });

  it("never emits a separator for untimestamped events", () => {
    const rows = buildRows([event("1"), event("2")]);
    expect(rows.map((row) => row.showSeparator)).toEqual([false, false]);
    expect(spies.formatDay).not.toHaveBeenCalled();
  });
});

describe("buildRows tool grouping", () => {
  it("keeps a single tool call as its own ungrouped row", () => {
    const rows = buildRows([tool("t1")]);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.event.id).toBe("t1");
    expect(rows[0]!.group).toBeUndefined();
  });

  it("collapses a run of two or more tool calls into one group row", () => {
    const rows = buildRows([tool("t1"), tool("t2"), tool("t3")]);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.event.id).toBe("t1");
    expect(rows[0]!.groupKind).toBe("tool");
    expect(rows[0]!.group?.map((item) => item.id)).toEqual(["t1", "t2", "t3"]);
  });

  it("breaks a run on a non-tool event and preserves order", () => {
    const rows = buildRows([tool("t1"), tool("t2"), event("u1"), tool("t3")]);
    expect(rows.map((row) => row.event.id)).toEqual(["t1", "u1", "t3"]);
    expect(rows[0]!.group?.map((item) => item.id)).toEqual(["t1", "t2"]);
    expect(rows[2]!.group).toBeUndefined();
  });

  it("groups two separated runs independently", () => {
    const rows = buildRows([
      tool("a1"),
      tool("a2"),
      event("u1"),
      tool("b1"),
      tool("b2"),
    ]);
    expect(rows).toHaveLength(3);
    expect(rows[0]!.group?.map((item) => item.id)).toEqual(["a1", "a2"]);
    expect(rows[2]!.group?.map((item) => item.id)).toEqual(["b1", "b2"]);
  });
});

describe("buildRows diff grouping", () => {
  it("keeps a single diff as its own ungrouped row", () => {
    const rows = buildRows([diff("d1")]);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.event.id).toBe("d1");
    expect(rows[0]!.group).toBeUndefined();
    expect(rows[0]!.groupKind).toBeUndefined();
  });

  it("collapses a run of two or more diffs into one group row", () => {
    const rows = buildRows([diff("d1"), diff("d2"), diff("d3")]);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.event.id).toBe("d1");
    expect(rows[0]!.groupKind).toBe("diff");
    expect(rows[0]!.group?.map((item) => item.id)).toEqual(["d1", "d2", "d3"]);
  });

  it("breaks a diff run on a non-diff event and preserves order", () => {
    const rows = buildRows([
      diff("d1"),
      diff("d2"),
      event("u1"),
      diff("d3"),
    ]);
    expect(rows.map((row) => row.event.id)).toEqual(["d1", "u1", "d3"]);
    expect(rows[0]!.group?.map((item) => item.id)).toEqual(["d1", "d2"]);
    expect(rows[2]!.group).toBeUndefined();
  });

  it("does not merge a diff run with an adjacent tool run", () => {
    const rows = buildRows([tool("t1"), diff("d1"), diff("d2")]);
    expect(rows.map((row) => row.event.id)).toEqual(["t1", "d1"]);
    expect(rows[0]!.group).toBeUndefined();
    expect(rows[1]!.groupKind).toBe("diff");
    expect(rows[1]!.group?.map((item) => item.id)).toEqual(["d1", "d2"]);
  });
});
