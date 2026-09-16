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

export function leadingCommands(
  text: string,
  names: Iterable<string>,
): { commands: string[]; end: number } {
  const known = new Set(names);
  const commands: string[] = [];
  const pattern = /\S+/g;
  let end = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    const token = match[0];
    if (!token.startsWith("/")) break;
    const name = token.slice(1);
    if (!known.has(name)) break;
    commands.push(name);
    end = pattern.lastIndex;
  }
  return { commands, end };
}

function collapse(text: string): string {
  return text.split(/\s+/).filter(Boolean).join(" ");
}

export function promptTurns(
  text: string,
  names: Iterable<string>,
  skills: Iterable<string> = [],
): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  const { commands, end } = leadingCommands(trimmed, names);
  if (commands.length === 0) return [collapse(trimmed)];
  const skillSet = new Set(skills);
  const groups: string[][] = [];
  for (const name of commands) {
    const current = groups[groups.length - 1];
    const hasPlain = current?.some((item) => !skillSet.has(item)) ?? false;
    if (!current || hasPlain || !skillSet.has(name)) {
      groups.push([name]);
    } else {
      current.push(name);
    }
  }
  const rest = collapse(trimmed.slice(end));
  const turns = groups.map((group) => group.map((name) => `/${name}`).join(" "));
  if (rest) turns[turns.length - 1] = `${turns[turns.length - 1]} ${rest}`;
  return turns;
}
