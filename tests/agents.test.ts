import { describe, expect, it } from "vitest";
import {
  hasBinaryOnPath,
  resolveClaudeAgent,
  upgradeClaudeAgent,
} from "../src/main/agents.ts";
import type { AgentConfig } from "../src/shared/types.ts";

const PINNED = "@zed-industries/claude-code-acp@0.16.2";

describe("resolveClaudeAgent", () => {
  it("prefers the locally installed adapter with no args", () => {
    expect(resolveClaudeAgent((name) => name === "claude-code-acp")).toEqual({
      command: "claude-code-acp",
      args: [],
    });
  });

  it("falls back to npx with the exact pinned version", () => {
    const result = resolveClaudeAgent(() => false);
    expect(result).toEqual({ command: "npx", args: ["-y", PINNED] });
    expect(result.args[1]).not.toMatch(/[\^~><= ]/);
  });
});

describe("upgradeClaudeAgent", () => {
  const resolved = { command: "npx", args: ["-y", PINNED] };
  const claude = (over: Partial<AgentConfig> = {}): AgentConfig => ({
    id: "claude-code",
    name: "Claude Code",
    command: "npx",
    args: ["-y", "@zed-industries/claude-code-acp"],
    ...over,
  });

  it("pins the legacy unpinned claude entry", () => {
    const upgraded = upgradeClaudeAgent([claude()], resolved);
    expect(upgraded[0]).toMatchObject({ command: "npx", args: ["-y", PINNED] });
  });

  it("uses the locally resolved form when present", () => {
    const local = { command: "claude-code-acp", args: [] };
    const upgraded = upgradeClaudeAgent([claude()], local);
    expect(upgraded[0]).toMatchObject(local);
  });

  it("leaves a user-customised command alone", () => {
    const custom = claude({ command: "my-claude", args: ["--acp"] });
    const upgraded = upgradeClaudeAgent([custom], resolved);
    expect(upgraded[0]).toMatchObject({ command: "my-claude", args: ["--acp"] });
  });

  it("is idempotent and returns the same list when nothing changes", () => {
    const list = [claude({ args: ["-y", PINNED] })];
    expect(upgradeClaudeAgent(list, resolved)).toBe(list);
  });

  it("leaves other agents untouched", () => {
    const opencode: AgentConfig = {
      id: "opencode",
      name: "OpenCode",
      command: "opencode",
      args: ["acp"],
    };
    const upgraded = upgradeClaudeAgent([opencode, claude()], resolved);
    expect(upgraded[0]).toMatchObject({ command: "opencode", args: ["acp"] });
  });
});

describe("hasBinaryOnPath", () => {
  it("returns a boolean without throwing for a missing binary", () => {
    expect(hasBinaryOnPath("relay-definitely-not-a-real-binary")).toBe(false);
  });
});
