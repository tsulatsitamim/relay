import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import { SessionManager } from "../src/main/session-manager.ts";
import { openStore } from "../src/main/db.ts";
import type { AgentConfig } from "../src/shared/types.ts";

const agentPath = fileURLToPath(
  new URL("../agents/fake-acp-agent.mjs", import.meta.url),
);

const managers: SessionManager[] = [];

afterEach(async () => {
  await Promise.all(managers.splice(0).map((m) => m.shutdown()));
});

function fakeAgent(): AgentConfig {
  return {
    id: "fake",
    name: "Fake ACP",
    command: process.execPath,
    args: [agentPath],
    env: {
      FAKE_ACP_STORE: join(
        mkdtempSync(join(tmpdir(), "relay-mgr-")),
        "store.json",
      ),
    },
  };
}

async function manager() {
  const dir = mkdtempSync(join(tmpdir(), "relay-db-"));
  const store = await openStore(join(dir, "relay.db"));
  const sm = new SessionManager(store);
  managers.push(sm);
  return sm;
}

describe("SessionManager", () => {
  it("runs two sessions at once and switches snapshots instantly", async () => {
    const sm = await manager();
    const agent = fakeAgent();
    const a = await sm.create({ agent, cwd: process.cwd(), prompt: "task a" });
    const b = await sm.create({ agent, cwd: process.cwd(), prompt: "task b" });

    expect(a.id).not.toBe(b.id);
    expect(sm.list().map((s) => s.id).sort()).toEqual([a.id, b.id].sort());

    const snapA = sm.transcript(a.id);
    const snapB = sm.transcript(b.id);
    expect(snapA.some((e) => e.kind === "user" && String(e.payload.text).includes("task a"))).toBe(true);
    expect(snapB.some((e) => e.kind === "user" && String(e.payload.text).includes("task b"))).toBe(true);
    expect(snapA.some((e) => e.kind === "agent_message")).toBe(true);
    expect(snapB.some((e) => e.kind === "agent_message")).toBe(true);
  });

  it("cancels an in-flight turn", async () => {
    const sm = await manager();
    const session = await sm.create({
      agent: fakeAgent(),
      cwd: process.cwd(),
      prompt: "warmup",
    });
    const sending = sm.send(session.id, "SLOW cancel me");
    await new Promise((r) => setTimeout(r, 40));
    await sm.cancel(session.id);
    await sending;
    expect(["idle", "cancelling"].includes(sm.get(session.id)?.status ?? "")).toBe(true);
    expect(sm.get(session.id)?.status).toBe("idle");
  });

  it("respawns and session/loads after shutdown when sending a follow-up", async () => {
    const sm = await manager();
    const session = await sm.create({
      agent: fakeAgent(),
      cwd: process.cwd(),
      prompt: "original task",
    });
    const acpId = sm.get(session.id)?.acpSessionId;
    expect(acpId).toBeTruthy();

    await sm.detachAll();
    expect(sm.get(session.id)?.status).toBe("exited");

    await sm.send(session.id, "follow up");
    expect(sm.get(session.id)?.status).toBe("idle");
    expect(sm.get(session.id)?.acpSessionId).toBe(acpId);
    const events = sm.transcript(session.id);
    expect(
      events.some(
        (e) =>
          e.kind === "agent_message" &&
          String(e.payload.text).includes("echo: follow up"),
      ),
    ).toBe(true);
  });
});
