import { describe, expect, it } from "vitest";
import {
  disableBuiltinClaudeAgent,
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

describe("disableBuiltinClaudeAgent", () => {
  const builtinPinned = (): AgentConfig => ({
    id: "claude-code",
    name: "Claude Code",
    command: "npx",
    args: ["-y", PINNED],
  });
  const builtinLegacy = (): AgentConfig => ({
    id: "claude-code",
    name: "Claude Code",
    command: "npx",
    args: ["-y", "@zed-industries/claude-code-acp"],
  });
  const builtinLocal = (): AgentConfig => ({
    id: "claude-code",
    name: "Claude Code",
    command: "claude-code-acp",
    args: [],
  });

  it("disables a built-in npx entry when no local adapter is present", () => {
    const next = disableBuiltinClaudeAgent([builtinPinned()], false);
    expect(next[0]?.enabled).toBe(false);
  });

  it("disables a legacy unpinned npx entry too", () => {
    const next = disableBuiltinClaudeAgent([builtinLegacy()], false);
    expect(next[0]?.enabled).toBe(false);
  });

  it("disables the local-binary built-in shape when no adapter is present", () => {
    const next = disableBuiltinClaudeAgent([builtinLocal()], false);
    expect(next[0]?.enabled).toBe(false);
  });

  it("keeps the user's enabled value when a local adapter is present", () => {
    const enabled = disableBuiltinClaudeAgent(
      [{ ...builtinPinned(), enabled: true }],
      true,
    );
    expect(enabled[0]?.enabled).toBe(true);
    const untouched = disableBuiltinClaudeAgent([builtinPinned()], true);
    expect(untouched[0]?.enabled).toBeUndefined();
  });

  it("never modifies an entry the user customised", () => {
    const custom = builtinPinned();
    custom.command = "my-claude";
    custom.args = ["--acp"];
    const next = disableBuiltinClaudeAgent([custom], false);
    expect(next[0]).toMatchObject({ command: "my-claude", args: ["--acp"] });
    expect(next[0]?.enabled).toBeUndefined();
  });

  it("leaves other agents untouched", () => {
    const opencode: AgentConfig = {
      id: "opencode",
      name: "OpenCode",
      command: "opencode",
      args: ["acp"],
    };
    const next = disableBuiltinClaudeAgent([opencode, builtinPinned()], false);
    expect(next[0]).toBe(opencode);
  });

  it("is idempotent and returns the same list when nothing changes", () => {
    const list = [{ ...builtinPinned(), enabled: false }];
    expect(disableBuiltinClaudeAgent(list, false)).toBe(list);
    const untouched = [builtinPinned()];
    expect(disableBuiltinClaudeAgent(untouched, true)).toBe(untouched);
  });
});

describe("hasBinaryOnPath", () => {
  it("returns a boolean without throwing for a missing binary", () => {
    expect(hasBinaryOnPath("relay-definitely-not-a-real-binary")).toBe(false);
  });
});
