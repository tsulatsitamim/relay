import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { AcpSession } from "../src/main/acp-session.ts";
import { SessionManager } from "../src/main/session-manager.ts";
import { openStore } from "../src/main/db.ts";
import type { SessionUpdate } from "@agentclientprotocol/sdk";
import type { AgentConfig } from "../src/shared/types.ts";

const agentPath = fileURLToPath(
  new URL("../agents/fake-acp-agent.mjs", import.meta.url),
);

const sessions: AcpSession[] = [];
const managers: SessionManager[] = [];

afterEach(async () => {
  await Promise.all(sessions.splice(0).map((s) => s.kill()));
  await Promise.all(managers.splice(0).map((m) => m.shutdown()));
});

function fakeEnv() {
  const dir = mkdtempSync(join(tmpdir(), "relay-mode-"));
  return { FAKE_ACP_STORE: join(dir, "store.json") };
}

function fakeAgent(): AgentConfig {
  return {
    id: "fake",
    name: "Fake ACP",
    command: process.execPath,
    args: [agentPath],
    env: fakeEnv(),
  };
}

async function manager(): Promise<SessionManager> {
  const dir = mkdtempSync(join(tmpdir(), "relay-mode-db-"));
  const store = await openStore(join(dir, "relay.db"));
  const sm = new SessionManager(store);
  managers.push(sm);
  return sm;
}

async function waitFor<T>(
  get: () => T | null | undefined | false,
  timeoutMs = 3000,
): Promise<T> {
  const started = Date.now();
  for (;;) {
    const value = get();
    if (value) return value as T;
    if (Date.now() - started > timeoutMs) throw new Error("timed out waiting");
    await new Promise((r) => setTimeout(r, 10));
  }
}

describe("AcpSession modes", () => {
  it("captures available modes and the current mode from the agent", async () => {
    const updates: SessionUpdate[] = [];
    const session = new AcpSession({
      command: process.execPath,
      args: [agentPath],
      cwd: process.cwd(),
      env: fakeEnv(),
      onUpdate: (update) => updates.push(update),
    });
    sessions.push(session);

    const started = await session.start();
    expect(started.modes).toEqual([
      { id: "build", name: "Build" },
      { id: "plan", name: "Plan" },
    ]);
    expect(started.currentModeId).toBe("build");
  });

  it("sends session/setMode and the agent broadcasts current_mode_update", async () => {
    const updates: SessionUpdate[] = [];
    const session = new AcpSession({
      command: process.execPath,
      args: [agentPath],
      cwd: process.cwd(),
      env: fakeEnv(),
      onUpdate: (update) => updates.push(update),
    });
    sessions.push(session);

    await session.start();
    await session.setMode("plan");
    await waitFor(() =>
      updates.some((u) => u.sessionUpdate === "current_mode_update"),
    );
    const changed = updates.find(
      (u) => u.sessionUpdate === "current_mode_update",
    );
    expect(changed?.currentModeId).toBe("plan");
  });
});

describe("SessionManager modes", () => {
  it("stores modes on the session and applies a mode change", async () => {
    const sm = await manager();
    const created = await sm.create({
      agent: fakeAgent(),
      cwd: process.cwd(),
      prompt: "warmup",
    });

    expect(sm.get(created.id)?.modes).toEqual([
      { id: "build", name: "Build" },
      { id: "plan", name: "Plan" },
    ]);
    expect(sm.get(created.id)?.currentModeId).toBe("build");

    await sm.setMode(created.id, "plan");
    await waitFor(() => sm.get(created.id)?.currentModeId === "plan");
    expect(sm.get(created.id)?.currentModeId).toBe("plan");
  });
});
