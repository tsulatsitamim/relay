import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { AcpSession } from "../src/main/acp-session.ts";
import type { SessionUpdate } from "@agentclientprotocol/sdk";

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
  const permissions: Array<{ title?: string; optionId: string; toolCallId?: string }> = [];
  const session = new AcpSession({
    command: process.execPath,
    args: [agentPath],
    cwd: process.cwd(),
    env: fakeEnv(),
    onUpdate: (update) => updates.push(update),
    onPermission: (info) => permissions.push(info),
    ...overrides,
  });
  sessions.push(session);
  return { session, updates, permissions };
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

  it("auto-approves permission requests and records the choice", async () => {
    const { session, permissions } = createSession();
    await session.start();
    await session.prompt("need permission");
    expect(permissions.length).toBeGreaterThan(0);
    expect(permissions[0]?.optionId).toBe("allow");
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
