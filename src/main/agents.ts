import { accessSync, constants } from "node:fs";
import { delimiter, join } from "node:path";
import type { AgentConfig } from "../shared/types.ts";

export const CLAUDE_CODE_ACP_VERSION = "0.16.2";

export type ResolvedAgentCommand = {
  command: string;
  args: string[];
};

export function resolveClaudeAgent(
  hasLocal: (name: string) => boolean,
): ResolvedAgentCommand {
  if (hasLocal("claude-code-acp")) {
    return { command: "claude-code-acp", args: [] };
  }
  return {
    command: "npx",
    args: [
      "-y",
      `@zed-industries/claude-code-acp@${CLAUDE_CODE_ACP_VERSION}`,
    ],
  };
}

export function findBinaryOnPath(name: string): string | null {
  try {
    const path = process.env.PATH;
    if (!path) return null;
    const extensions =
      process.platform === "win32"
        ? (process.env.PATHEXT ?? ".EXE;.CMD;.BAT;.COM").split(";")
        : [""];
    for (const dir of path.split(delimiter)) {
      if (!dir) continue;
      for (const extension of extensions) {
        const candidate = join(dir, name + extension);
        try {
          accessSync(candidate, constants.X_OK);
          return candidate;
        } catch {
          continue;
        }
      }
    }
    return null;
  } catch {
    return null;
  }
}

export function hasBinaryOnPath(name: string): boolean {
  return findBinaryOnPath(name) !== null;
}

const LEGACY_CLAUDE_COMMAND = "npx";
const LEGACY_CLAUDE_ARGS = ["-y", "@zed-industries/claude-code-acp"];
const CLAUDE_PACKAGE = "@zed-industries/claude-code-acp";

function isBuiltinClaudeEntry(agent: AgentConfig): boolean {
  if (agent.id !== "claude-code") return false;
  if (agent.command === "claude-code-acp") return agent.args.length === 0;
  if (agent.command !== LEGACY_CLAUDE_COMMAND || agent.args.length !== 2) {
    return false;
  }
  if (agent.args[0] !== "-y") return false;
  const spec = agent.args[1] ?? "";
  return spec === CLAUDE_PACKAGE || spec.startsWith(`${CLAUDE_PACKAGE}@`);
}

export function disableBuiltinClaudeAgent(
  agents: AgentConfig[],
  hasLocalAdapter: boolean,
): AgentConfig[] {
  if (hasLocalAdapter) return agents;
  let changed = false;
  const next = agents.map((agent) => {
    if (!isBuiltinClaudeEntry(agent)) return agent;
    if (agent.enabled === false) return agent;
    changed = true;
    return { ...agent, enabled: false };
  });
  return changed ? next : agents;
}

export function upgradeClaudeAgent(
  agents: AgentConfig[],
  resolved: ResolvedAgentCommand,
): AgentConfig[] {
  let changed = false;
  const next = agents.map((agent) => {
    if (agent.id !== "claude-code") return agent;
    if (
      agent.command !== LEGACY_CLAUDE_COMMAND ||
      agent.args.length !== LEGACY_CLAUDE_ARGS.length ||
      !agent.args.every((arg, i) => arg === LEGACY_CLAUDE_ARGS[i])
    ) {
      return agent;
    }
    changed = true;
    return { ...agent, command: resolved.command, args: resolved.args };
  });
  return changed ? next : agents;
}
