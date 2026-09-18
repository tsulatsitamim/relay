import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AcpSession,
  authMethodsFrom,
  configOptionsFrom,
  isAuthRequired,
  promptBlocks,
} from "../src/main/acp-session.ts";
import { pickAutoAllowOption } from "../src/main/permission.ts";
import type { SessionUpdate } from "@agentclientprotocol/sdk";
import type {
  PermissionAnswer,
  PermissionPrompt,
} from "../src/main/acp-session.ts";

const agentPath = fileURLToPath(
  new URL("../agents/fake-acp-agent.mjs", import.meta.url),
);

const sessions: AcpSession[] = [];

afterEach(async () => {
  await Promise.all(sessions.splice(0).map((s) => s.kill()));
});

function fakeEnv() {
  const dir = mkdtempSync(join(tmpdir(), "relay-acp-"));
  return { FAKE_ACP_STORE: join(dir, "store.json") };
}

function createSession(overrides: Partial<ConstructorParameters<typeof AcpSession>[0]> = {}) {
  const updates: SessionUpdate[] = [];
  const prompts: PermissionPrompt[] = [];
  const session = new AcpSession({
    command: process.execPath,
    args: [agentPath],
    cwd: process.cwd(),
    env: fakeEnv(),
    onUpdate: (update) => updates.push(update),
    requestPermission: async (prompt) => {
      prompts.push(prompt);
      const optionId = pickAutoAllowOption(prompt.options);
      return optionId
        ? ({ outcome: "selected", optionId } satisfies PermissionAnswer)
        : ({ outcome: "cancelled" } satisfies PermissionAnswer);
    },
    ...overrides,
  });
  sessions.push(session);
  return { session, updates, prompts };
}

function waitForExit(predicate: () => boolean, timeoutMs = 10_000): Promise<void> {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const tick = () => {
      if (predicate()) return resolve();
      if (Date.now() - started > timeoutMs) {
        return reject(new Error("timed out waiting for exit"));
      }
      setTimeout(tick, 10);
    };
    tick();
  });
}

describe("AcpSession", () => {
  it("spawns the fake agent, prompts, and streams a text update", async () => {
    const { session, updates } = createSession();
    const started = await session.start();
    expect(started.acpSessionId).toBeTruthy();

    const result = await session.prompt("hello relay");
    expect(result.stopReason).toBe("end_turn");
    expect(
      updates.some(
        (u) =>
          u.sessionUpdate === "agent_message_chunk" &&
          u.content?.type === "text" &&
          u.content.text.includes("echo: hello relay"),
      ),
    ).toBe(true);
  });

  it("routes permission requests to the handler and honors the selected option", async () => {
    const prompts: PermissionPrompt[] = [];
    const { session } = createSession({
      requestPermission: async (prompt) => {
        prompts.push(prompt);
        return { outcome: "selected", optionId: "allow" };
      },
    });
    await session.start();
    const result = await session.prompt("need permission");

    expect(result.stopReason).toBe("end_turn");
    expect(prompts).toHaveLength(1);
    expect(prompts[0]?.toolCallId).toBe("call_edit");
    expect(prompts[0]?.title).toBe("Edit README.md");
    expect(prompts[0]?.options.map((o) => o.optionId)).toEqual(["allow", "reject"]);
  });

  it("cancels the turn when the handler cancels the permission request", async () => {
    const { session } = createSession({
      requestPermission: async () => ({ outcome: "cancelled" }),
    });
    await session.start();
    const result = await session.prompt("need permission");
    expect(result.stopReason).toBe("cancelled");
  });

  it("cancels the permission request when no handler is provided", async () => {
    const { session } = createSession({ requestPermission: undefined });
    await session.start();
    const result = await session.prompt("need permission");
    expect(result.stopReason).toBe("cancelled");
  });

  it("reports an unexpected agent exit after the handshake", async () => {
    const exits: Array<{ code: number | null; signal: string | null }> = [];
    const { session } = createSession({
      onExit: (info) => exits.push(info),
    });
    await session.start();
    process.kill(session.pid!, "SIGKILL");
    await waitForExit(() => exits.length > 0);
    expect(exits).toHaveLength(1);
  });

  it("does not report an exit when the session is killed intentionally", async () => {
    const exits: unknown[] = [];
    const { session } = createSession({
      onExit: (info) => exits.push(info),
    });
    await session.start();
    await session.kill();
    await new Promise((r) => setTimeout(r, 50));
    expect(exits).toHaveLength(0);
  });

  it("cancels a slow prompt", async () => {
    const { session } = createSession();
    await session.start();
    const pending = session.prompt("SLOW please");
    await new Promise((r) => setTimeout(r, 50));
    await session.cancel();
    const result = await pending;
    expect(result.stopReason).toBe("cancelled");
  });

  it("tolerates a malformed availableModes without throwing", async () => {
    const { session } = createSession({
      env: { ...fakeEnv(), FAKE_ACP_MALFORMED_MODES: "1" },
    });
    const started = await session.start();
    expect(started.modes).toEqual([]);
  });

  it("kills and clears the child when the agent command cannot be spawned", async () => {
    const { session } = createSession({
      command: join(tmpdir(), "relay-missing-agent-command"),
      args: [],
    });
    const killSpy = vi.spyOn(session, "kill");
    await expect(session.start()).rejects.toThrow();
    expect(killSpy).toHaveBeenCalledTimes(1);
    expect(session.pid).toBeUndefined();
  });

  it("loads a previous ACP session after the process is killed", async () => {
    const env = fakeEnv();
    const first = createSession({ env });
    const started = await first.session.start();
    await first.session.prompt("remember me");
    await first.session.kill();

    const replayed: SessionUpdate[] = [];
    const second = createSession({
      env,
      resumeSessionId: started.acpSessionId,
      onUpdate: (update) => replayed.push(update),
    });
    const loaded = await second.session.start();
    expect(loaded.acpSessionId).toBe(started.acpSessionId);
    expect(loaded.resumed).toBe(true);
    expect(
      replayed.some(
        (u) =>
          u.sessionUpdate === "agent_message_chunk" &&
          u.content?.type === "text" &&
          u.content.text.includes("echo: remember me"),
      ),
    ).toBe(true);
  });
});

describe("AcpSession MCP servers", () => {
  it("forwards configured MCP servers to the agent on newSession", async () => {
    const dir = mkdtempSync(join(tmpdir(), "relay-acp-mcp-"));
    const storePath = join(dir, "store.json");
    const servers = [
      {
        name: "fs",
        command: "npx",
        args: ["-y", "server-fs"],
        env: [{ name: "ROOT", value: "/tmp" }],
      },
      {
        name: "remote",
        url: "https://example.com/mcp",
        headers: [{ name: "Authorization", value: "Bearer x" }],
        type: "http" as const,
      },
    ];
    const { session } = createSession({
      env: { FAKE_ACP_STORE: storePath, FAKE_ACP_MCP_DUMP: "1" },
      mcpServers: servers,
    });
    await session.start();

    const dumpPath = join(dir, "mcp.json");
    const dumped = existsSync(dumpPath)
      ? (JSON.parse(readFileSync(dumpPath, "utf8")) as unknown)
      : null;
    expect(dumped).toEqual(servers);
  });
});

describe("configOptionsFrom", () => {
  it("returns an empty list for non-arrays", () => {
    expect(configOptionsFrom(undefined)).toEqual([]);
    expect(configOptionsFrom(null)).toEqual([]);
    expect(configOptionsFrom("nope")).toEqual([]);
    expect(configOptionsFrom({})).toEqual([]);
  });

  it("drops invalid entries and normalises the rest", () => {
    const raw = [
      null,
      {},
      { id: "", currentValue: "x" },
      { id: "model", currentValue: 5 },
      {
        id: "effort",
        name: "Effort",
        currentValue: "low",
        values: [null, { value: 123 }, { value: "low" }],
      },
    ];
    expect(configOptionsFrom(raw)).toEqual([
      {
        id: "effort",
        name: "Effort",
        type: "select",
        currentValue: "low",
        values: [{ value: "low", name: "low" }],
      },
    ]);
  });

  it("falls back to the id for a missing name and keeps string descriptions", () => {
    const raw = [
      {
        id: "model",
        currentValue: "a",
        type: "select",
        description: 7,
        values: [
          { value: "a", name: "A", description: "The A model" },
          { value: "b", name: 3, description: null },
        ],
      },
    ];
    expect(configOptionsFrom(raw)).toEqual([
      {
        id: "model",
        name: "model",
        type: "select",
        currentValue: "a",
        values: [
          { value: "a", name: "A", description: "The A model" },
          { value: "b", name: "b" },
        ],
      },
    ]);
  });

  it("defaults a non-string type to select and ignores non-string descriptions", () => {
    const raw = [
      { id: "model", currentValue: "a", type: 42, description: "hi", values: [] },
    ];
    expect(configOptionsFrom(raw)).toEqual([
      {
        id: "model",
        name: "model",
        type: "select",
        currentValue: "a",
        description: "hi",
        values: [],
      },
    ]);
  });

  it("accepts the protocol options field as a fallback", () => {
    const raw = [
      {
        id: "effort",
        name: "Effort",
        type: "select",
        currentValue: "low",
        options: [
          { value: "low", name: "Low" },
          { value: "high", name: "High", description: "More thinking" },
        ],
      },
    ];
    expect(configOptionsFrom(raw)).toEqual([
      {
        id: "effort",
        name: "Effort",
        type: "select",
        currentValue: "low",
        values: [
          { value: "low", name: "Low" },
          { value: "high", name: "High", description: "More thinking" },
        ],
      },
    ]);
  });
});

describe("AcpSession config options", () => {
  it("captures configOptions from newSession", async () => {
    const { session } = createSession();
    await session.start();
    expect(session.configOptions?.map((option) => option.id)).toEqual([
      "model",
      "effort",
      "mode",
    ]);
    expect(
      session.configOptions?.find((option) => option.id === "model")?.currentValue,
    ).toBe("deepseek/deepseek-v4-flash");
  });

  it("captures configOptions from loadSession when resuming", async () => {
    const env = fakeEnv();
    const first = createSession({ env });
    const started = await first.session.start();
    await first.session.setConfigOption("effort", "high");
    await first.session.kill();

    const second = createSession({ env, resumeSessionId: started.acpSessionId });
    const loaded = await second.session.start();
    expect(loaded.resumed).toBe(true);
    expect(
      second.session.configOptions?.find((option) => option.id === "effort")
        ?.currentValue,
    ).toBe("high");
  });

  it("sets a config option and returns the sanitised options", async () => {
    const { session } = createSession();
    await session.start();
    const next = await session.setConfigOption("effort", "high");
    expect(next.find((option) => option.id === "effort")?.currentValue).toBe("high");
    expect(
      session.configOptions?.find((option) => option.id === "effort")?.currentValue,
    ).toBe("high");
  });

  it("rejects setting a config option before the session starts", async () => {
    const { session } = createSession();
    await expect(session.setConfigOption("effort", "high")).rejects.toThrow(
      "session is not started",
    );
  });

  it("captures prompt usage", async () => {
    const { session } = createSession();
    await session.start();
    const result = await session.prompt("hello relay");
    expect(result.usage).toEqual({
      inputTokens: 1200,
      outputTokens: 340,
      totalTokens: 1540,
      cachedReadTokens: 512,
    });
  });
});

describe("promptBlocks", () => {
  it("builds image content blocks for attachments", () => {
    const blocks = promptBlocks("look", [
      { name: "a.png", mimeType: "image/png", data: "AAAA" },
    ]);
    expect(blocks).toEqual([
      { type: "text", text: "look" },
      { type: "image", mimeType: "image/png", data: "AAAA", uri: null },
    ]);
  });
});

describe("authMethodsFrom", () => {
  it("returns an empty list for non-arrays", () => {
    expect(authMethodsFrom(undefined)).toEqual([]);
    expect(authMethodsFrom(null)).toEqual([]);
    expect(authMethodsFrom("nope")).toEqual([]);
    expect(authMethodsFrom({})).toEqual([]);
  });

  it("skips entries without a string id and name", () => {
    const raw = [
      null,
      {},
      { id: "a" },
      { name: "A" },
      { id: 7, name: "A" },
      { id: "a", name: 7 },
      { id: "ok", name: "Ok" },
    ];
    expect(authMethodsFrom(raw)).toEqual([{ id: "ok", name: "Ok" }]);
  });

  it("keeps string descriptions and ignores extra keys", () => {
    const raw = [
      { id: "a", name: "A", description: "Use A", extra: true },
      { id: "b", name: "B", description: 42, extra: true },
    ];
    expect(authMethodsFrom(raw)).toEqual([
      { id: "a", name: "A", description: "Use A" },
      { id: "b", name: "B" },
    ]);
  });
});

describe("isAuthRequired", () => {
  it("is true for a -32000 error shape and false otherwise", () => {
    expect(
      isAuthRequired({ code: -32000, message: "Authentication required" }),
    ).toBe(true);
    expect(isAuthRequired(Object.assign(new Error("nope"), { code: -32000 }))).toBe(
      true,
    );
    expect(isAuthRequired({ code: -32603 })).toBe(false);
    expect(isAuthRequired(new Error("boom"))).toBe(false);
    expect(isAuthRequired(null)).toBe(false);
    expect(isAuthRequired("nope")).toBe(false);
  });
});

describe("AcpSession authentication", () => {
  it("captures authMethods from initialize and authenticates before newSession", async () => {
    const { session } = createSession({
      env: { ...fakeEnv(), FAKE_ACP_REQUIRE_AUTH: "1" },
      authMethodId: "fake-login",
    });
    const started = await session.start();
    expect(started.acpSessionId).toBeTruthy();
    expect(session.authMethods).toEqual([
      { id: "fake-login", name: "Login with fake" },
    ]);
    expect(session.authRequired).toBe(false);
  });

  it("reports auth-required when newSession rejects with -32000", async () => {
    const { session } = createSession({
      env: { ...fakeEnv(), FAKE_ACP_REQUIRE_AUTH: "1" },
    });
    await expect(session.start()).rejects.toMatchObject({ code: -32000 });
    expect(session.authRequired).toBe(true);
    expect(session.authMethods).toEqual([
      { id: "fake-login", name: "Login with fake" },
    ]);
  });
});
