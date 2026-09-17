import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CLAUDE_ADAPTER_PACKAGE,
  claudeAdapterBinaryPath,
  enableClaudeAdapter,
  findClaudeAdapter,
  installAndEnableClaudeAdapter,
  installClaudeAdapter,
  isClaudeAdapterAvailable,
} from "../src/main/claude-adapter.ts";
import type { AgentConfig } from "../src/shared/types.ts";

afterEach(() => {
  vi.unstubAllEnvs();
});

const PINNED = "@zed-industries/claude-code-acp@0.16.2";

function claude(over: Partial<AgentConfig> = {}): AgentConfig {
  return {
    id: "claude-code",
    name: "Claude Code",
    command: "npx",
    args: ["-y", PINNED],
    enabled: false,
    ...over,
  };
}

describe("claudeAdapterBinaryPath", () => {
  it("points at the npm bin inside the managed prefix", () => {
    expect(claudeAdapterBinaryPath("/data/tools")).toBe(
      "/data/tools/node_modules/.bin/claude-code-acp",
    );
  });
});

describe("findClaudeAdapter", () => {
  it("finds an adapter installed in the managed prefix", () => {
    vi.stubEnv("PATH", "");
    const prefix = mkdtempSync(join(tmpdir(), "relay-claude-"));
    const binary = claudeAdapterBinaryPath(prefix);
    mkdirSync(dirname(binary), { recursive: true });
    writeFileSync(binary, "");
    expect(findClaudeAdapter(prefix)).toBe(binary);
    expect(isClaudeAdapterAvailable(prefix)).toBe(true);
  });

  it("reports nothing when neither PATH nor the prefix has the adapter", () => {
    vi.stubEnv("PATH", "");
    const prefix = mkdtempSync(join(tmpdir(), "relay-claude-"));
    expect(findClaudeAdapter(prefix)).toBeNull();
    expect(isClaudeAdapterAvailable(prefix)).toBe(false);
  });
});

describe("installClaudeAdapter", () => {
  it("runs npm install into the managed prefix and returns the binary path", async () => {
    const lines: string[] = [];
    const runner = vi.fn(
      async (
        command: string,
        args: string[],
        onLine: (line: string) => void,
      ) => {
        onLine(`> ${command} ${args.join(" ")}`);
        return { code: 0 };
      },
    );

    const result = await installClaudeAdapter({
      prefix: "/data/tools",
      runner,
      onOutput: (line) => lines.push(line),
    });

    expect(result).toEqual({
      ok: true,
      binaryPath: "/data/tools/node_modules/.bin/claude-code-acp",
    });
    expect(runner).toHaveBeenCalledWith(
      "npm",
      ["install", "--prefix", "/data/tools", CLAUDE_ADAPTER_PACKAGE],
      expect.any(Function),
    );
    expect(lines).toContain("> npm install --prefix /data/tools " + PINNED);
  });

  it("returns the failure when npm exits non-zero", async () => {
    const runner = vi.fn(async () => ({ code: 1 }));
    const result = await installClaudeAdapter({ prefix: "/data/tools", runner });
    expect(result.ok).toBe(false);
  });

  it("returns the failure when the runner throws", async () => {
    const runner = vi.fn(async () => ({ code: null, error: "npm not found" }));
    const result = await installClaudeAdapter({ prefix: "/data/tools", runner });
    expect(result).toEqual({ ok: false, error: "npm not found" });
  });
});

describe("enableClaudeAdapter", () => {
  it("points the claude entry at the installed binary and enables it", () => {
    const next = enableClaudeAdapter([claude()], "/data/tools/bin/claude-code-acp");
    expect(next[0]).toMatchObject({
      command: "/data/tools/bin/claude-code-acp",
      args: [],
      enabled: true,
    });
  });

  it("leaves other providers alone", () => {
    const other: AgentConfig = {
      id: "opencode",
      name: "OpenCode",
      command: "opencode",
      args: ["acp"],
    };
    const next = enableClaudeAdapter([other, claude()], "/bin/claude-code-acp");
    expect(next[0]).toBe(other);
  });
});

describe("installAndEnableClaudeAdapter", () => {
  it("returns the binary path and enables the provider on success", async () => {
    const runner = vi.fn(async () => ({ code: 0 }));
    const result = await installAndEnableClaudeAdapter({
      prefix: "/data/tools",
      agents: [claude()],
      runner,
    });

    expect(result).toMatchObject({
      ok: true,
      binaryPath: "/data/tools/node_modules/.bin/claude-code-acp",
    });
    if (!result.ok) throw new Error("expected success");
    expect(result.agents[0]).toMatchObject({
      command: "/data/tools/node_modules/.bin/claude-code-acp",
      args: [],
      enabled: true,
    });
  });

  it("does not enable the provider when npm fails", async () => {
    const runner = vi.fn(async () => ({ code: 1 }));
    const original = [claude()];
    const result = await installAndEnableClaudeAdapter({
      prefix: "/data/tools",
      agents: original,
      runner,
    });

    expect(result.ok).toBe(false);
    expect(original[0]).toMatchObject({ command: "npx", enabled: false });
  });
});
