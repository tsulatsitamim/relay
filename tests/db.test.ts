import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { openStore } from "../src/main/db.ts";
import type { AgentConfig, Session, TranscriptEvent } from "../src/shared/types.ts";

describe("Store", () => {
  it("persists sessions, transcript, agents, and recents across reopen", async () => {
    const file = join(mkdtempSync(join(tmpdir(), "relay-store-")), "relay.db");
    const store = await openStore(file);

    const agent: AgentConfig = {
      id: "opencode",
      name: "OpenCode",
      command: "opencode",
      args: ["acp"],
    };
    store.saveAgents([agent]);
    store.touchRecent("/tmp/project");

    const session: Session = {
      id: "sess-1",
      title: "Fix auth",
      agentConfigId: "opencode",
      agentName: "OpenCode",
      workingDirectory: "/tmp/project",
      status: "idle",
      createdAt: 1,
      updatedAt: 1,
      acpSessionId: "acp-1",
    };
    store.saveSession(session);

    const event: TranscriptEvent = {
      id: "e1",
      sessionId: "sess-1",
      seq: 1,
      kind: "user",
      payload: { text: "hello" },
      createdAt: 1,
    };
    store.appendEvent(event);

    const reopened = await openStore(file);
    expect(reopened.listAgents()).toEqual([agent]);
    expect(reopened.listRecents()).toEqual(["/tmp/project"]);
    expect(reopened.listSessions()[0]).toMatchObject({
      id: "sess-1",
      acpSessionId: "acp-1",
      status: "exited",
    });
    expect(reopened.listEvents("sess-1")).toHaveLength(1);
    expect(reopened.listEvents("sess-1")[0].payload).toEqual({ text: "hello" });
  });

  it("stores an agent default per working directory and overwrites it", async () => {
    const file = join(mkdtempSync(join(tmpdir(), "relay-store-")), "relay.db");
    const store = await openStore(file);
    expect(store.listAgentDefaults()).toEqual([]);

    store.setAgentDefault("/tmp/a", "opencode");
    store.setAgentDefault("/tmp/b", "claude-code");
    store.setAgentDefault("/tmp/a", "claude-code");

    const reopened = await openStore(file);
    expect(
      reopened.listAgentDefaults().sort((a, b) => a.cwd.localeCompare(b.cwd)),
    ).toEqual([
      { cwd: "/tmp/a", agentId: "claude-code" },
      { cwd: "/tmp/b", agentId: "claude-code" },
    ]);
  });

  it("starts with no repositories and persists added ones", async () => {
    const file = join(mkdtempSync(join(tmpdir(), "relay-store-")), "relay.db");
    const store = await openStore(file);
    expect(store.listRepos()).toEqual([]);

    store.addRepo({ path: "/tmp/relay", name: "relay", addedAt: 10 });
    store.addRepo({ path: "/tmp/kk", name: "kk", addedAt: 20 });
    expect(store.listRepos().map((r) => r.path)).toEqual(["/tmp/kk", "/tmp/relay"]);

    store.removeRepo("/tmp/kk");
    const reopened = await openStore(file);
    expect(reopened.listRepos()).toEqual([
      { path: "/tmp/relay", name: "relay", addedAt: 10 },
    ]);
  });

  it("deletes an event and every later event of the same session", async () => {
    const file = join(mkdtempSync(join(tmpdir(), "relay-store-")), "relay.db");
    const store = await openStore(file);
    for (const seq of [1, 2, 3, 4]) {
      store.appendEvent({
        id: `e${seq}`,
        sessionId: "sess-1",
        seq,
        kind: "user",
        payload: { text: `m${seq}` },
        createdAt: seq,
      });
    }
    store.appendEvent({
      id: "other",
      sessionId: "sess-2",
      seq: 1,
      kind: "user",
      payload: { text: "other" },
      createdAt: 1,
    });

    store.deleteEventsFrom("sess-1", 3);

    expect(store.listEvents("sess-1").map((e) => e.id)).toEqual(["e1", "e2"]);
    expect(store.listEvents("sess-2").map((e) => e.id)).toEqual(["other"]);
  });

  it("deletes a session and its events", async () => {
    const file = join(mkdtempSync(join(tmpdir(), "relay-store-")), "relay.db");
    const store = await openStore(file);
    store.saveSession({
      id: "sess-1",
      title: "x",
      agentConfigId: "a",
      agentName: "A",
      workingDirectory: "/tmp",
      status: "idle",
      createdAt: 1,
      updatedAt: 1,
    });
    store.appendEvent({
      id: "e1",
      sessionId: "sess-1",
      seq: 1,
      kind: "user",
      payload: { text: "hi" },
      createdAt: 1,
    });
    store.deleteSession("sess-1");
    expect(store.listSessions()).toEqual([]);
    expect(store.listEvents("sess-1")).toEqual([]);
  });
});
