import { afterEach, describe, expect, it, vi } from "vitest";
import { defaultAgents } from "../src/main/session-manager.ts";

describe("defaultAgents", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("includes OpenCode and Claude Code ACP commands", () => {
    vi.stubEnv("PATH", "");
    const agents = defaultAgents();
    const opencode = agents.find((a) => a.id === "opencode");
    const claude = agents.find((a) => a.id === "claude-code");
    expect(opencode).toMatchObject({ command: "opencode", args: ["acp"] });
    expect(claude).toMatchObject({
      command: "npx",
      args: ["-y", "@zed-industries/claude-code-acp@0.16.2"],
    });
  });

  it("prepends the fake agent when a path is provided", () => {
    const agents = defaultAgents("/tmp/fake-acp-agent.mjs");
    expect(agents[0]?.id).toBe("fake");
    expect(agents[0]?.args).toEqual(["/tmp/fake-acp-agent.mjs"]);
  });
});
