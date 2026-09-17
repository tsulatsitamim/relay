import { describe, expect, it } from "vitest";
import {
  initialRecall,
  promptHistory,
  recallNext,
  recallPrev,
  recallText,
} from "../src/renderer/history.ts";
import type { TranscriptEvent } from "../src/shared/types.ts";

function user(text: string, id = text): TranscriptEvent {
  return { id, kind: "user", payload: { text } };
}

describe("promptHistory", () => {
  it("returns user prompts newest first", () => {
    const events = [user("first"), user("second"), user("third")];
    expect(promptHistory(events, [])).toEqual(["third", "second", "first"]);
  });

  it("ignores non-user events and blank text", () => {
    const events: TranscriptEvent[] = [
      user("hello"),
      { id: "a1", kind: "agent_message", payload: { text: "answer" } },
      { id: "u2", kind: "user", payload: { text: "   " } },
    ];
    expect(promptHistory(events, [])).toEqual(["hello"]);
  });

  it("prepends prompts sent in this session", () => {
    const events = [user("old")];
    expect(promptHistory(events, ["newer"])).toEqual(["newer", "old"]);
  });

  it("collapses an adjacent duplicate between sent and transcript", () => {
    const events = [user("hello")];
    expect(promptHistory(events, ["hello"])).toEqual(["hello"]);
  });
});

describe("recall", () => {
  const history = ["latest", "older"];

  it("walks back from the draft and stores it", () => {
    const next = recallPrev(initialRecall, history, "my draft");
    expect(next).toEqual({ index: 0, draft: "my draft" });
    expect(recallText(next, history)).toBe("latest");
  });

  it("keeps walking to older entries", () => {
    const first = recallPrev(initialRecall, history, "draft");
    const second = recallPrev(first, history, "draft");
    expect(second.index).toBe(1);
    expect(recallText(second, history)).toBe("older");
  });

  it("stops at the oldest entry", () => {
    const oldest = { index: 1, draft: "draft" };
    expect(recallPrev(oldest, history, "draft")).toBe(oldest);
  });

  it("does nothing without history", () => {
    expect(recallPrev(initialRecall, [], "draft")).toBe(initialRecall);
  });

  it("walks forward and restores the draft", () => {
    const first = recallPrev(initialRecall, history, "my draft");
    const back = recallNext(first, history);
    expect(back.index).toBe(-1);
    expect(recallText(back, history)).toBe("my draft");
  });

  it("ignores a forward step while already on the draft", () => {
    expect(recallNext(initialRecall, history)).toBe(initialRecall);
  });
});
