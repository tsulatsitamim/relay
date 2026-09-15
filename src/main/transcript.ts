import type { AvailableCommandLike, TranscriptEvent } from "../shared/types.ts";

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

  if (kind === "agent_thought_chunk") {
    const text = textFromContent(update.content);
    if (!text) return events;
    const last = events[events.length - 1];
    if (last?.kind === "thinking") {
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
        kind: "thinking",
        payload: { text },
        createdAt: Date.now(),
      },
    ];
  }

  if (kind === "plan") {
    const entries = planEntries(update.entries);
    const event: TranscriptEvent = {
      id: nextId(),
      kind: "plan",
      payload: { entries },
      createdAt: Date.now(),
    };
    const last = events[events.length - 1];
    if (last?.kind === "plan") {
      return [...events.slice(0, -1), { ...event, id: last.id }];
    }
    return [...events, event];
  }

  if (kind === "available_commands_update") {
    const commands = commandsFrom(update.availableCommands);
    const event: TranscriptEvent = {
      id: nextId(),
      kind: "commands",
      payload: { commands },
      createdAt: Date.now(),
    };
    const last = events[events.length - 1];
    if (last && last.kind === "commands") {
      return [...events.slice(0, -1), { ...last, payload: event.payload }];
    }
    return [...events, event];
  }

  if (kind === "usage_update") {
    const payload: Record<string, unknown> = {};
    if (Number.isFinite(update.used)) payload.used = update.used;
    if (Number.isFinite(update.size)) payload.size = update.size;
    const cost = update.cost as { amount?: unknown; currency?: unknown } | undefined;
    if (cost && typeof cost === "object") {
      if (Number.isFinite(cost.amount)) payload.costAmount = cost.amount;
      if (typeof cost.currency === "string") payload.costCurrency = cost.currency;
    }
    const last = events[events.length - 1];
    if (last?.kind === "usage") {
      return [...events.slice(0, -1), { ...last, payload }];
    }
    return [
      ...events,
      { id: nextId(), kind: "usage", payload, createdAt: Date.now() },
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

function planEntries(entries: unknown): Array<{ content: string; priority?: string; status?: string }> {
  if (!Array.isArray(entries)) return [];
  const out: Array<{ content: string; priority?: string; status?: string }> = [];
  for (const entry of entries) {
    if (!entry || typeof entry !== "object") continue;
    const rec = entry as Record<string, unknown>;
    if (typeof rec.content !== "string") continue;
    out.push({
      content: rec.content,
      priority: typeof rec.priority === "string" ? rec.priority : undefined,
      status: typeof rec.status === "string" ? rec.status : undefined,
    });
  }
  return out;
}

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
