import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { AcpSession, promptBlocks } from "../src/main/acp-session.ts";
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

function waitForExit(predicate: () => boolean, timeoutMs = 2000): Promise<void> {
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
