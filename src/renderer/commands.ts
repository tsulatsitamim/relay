import type {
  AvailableCommandLike,
  Session,
  TranscriptEvent,
} from "../shared/types.ts";

export function lastCommands(
  events: TranscriptEvent[] | undefined,
): AvailableCommandLike[] {
  if (!events) return [];
  for (let i = events.length - 1; i >= 0; i--) {
    const event = events[i];
    if (event?.kind !== "commands") continue;
    const commands = event.payload.commands;
    return Array.isArray(commands) ? (commands as AvailableCommandLike[]) : [];
  }
  return [];
}

export function commandsForAgent(
  sessions: Session[],
  transcripts: Record<string, TranscriptEvent[]>,
  agentConfigId: string,
): AvailableCommandLike[] {
  for (const session of sessions) {
    if (session.agentConfigId !== agentConfigId) continue;
    const commands = lastCommands(transcripts[session.id]);
    if (commands.length > 0) return commands;
  }
  return [];
}

export function mergeCommands(
  commands: AvailableCommandLike[],
  skills: string[],
): AvailableCommandLike[] {
  const known = new Set(commands.map((command) => command.name));
  const extra: AvailableCommandLike[] = [];
  for (const name of skills) {
    if (known.has(name)) continue;
    known.add(name);
    extra.push({ name, description: "" });
  }
  return extra.length === 0 ? commands : [...commands, ...extra];
}
