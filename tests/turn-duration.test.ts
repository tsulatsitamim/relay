import { describe, expect, it } from "vitest";
import {
  formatDuration,
  turnDuration,
  turnEndedAt,
  turnText,
} from "../src/renderer/turn-duration.ts";
import type { TranscriptEvent } from "../src/shared/types.ts";

const t0 = 1_700_000_000_000;

const events: TranscriptEvent[] = [
  { id: "u1", kind: "user", payload: { text: "one" }, createdAt: t0 },
  { id: "a1", kind: "agent_message", payload: { text: "first" }, createdAt: t0 + 1000 },
  { id: "u2", kind: "user", payload: { text: "two" }, createdAt: t0 + 5000 },
  { id: "a2", kind: "agent_message", payload: { text: "second" }, createdAt: t0 + 7000 },
  { id: "t2", kind: "tool_call", payload: { title: "read" }, createdAt: t0 + 9000 },
];

describe("formatDuration", () => {
  it("keeps sub-minute durations in seconds", () => {
    expect(formatDuration(0)).toBe("0s");
    expect(formatDuration(999)).toBe("0s");
    expect(formatDuration(1000)).toBe("1s");
    expect(formatDuration(42000)).toBe("42s");
    expect(formatDuration(59000)).toBe("59s");
  });

  it("rolls into minutes with a remainder", () => {
    expect(formatDuration(60000)).toBe("1m");
    expect(formatDuration(90000)).toBe("1m 30s");
    expect(formatDuration(120000)).toBe("2m");
  });

  it("clamps negatives to zero", () => {
    expect(formatDuration(-500)).toBe("0s");
  });
});

describe("turnDuration", () => {
  it("measures from the last user prompt to the final event of that turn", () => {
    expect(turnDuration(events)).toBe(4000);
    expect(turnEndedAt(events)).toBe(t0 + 9000);
  });

  it("falls back to lastPromptAt when the user event has no timestamp", () => {
    const untimed: TranscriptEvent[] = [
      { id: "u1", kind: "user", payload: { text: "two" } },
      { id: "a1", kind: "agent_message", payload: { text: "ok" }, createdAt: t0 + 7000 },
    ];
    expect(turnDuration(untimed, t0 + 5000)).toBe(2000);
  });

  it("returns null when there is no usable start timestamp", () => {
    const untimed: TranscriptEvent[] = [
      { id: "u1", kind: "user", payload: { text: "two" } },
      { id: "a1", kind: "agent_message", payload: { text: "ok" }, createdAt: t0 + 7000 },
    ];
    expect(turnDuration(untimed)).toBeNull();
  });

  it("returns null when no event follows the last user prompt", () => {
    expect(turnDuration([events[2]!])).toBeNull();
  });

  it("returns null when the turn has no timestamped events", () => {
    const bare: TranscriptEvent[] = [
      { id: "u1", kind: "user", payload: { text: "hi" } },
      { id: "a1", kind: "agent_message", payload: { text: "hey" } },
    ];
    expect(turnDuration(bare, t0)).toBeNull();
  });

  it("returns null for an empty transcript", () => {
    expect(turnDuration([])).toBeNull();
  });
});

describe("turnText", () => {
  it("joins the agent messages of the completed turn", () => {
    expect(turnText(events)).toBe("second");
  });

  it("joins multiple agent messages with a blank line", () => {
    const multi: TranscriptEvent[] = [
      { id: "u1", kind: "user", payload: { text: "go" }, createdAt: t0 },
      { id: "a1", kind: "agent_message", payload: { text: "one" }, createdAt: t0 + 1 },
      { id: "a2", kind: "agent_message", payload: { text: "two" }, createdAt: t0 + 2 },
    ];
    expect(turnText(multi)).toBe("one\n\ntwo");
  });

  it("returns an empty string when the turn has no agent text", () => {
    expect(turnText([events[2]!])).toBe("");
  });
});
