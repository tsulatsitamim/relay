import type { TranscriptEvent } from "../shared/types.ts";

export function reduceSessionUpdate(
  events: TranscriptEvent[],
  update: { sessionUpdate: string; [key: string]: unknown },
  nextId: () => string,
): TranscriptEvent[] {
  const kind = update.sessionUpdate;

  if (kind === "agent_message_chunk") {
    const text = textFromContent(update.content);
    if (!text) return events;
    const last = events[events.length - 1];
    if (last?.kind === "agent_message") {
      const prev = String(last.payload.text ?? "");
      return [
        ...events.slice(0, -1),
        { ...last, payload: { ...last.payload, text: prev + text } },
      ];
    }
    return [
      ...events,
      {
        id: nextId(),
        kind: "agent_message",
        payload: { text },
        createdAt: Date.now(),
      },
    ];
  }

  if (kind === "tool_call") {
    const toolCallId = String(update.toolCallId ?? nextId());
    return [
      ...events,
      {
        id: nextId(),
        kind: "tool_call",
        payload: {
          toolCallId,
          title: update.title ?? "Tool",
          toolKind: update.kind,
          status: update.status ?? "pending",
          locations: update.locations,
          rawInput: update.rawInput,
        },
        createdAt: Date.now(),
      },
    ];
  }

  if (kind === "tool_call_update") {
    const toolCallId = String(update.toolCallId ?? "");
    const next = events.map((event) => {
      if (event.kind !== "tool_call") return event;
      if (event.payload.toolCallId !== toolCallId) return event;
      return {
        ...event,
        payload: {
          ...event.payload,
          status: update.status ?? event.payload.status,
          rawOutput: update.rawOutput ?? event.payload.rawOutput,
          title: update.title ?? event.payload.title,
        },
      };
    });
    const diffs = diffsFromContent(update.content, toolCallId, nextId);
    return [...next, ...diffs];
  }

  return events;
}

function textFromContent(content: unknown): string {
  if (!content || typeof content !== "object") return "";
  const c = content as { type?: string; text?: string };
  if (c.type === "text" && typeof c.text === "string") return c.text;
  return "";
}

function diffsFromContent(
  content: unknown,
  toolCallId: string,
  nextId: () => string,
): TranscriptEvent[] {
  if (!Array.isArray(content)) return [];
  const out: TranscriptEvent[] = [];
  for (const item of content) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    if (rec.type !== "diff") continue;
    out.push({
      id: nextId(),
      kind: "diff",
      payload: {
        toolCallId,
        path: rec.path,
        oldText: rec.oldText ?? null,
        newText: rec.newText ?? "",
      },
      createdAt: Date.now(),
    });
  }
  return out;
}
