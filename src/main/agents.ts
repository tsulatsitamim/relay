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

export function hasBinaryOnPath(name: string): boolean {
  try {
    const path = process.env.PATH;
    if (!path) return false;
    const extensions =
      process.platform === "win32"
        ? (process.env.PATHEXT ?? ".EXE;.CMD;.BAT;.COM").split(";")
        : [""];
    for (const dir of path.split(delimiter)) {
      if (!dir) continue;
      for (const extension of extensions) {
        try {
          accessSync(join(dir, name + extension), constants.X_OK);
          return true;
        } catch {
          continue;
        }
      }
    }
    return false;
  } catch {
    return false;
  }
}

const LEGACY_CLAUDE_COMMAND = "npx";
const LEGACY_CLAUDE_ARGS = ["-y", "@zed-industries/claude-code-acp"];

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
