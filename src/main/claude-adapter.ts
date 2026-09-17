import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { CLAUDE_CODE_ACP_VERSION, findBinaryOnPath } from "./agents.ts";
import type {
  AgentConfig,
  ClaudeInstallResult,
} from "../shared/types.ts";

export const CLAUDE_ADAPTER_BIN = "claude-code-acp";
export const CLAUDE_ADAPTER_PACKAGE = `@zed-industries/claude-code-acp@${CLAUDE_CODE_ACP_VERSION}`;

export type SpawnResult = { code: number | null; error?: string };
export type SpawnRunner = (
  command: string,
  args: string[],
  onLine: (line: string) => void,
) => Promise<SpawnResult>;

export type InstallOutput = (line: string) => void;

export function claudeAdapterBinaryPath(prefix: string): string {
  return join(prefix, "node_modules", ".bin", CLAUDE_ADAPTER_BIN);
}

export function findClaudeAdapter(prefix?: string): string | null {
  const onPath = findBinaryOnPath(CLAUDE_ADAPTER_BIN);
  if (onPath) return onPath;
  if (prefix) {
    const managed = claudeAdapterBinaryPath(prefix);
    if (existsSync(managed)) return managed;
  }
  return null;
}

export function isClaudeAdapterAvailable(prefix?: string): boolean {
  return findClaudeAdapter(prefix) !== null;
}

function runNpm(
  command: string,
  args: string[],
  onLine: InstallOutput,
): Promise<SpawnResult> {
  return new Promise<SpawnResult>((resolve) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let buffer = "";
    const consume = (chunk: Buffer) => {
      buffer += chunk.toString();
      let index = buffer.indexOf("\n");
      while (index !== -1) {
        onLine(buffer.slice(0, index).replace(/\r$/, ""));
        buffer = buffer.slice(index + 1);
        index = buffer.indexOf("\n");
      }
    };
    child.stdout?.on("data", consume);
    child.stderr?.on("data", consume);
    child.on("error", (err) => resolve({ code: null, error: err.message }));
    child.on("close", (code) => {
      if (buffer.length > 0) onLine(buffer.replace(/\r$/, ""));
      resolve({ code });
    });
  });
}

export async function installClaudeAdapter(opts: {
  prefix: string;
  onOutput?: InstallOutput;
  runner?: SpawnRunner;
}): Promise<ClaudeInstallResult> {
  const onOutput = opts.onOutput ?? (() => {});
  const runner = opts.runner ?? runNpm;
  const result = await runner(
    "npm",
    ["install", "--prefix", opts.prefix, CLAUDE_ADAPTER_PACKAGE],
    onOutput,
  );
  if (result.error) return { ok: false, error: result.error };
  if (result.code !== 0) {
    return {
      ok: false,
      error: `npm install failed (exit code ${result.code ?? "unknown"})`,
    };
  }
  return { ok: true, binaryPath: claudeAdapterBinaryPath(opts.prefix) };
}

export function enableClaudeAdapter(
  agents: AgentConfig[],
  binaryPath: string,
): AgentConfig[] {
  return agents.map((agent) =>
    agent.id === "claude-code"
      ? { ...agent, command: binaryPath, args: [], enabled: true }
      : agent,
  );
}

export async function installAndEnableClaudeAdapter(opts: {
  prefix: string;
  agents: AgentConfig[];
  onOutput?: InstallOutput;
  runner?: SpawnRunner;
}): Promise<
  { ok: true; binaryPath: string; agents: AgentConfig[] } | { ok: false; error: string }
> {
  const result = await installClaudeAdapter({
    prefix: opts.prefix,
    onOutput: opts.onOutput,
    runner: opts.runner,
  });
  if (!result.ok) return result;
  return {
    ok: true,
    binaryPath: result.binaryPath,
    agents: enableClaudeAdapter(opts.agents, result.binaryPath),
  };
}
