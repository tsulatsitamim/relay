import { describe, expect, it } from "vitest";
import { reduceSessionUpdate } from "../src/main/transcript.ts";
import type { TranscriptEvent } from "../src/shared/types.ts";

function ids() {
  let n = 0;
  return () => `e${++n}`;
}

describe("reduceSessionUpdate", () => {
  it("appends consecutive agent text chunks into one message", () => {
    const nextId = ids();
    let events: TranscriptEvent[] = [];
    events = reduceSessionUpdate(events, {
      sessionUpdate: "agent_message_chunk",
      content: { type: "text", text: "Hello " },
    }, nextId);
    events = reduceSessionUpdate(events, {
      sessionUpdate: "agent_message_chunk",
      content: { type: "text", text: "world" },
    }, nextId);

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      kind: "agent_message",
      payload: { text: "Hello world" },
    });
  });

  it("creates a tool card and updates its status", () => {
    const nextId = ids();
    let events: TranscriptEvent[] = [];
    events = reduceSessionUpdate(events, {
      sessionUpdate: "tool_call",
      toolCallId: "call_1",
      title: "Edit config",
      kind: "edit",
      status: "pending",
    }, nextId);
    events = reduceSessionUpdate(events, {
      sessionUpdate: "tool_call_update",
      toolCallId: "call_1",
      status: "completed",
    }, nextId);

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      kind: "tool_call",
      payload: {
        toolCallId: "call_1",
        title: "Edit config",
        status: "completed",
      },
    });
  });

  it("extracts a read-only diff from tool call content", () => {
    const nextId = ids();
    let events: TranscriptEvent[] = [];
    events = reduceSessionUpdate(events, {
      sessionUpdate: "tool_call",
      toolCallId: "call_1",
      title: "Edit config",
      kind: "edit",
      status: "in_progress",
    }, nextId);
    events = reduceSessionUpdate(events, {
      sessionUpdate: "tool_call_update",
      toolCallId: "call_1",
      status: "completed",
      content: [
        {
          type: "diff",
          path: "/tmp/config.json",
          oldText: "{\n  \"debug\": false\n}",
          newText: "{\n  \"debug\": true\n}",
        },
      ],
    }, nextId);

    expect(events.some((e) => e.kind === "diff")).toBe(true);
    const diff = events.find((e) => e.kind === "diff");
    expect(diff?.payload).toMatchObject({
      path: "/tmp/config.json",
      oldText: "{\n  \"debug\": false\n}",
      newText: "{\n  \"debug\": true\n}",
      toolCallId: "call_1",
    });
  });

  it("ignores unknown update kinds without throwing", () => {
    const events = reduceSessionUpdate([], {
      sessionUpdate: "agent_thought_chunk",
      content: { type: "text", text: "thinking" },
    }, ids());
    expect(events).toEqual([]);
  });
});
