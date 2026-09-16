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

  it("strips harness message-id tags from agent text", () => {
    const nextId = ids();
    let events: TranscriptEvent[] = [];
    events = reduceSessionUpdate(events, {
      sessionUpdate: "agent_message_chunk",
      content: {
        type: "text",
        text: "Hello\n\n<dcp-message-id>m0006</dcp-message-id>",
      },
    }, nextId);

    expect(events[0]?.payload.text).toBe("Hello\n\n");
  });

  it("strips a harness tag split across two chunks", () => {
    const nextId = ids();
    let events: TranscriptEvent[] = [];
    events = reduceSessionUpdate(events, {
      sessionUpdate: "agent_message_chunk",
      content: { type: "text", text: "Hi\n\n<dcp-message-id>m0" },
    }, nextId);
    events = reduceSessionUpdate(events, {
      sessionUpdate: "agent_message_chunk",
      content: { type: "text", text: "012</dcp-message-id>" },
    }, nextId);

    expect(events[0]?.payload.text).toBe("Hi\n\n");
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
      sessionUpdate: "totally_unknown_update",
      content: { type: "text", text: "nope" },
    }, ids());
    expect(events).toEqual([]);
  });

  it("accumulates consecutive thought chunks into one thinking event", () => {
    const nextId = ids();
    let events: TranscriptEvent[] = [];
    events = reduceSessionUpdate(events, {
      sessionUpdate: "agent_thought_chunk",
      content: { type: "text", text: "Let me " },
    }, nextId);
    events = reduceSessionUpdate(events, {
      sessionUpdate: "agent_thought_chunk",
      content: { type: "text", text: "think..." },
    }, nextId);

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      kind: "thinking",
      payload: { text: "Let me think..." },
    });
  });

  it("records a plan update as a plan event", () => {
    const events = reduceSessionUpdate([], {
      sessionUpdate: "plan",
      entries: [
        { content: "Read the file", priority: "high", status: "in_progress" },
        { content: "Edit the file", priority: "medium", status: "pending" },
      ],
    }, ids());

    expect(events).toHaveLength(1);
    expect(events[0]?.kind).toBe("plan");
    expect(events[0]?.payload.entries).toEqual([
      { content: "Read the file", priority: "high", status: "in_progress" },
      { content: "Edit the file", priority: "medium", status: "pending" },
    ]);
  });

  it("replaces the previous plan event instead of stacking snapshots", () => {
    const nextId = ids();
    let events: TranscriptEvent[] = [];
    events = reduceSessionUpdate(events, {
      sessionUpdate: "plan",
      entries: [{ content: "Step one", priority: "high", status: "pending" }],
    }, nextId);
    events = reduceSessionUpdate(events, {
      sessionUpdate: "plan",
      entries: [{ content: "Step one", priority: "high", status: "completed" }],
    }, nextId);

    expect(events).toHaveLength(1);
    expect(events[0]?.payload.entries).toEqual([
      { content: "Step one", priority: "high", status: "completed" },
    ]);
  });

  it("records available commands as a replaceable event", () => {
    const nextId = ids();
    let events = reduceSessionUpdate([], {
      sessionUpdate: "available_commands_update",
      availableCommands: [
        { name: "init", description: "Create AGENTS.md" },
        { name: "review", description: "Review the diff" },
      ],
    }, nextId);
    const first = events[events.length - 1];
    expect(first.kind).toBe("commands");
    expect(first.payload.commands).toEqual([
      { name: "init", description: "Create AGENTS.md" },
      { name: "review", description: "Review the diff" },
    ]);

    events = reduceSessionUpdate(events, {
      sessionUpdate: "available_commands_update",
      availableCommands: [{ name: "init", description: "Create AGENTS.md" }],
    }, nextId);
    const commands = events.filter((event) => event.kind === "commands");
    expect(commands).toHaveLength(1);
    expect(commands[0].payload.commands).toEqual([
      { name: "init", description: "Create AGENTS.md" },
    ]);
  });

  it("ignores non-array and malformed command entries", () => {
    const nextId = ids();
    let events = reduceSessionUpdate([], {
      sessionUpdate: "available_commands_update",
      availableCommands: "nope",
    }, nextId);
    expect(events[events.length - 1].payload.commands).toEqual([]);

    events = reduceSessionUpdate(events, {
      sessionUpdate: "available_commands_update",
      availableCommands: [null, "x", { name: 42 }, { name: "" }, { name: "ok" }],
    }, nextId);
    expect(events[events.length - 1].payload.commands).toEqual([
      { name: "ok", description: "" },
    ]);
  });

  it("coerces non-string descriptions and only lifts string hints", () => {
    const nextId = ids();
    const events = reduceSessionUpdate([], {
      sessionUpdate: "available_commands_update",
      availableCommands: [
        { name: "a", description: 42, input: { hint: "file" } },
        { name: "b" },
        { name: "c", input: { hint: 7 } },
      ],
    }, nextId);
    expect(events[events.length - 1].payload.commands).toEqual([
      { name: "a", description: "", inputHint: "file" },
      { name: "b", description: "" },
      { name: "c", description: "" },
    ]);
  });

  it("records a usage update with sanitized numbers and cost", () => {
    const events = reduceSessionUpdate([], {
      sessionUpdate: "usage_update",
      used: 1234,
      size: 8000,
      cost: { amount: 0.0123, currency: "USD" },
    }, ids());

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      kind: "usage",
      payload: { used: 1234, size: 8000, costAmount: 0.0123, costCurrency: "USD" },
    });
  });

  it("drops non-numeric usage fields and non-string currency", () => {
    const events = reduceSessionUpdate([], {
      sessionUpdate: "usage_update",
      used: "lots",
      size: 42,
      cost: { amount: "free", currency: 7 },
    }, ids());

    expect(events[events.length - 1].payload).toEqual({ size: 42 });
  });

  it("drops non-finite usage numbers", () => {
    const events = reduceSessionUpdate([], {
      sessionUpdate: "usage_update",
      used: Number.NaN,
      size: Number.POSITIVE_INFINITY,
      cost: { amount: Number.NEGATIVE_INFINITY, currency: "USD" },
    }, ids());

    expect(events[events.length - 1].payload).toEqual({ costCurrency: "USD" });
  });

  it("replaces the previous usage event instead of stacking snapshots", () => {
    const nextId = ids();
    let events = reduceSessionUpdate([], {
      sessionUpdate: "usage_update",
      used: 10,
      size: 100,
    }, nextId);
    const firstId = events[events.length - 1]?.id;

    events = reduceSessionUpdate(events, {
      sessionUpdate: "usage_update",
      used: 55,
      size: 100,
    }, nextId);

    const usage = events.filter((event) => event.kind === "usage");
    expect(usage).toHaveLength(1);
    expect(usage[0]?.id).toBe(firstId);
    expect(usage[0]?.payload).toEqual({ used: 55, size: 100 });
  });
});
