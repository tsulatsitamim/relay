import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import { SessionManager, type ManagerEvent } from "../src/main/session-manager.ts";
import { openStore } from "../src/main/db.ts";
import { mcpServersToAcp } from "../src/shared/mcp.ts";
import type { AgentConfig, PermissionRequest } from "../src/shared/types.ts";

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

async function waitFor<T>(get: () => T | null | undefined, timeoutMs = 10_000): Promise<T> {
  const started = Date.now();
  for (;;) {
    const value = get();
    if (value) return value;
    if (Date.now() - started > timeoutMs) throw new Error("timed out waiting");
    await new Promise((r) => setTimeout(r, 10));
  }
}

function within<T>(promise: Promise<T>, ms = 1500): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`did not resolve within ${ms}ms`)), ms),
    ),
  ]);
}

function firstPermission(events: ManagerEvent[]): PermissionRequest | null {
  for (const event of events) {
    if (event.type === "permission") return event.request;
  }
  return null;
}

describe("SessionManager", () => {
  it("records the agent used for a cwd and overwrites it for a later create", async () => {
    const dir = mkdtempSync(join(tmpdir(), "relay-db-"));
    const store = await openStore(join(dir, "relay.db"));
    const sm = new SessionManager(store);
    managers.push(sm);

    expect(sm.agentDefaults()).toEqual({});

    await sm.create({ agent: fakeAgent(), cwd: "/tmp/proj-a", prompt: "one" });
    expect(sm.agentDefaults()).toEqual({ "/tmp/proj-a": "fake" });

    const other = { ...fakeAgent(), id: "fake-2", name: "Fake 2" };
    await sm.create({ agent: other, cwd: "/tmp/proj-a", prompt: "two" });
    await sm.create({ agent: other, cwd: "/tmp/proj-b", prompt: "three" });
    expect(sm.agentDefaults()).toEqual({
      "/tmp/proj-a": "fake-2",
      "/tmp/proj-b": "fake-2",
    });
  });

  it("runs two sessions at once and switches snapshots instantly", async () => {
    const sm = await manager();
    const agent = fakeAgent();
    const a = await sm.create({ agent, cwd: process.cwd(), prompt: "task a" });
    const b = await sm.create({ agent, cwd: process.cwd(), prompt: "task b" });

    expect(a.id).not.toBe(b.id);
    expect(sm.list().map((s) => s.id).sort()).toEqual([a.id, b.id].sort());

    expect(
      sm.transcript(a.id).some((e) => e.kind === "user" && String(e.payload.text).includes("task a")),
    ).toBe(true);
    expect(
      sm.transcript(b.id).some((e) => e.kind === "user" && String(e.payload.text).includes("task b")),
    ).toBe(true);

    await waitFor(() =>
      sm.transcript(a.id).some((e) => e.kind === "agent_message") ? true : null,
    );
    await waitFor(() =>
      sm.transcript(b.id).some((e) => e.kind === "agent_message") ? true : null,
    );
    expect(sm.transcript(a.id).some((e) => e.kind === "agent_message")).toBe(true);
    expect(sm.transcript(b.id).some((e) => e.kind === "agent_message")).toBe(true);
  });

  it("cancels an in-flight turn", async () => {
    const sm = await manager();
    const session = await sm.create({
      agent: fakeAgent(),
      cwd: process.cwd(),
      prompt: "warmup",
    });
    await waitFor(() =>
      sm.get(session.id)?.status === "idle" ? true : null,
    );
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
    const acpId = await waitFor(() => sm.get(session.id)?.acpSessionId ?? null);
    await waitFor(() =>
      sm.get(session.id)?.status === "idle" ? true : null,
    );

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

  it("surfaces a permission request and applies the chosen option", async () => {
    const sm = await manager();
    const events: ManagerEvent[] = [];
    sm.onEvent((e) => events.push(e));

    const creating = sm.create({
      agent: fakeAgent(),
      cwd: process.cwd(),
      prompt: "need permission",
    });
    const request = await waitFor(() => firstPermission(events));
    expect(request.title).toBe("Edit README.md");
    expect(sm.pendingPermissions().map((r) => r.id)).toEqual([request.id]);

    sm.answerPermission(request.id, "allow");
    const session = await creating;

    expect(sm.pendingPermissions()).toHaveLength(0);
    await waitFor(() =>
      sm.transcript(session.id).some((e) => e.kind === "diff") ? true : null,
    );
  });

  it("tracks auto-approved sessions and clears them on disable and delete", async () => {
    const sm = await manager();
    expect(sm.autoApproveSessions()).toEqual([]);

    const session = await sm.create({
      agent: fakeAgent(),
      cwd: process.cwd(),
      prompt: "auto approve",
    });
    await waitFor(() => (sm.get(session.id)?.status === "idle" ? true : null));

    sm.setAutoApprove(session.id, true);
    expect(sm.autoApproveSessions()).toEqual([session.id]);

    sm.setAutoApprove(session.id, false);
    expect(sm.autoApproveSessions()).toEqual([]);

    sm.setAutoApprove(session.id, true);
    await sm.delete(session.id);
    expect(sm.autoApproveSessions()).toEqual([]);
  });

  it("cancels the turn when the user rejects the permission request", async () => {
    const sm = await manager();
    const events: ManagerEvent[] = [];
    sm.onEvent((e) => events.push(e));

    const creating = sm.create({
      agent: fakeAgent(),
      cwd: process.cwd(),
      prompt: "need permission",
    });
    const request = await waitFor(() => firstPermission(events));
    sm.answerPermission(request.id, null);
    const session = await creating;

    await waitFor(() =>
      sm
        .transcript(session.id)
        .some((e) => e.kind === "status" && String(e.payload.text).includes("Cancelled"))
        ? true
        : null,
    );
    expect(sm.transcript(session.id).some((e) => e.kind === "diff")).toBe(false);
  });

  it("resolves create before the first turn finishes", async () => {
    const sm = await manager();
    const created = await within(
      sm.create({
        agent: fakeAgent(),
        cwd: process.cwd(),
        prompt: "SLOW warmup",
      }),
    );

    expect(["starting", "working"]).toContain(sm.get(created.id)?.status);
    expect(
      sm.transcript(created.id).some((e) => e.kind === "agent_message"),
    ).toBe(false);

    await waitFor(() =>
      sm.transcript(created.id).some((e) => e.kind === "agent_message")
        ? true
        : null,
    );
  });

  it("surfaces a first-turn permission request after create resolves", async () => {
    const sm = await manager();
    const created = await within(
      sm.create({
        agent: fakeAgent(),
        cwd: process.cwd(),
        prompt: "need permission",
      }),
    );

    const request = await waitFor(() =>
      sm.pendingPermissions().find((p) => p.sessionId === created.id) ?? null,
    );
    sm.answerPermission(request.id, "allow");

    await waitFor(() =>
      sm.transcript(created.id).some((e) => e.kind === "diff") ? true : null,
    );
  });

  it("auto-approves permission requests while enabled for a session", async () => {
    const sm = await manager();
    const events: ManagerEvent[] = [];
    sm.onEvent((e) => events.push(e));

    const session = await sm.create({
      agent: fakeAgent(),
      cwd: process.cwd(),
      prompt: "warmup",
    });
    await waitFor(() => (sm.get(session.id)?.status === "idle" ? true : null));

    sm.setAutoApprove(session.id, true);
    await sm.send(session.id, "need permission");

    expect(sm.pendingPermissions()).toHaveLength(0);
    expect(events.some((e) => e.type === "permission")).toBe(false);
    await waitFor(() =>
      sm.transcript(session.id).some((e) => e.kind === "diff") ? true : null,
    );
  });

  it("surfaces permission requests again after auto-approve is disabled", async () => {
    const sm = await manager();
    const events: ManagerEvent[] = [];
    sm.onEvent((e) => events.push(e));

    const session = await sm.create({
      agent: fakeAgent(),
      cwd: process.cwd(),
      prompt: "warmup",
    });
    await waitFor(() => (sm.get(session.id)?.status === "idle" ? true : null));

    sm.setAutoApprove(session.id, true);
    sm.setAutoApprove(session.id, false);
    const sending = sm.send(session.id, "need permission");
    const request = await waitFor(() => firstPermission(events));
    expect(sm.pendingPermissions().map((r) => r.id)).toEqual([request.id]);
    sm.answerPermission(request.id, "allow");
    await sending;
  });

  it("clears auto-approve when the session restarts", async () => {
    const sm = await manager();
    const events: ManagerEvent[] = [];
    sm.onEvent((e) => events.push(e));

    const session = await sm.create({
      agent: fakeAgent(),
      cwd: process.cwd(),
      prompt: "warmup",
    });
    await waitFor(() => (sm.get(session.id)?.status === "idle" ? true : null));

    sm.setAutoApprove(session.id, true);
    await sm.restart(session.id);
    await waitFor(() => (sm.get(session.id)?.status === "idle" ? true : null));

    const sending = sm.send(session.id, "need permission");
    const request = await waitFor(() => firstPermission(events));
    expect(request.title).toBe("Edit README.md");
    sm.answerPermission(request.id, "allow");
    await sending;
  });

  it("marks a session exited when its agent process dies unexpectedly", async () => {
    const sm = await manager();
    const session = await sm.create({
      agent: fakeAgent(),
      cwd: process.cwd(),
      prompt: "warmup",
    });

    await sm.send(session.id, "please EXIT now");
    await waitFor(() => (sm.get(session.id)?.status === "exited" ? true : null));

    expect(sm.get(session.id)?.status).toBe("exited");
    expect(
      sm
        .transcript(session.id)
        .some((e) => e.kind === "status" && String(e.payload.text).includes("exited")),
    ).toBe(true);
    expect(
      sm
        .transcript(session.id)
        .some(
          (e) =>
            e.kind === "agent_message" &&
            String(e.payload.text).includes("please EXIT now"),
        ),
    ).toBe(false);
  });

  it("records attachment names on the user event", async () => {
    const sm = await manager();
    const session = await sm.create({
      agent: fakeAgent(),
      cwd: process.cwd(),
      prompt: "warmup",
    });
    await sm.send(session.id, "see this", [
      { name: "shot.png", mimeType: "image/png", data: "AAAA" },
    ]);
    const user = sm
      .transcript(session.id)
      .find((event) => event.kind === "user" && event.payload.text === "see this");
    expect(user?.payload.attachments).toEqual([
      { name: "shot.png", mimeType: "image/png" },
    ]);
  });

  it("stores attachment thumbnails on the user event without the raw data", async () => {
    const sm = await manager();
    const session = await sm.create({
      agent: fakeAgent(),
      cwd: process.cwd(),
      prompt: "warmup",
    });
    await sm.send(session.id, "see this", [
      {
        name: "shot.png",
        mimeType: "image/png",
        data: "QQ==",
        thumb: "data:image/jpeg;base64,xyz",
      },
    ]);
    const user = sm
      .transcript(session.id)
      .find((event) => event.kind === "user" && event.payload.text === "see this");
    expect(user?.payload.attachments).toEqual([
      {
        name: "shot.png",
        mimeType: "image/png",
        thumb: "data:image/jpeg;base64,xyz",
      },
    ]);
  });

  it("truncates the in-memory and stored transcript from an event", async () => {
    const dir = mkdtempSync(join(tmpdir(), "relay-db-"));
    const store = await openStore(join(dir, "relay.db"));
    const sm = new SessionManager(store);
    managers.push(sm);

    const session = await sm.create({
      agent: fakeAgent(),
      cwd: process.cwd(),
      prompt: "first turn",
    });
    await waitFor(() =>
      sm.get(session.id)?.status === "idle" ? true : null,
    );
    await sm.send(session.id, "second turn");
    await waitFor(
      () =>
        sm.transcript(session.id).filter((e) => e.kind === "agent_message")
          .length >= 2
          ? true
          : null,
    );

    const before = sm.transcript(session.id);
    const target = before.find((e) => e.kind === "agent_message")!;
    const index = before.findIndex((e) => e.id === target.id);
    const expected = before.slice(0, index).map((e) => e.id);

    const trimmed = await sm.truncate(session.id, target.id);

    expect(trimmed.map((e) => e.id)).toEqual(expected);
    expect(sm.transcript(session.id).map((e) => e.id)).toEqual(expected);
    expect(store.listEvents(session.id).map((e) => e.id)).toEqual(expected);
    expect(
      sm.transcript(session.id).some((e) => e.kind === "agent_message"),
    ).toBe(false);

    await expect(sm.truncate(session.id, "missing")).rejects.toThrow(
      /unknown transcript event/,
    );
  });

  it("renames a session without bumping recency", async () => {
    const sm = await manager();
    const session = await sm.create({
      agent: fakeAgent(),
      cwd: process.cwd(),
      prompt: "warmup",
    });
    const before = sm.get(session.id)?.updatedAt;
    sm.setTitle(session.id, "Renamed chat");
    expect(sm.get(session.id)).toMatchObject({ title: "Renamed chat", updatedAt: before });
  });

  it("pins a session without bumping recency and removeRepo deletes its chats", async () => {
    const dir = mkdtempSync(join(tmpdir(), "relay-db-"));
    const store = await openStore(join(dir, "relay.db"));
    store.addRepo({ path: "/tmp/relay", name: "relay", addedAt: 1 });
    store.saveSession({
      id: "s1",
      title: "inside",
      agentConfigId: "a",
      agentName: "A",
      workingDirectory: "/tmp/relay",
      status: "idle",
      createdAt: 1,
      updatedAt: 10,
    });
    store.saveSession({
      id: "s2",
      title: "outside",
      agentConfigId: "a",
      agentName: "A",
      workingDirectory: "/tmp/other",
      status: "idle",
      createdAt: 1,
      updatedAt: 10,
    });
    const sm = new SessionManager(store);
    managers.push(sm);

    sm.setPinned("s1", true);
    expect(sm.get("s1")).toMatchObject({ pinned: true, updatedAt: 10 });

    sm.setArchived("s1", true);
    expect(sm.get("s1")).toMatchObject({ archived: true, pinned: false });

    await sm.removeRepo("/tmp/relay");
    expect(sm.repos().map((r) => r.path)).toEqual([]);
    expect(sm.list().map((s) => s.id)).toEqual(["s2"]);
  });
});

describe("SessionManager config options", () => {
  it("stores config options from attach and applies a change without bumping recency", async () => {
    const sm = await manager();
    const created = await sm.create({
      agent: fakeAgent(),
      cwd: process.cwd(),
      prompt: "warmup",
    });
    await waitFor(() => sm.get(created.id)?.configOptions);
    expect(sm.get(created.id)?.configOptions?.map((option) => option.id)).toEqual([
      "model",
      "effort",
      "mode",
    ]);
    await waitFor(() => (sm.get(created.id)?.status === "idle" ? true : null));
    const before = sm.get(created.id)?.updatedAt;

    await sm.setConfigOption(created.id, "effort", "high");
    await waitFor(
      () =>
        sm
          .get(created.id)
          ?.configOptions?.find((option) => option.id === "effort")
          ?.currentValue === "high",
    );

    expect(
      sm.get(created.id)?.configOptions?.find((option) => option.id === "effort")
        ?.currentValue,
    ).toBe("high");
    expect(sm.get(created.id)?.updatedAt).toBe(before);
  });

  it("attaches a non-live session before applying a config change", async () => {
    const sm = await manager();
    const created = await sm.create({
      agent: fakeAgent(),
      cwd: process.cwd(),
      prompt: "warmup",
    });
    await waitFor(() => (sm.get(created.id)?.status === "idle" ? true : null));

    await sm.detachAll();
    expect(sm.get(created.id)?.status).toBe("exited");

    await sm.setConfigOption(created.id, "effort", "high");
    await waitFor(
      () =>
        sm
          .get(created.id)
          ?.configOptions?.find((option) => option.id === "effort")
          ?.currentValue === "high",
    );

    expect(sm.get(created.id)?.status).toBe("idle");
  });

  it("intercepts config_option_update without appending a transcript event", async () => {
    const sm = await manager();
    const created = await sm.create({
      agent: fakeAgent(),
      cwd: process.cwd(),
      prompt: "warmup",
    });
    await waitFor(() => (sm.get(created.id)?.status === "idle" ? true : null));

    await sm.send(created.id, "RECONFIG now");
    await waitFor(
      () =>
        sm
          .get(created.id)
          ?.configOptions?.find((option) => option.id === "effort")
          ?.currentValue === "high",
    );

    expect(
      sm.get(created.id)?.configOptions?.find((option) => option.id === "effort")
        ?.currentValue,
    ).toBe("high");
    expect(
      sm.transcript(created.id).some((event) => "configOptions" in event.payload),
    ).toBe(false);
  });

  it("records turn usage on the usage event and replaces the last usage event", async () => {
    const sm = await manager();
    const created = await sm.create({
      agent: fakeAgent(),
      cwd: process.cwd(),
      prompt: "USAGE turn",
    });
    await waitFor(() => (sm.get(created.id)?.status === "idle" ? true : null));

    const usage = sm.transcript(created.id).filter((event) => event.kind === "usage");
    expect(usage).toHaveLength(1);
    expect(usage[0]?.payload).toMatchObject({
      used: 1500,
      size: 8000,
      inputTokens: 1200,
      outputTokens: 340,
      totalTokens: 1540,
      cachedReadTokens: 512,
    });
  });

  it("appends turn usage when no usage event is present", async () => {
    const sm = await manager();
    const created = await sm.create({
      agent: fakeAgent(),
      cwd: process.cwd(),
      prompt: "hello relay",
    });
    await waitFor(() => (sm.get(created.id)?.status === "idle" ? true : null));

    const usage = sm.transcript(created.id).filter((event) => event.kind === "usage");
    expect(usage).toHaveLength(1);
    expect(usage[0]?.payload).toMatchObject({
      inputTokens: 1200,
      outputTokens: 340,
      totalTokens: 1540,
      cachedReadTokens: 512,
    });
  });
});

describe("SessionManager agent management", () => {
  it("saves, updates, and deletes agents by id", async () => {
    const dir = mkdtempSync(join(tmpdir(), "relay-db-"));
    const store = await openStore(join(dir, "relay.db"));
    const sm = new SessionManager(store);
    managers.push(sm);
    expect(sm.agents()).toEqual([]);

    const created = sm.saveAgent({
      id: "",
      name: "My Agent",
      command: "my-agent",
      args: ["acp"],
    });
    expect(created.id).toBeTruthy();
    expect(sm.agents()).toEqual([created]);

    const updated = sm.saveAgent({ ...created, name: "Renamed", enabled: false });
    expect(updated.id).toBe(created.id);
    expect(sm.agents()).toHaveLength(1);
    expect(sm.agents()[0]).toMatchObject({
      id: created.id,
      name: "Renamed",
      enabled: false,
    });

    const second = sm.saveAgent({
      id: "",
      name: "Second",
      command: "second",
      args: [],
    });
    expect(sm.agents()).toHaveLength(2);

    sm.removeAgent(created.id);
    expect(sm.agents().map((a) => a.id)).toEqual([second.id]);
  });

  it("refuses to delete the last remaining agent", async () => {
    const dir = mkdtempSync(join(tmpdir(), "relay-db-"));
    const store = await openStore(join(dir, "relay.db"));
    store.saveAgents([{ id: "only", name: "Only", command: "only", args: [] }]);
    const sm = new SessionManager(store);
    managers.push(sm);

    expect(() => sm.removeAgent("only")).toThrow(/last/);
    expect(sm.agents()).toHaveLength(1);
  });

  it("adds, lists, deletes, and marks diff comments sent", async () => {
    const sm = await manager();
    const session = await sm.create({
      agent: fakeAgent(),
      cwd: process.cwd(),
      prompt: "review this",
    });

    const comment = sm.addDiffComment(session.id, {
      eventId: "e1",
      path: "a.ts",
      startLine: 1,
      endLine: 2,
      body: "  needs work  ",
    });
    expect(comment.body).toBe("needs work");
    expect(comment.sessionId).toBe(session.id);
    expect(comment.createdAt).toBeGreaterThan(0);
    expect(comment.sentAt).toBeUndefined();
    expect(sm.diffComments(session.id).map((c) => c.id)).toEqual([comment.id]);
    expect(sm.diffCommentsBySession()[session.id]).toHaveLength(1);

    sm.markDiffCommentsSent(session.id, [comment.id]);
    expect(sm.diffComments(session.id)[0].sentAt).toBeGreaterThan(0);

    sm.deleteDiffComment(comment.id);
    expect(sm.diffComments(session.id)).toEqual([]);
  });

  it("rejects an empty diff comment body", async () => {
    const sm = await manager();
    const session = await sm.create({
      agent: fakeAgent(),
      cwd: process.cwd(),
      prompt: "review this",
    });
    expect(() =>
      sm.addDiffComment(session.id, {
        eventId: "e1",
        path: "a.ts",
        startLine: 1,
        endLine: 1,
        body: "   ",
      }),
    ).toThrow(/body/);
  });

  it("rejects a diff comment for an unknown session", async () => {
    const sm = await manager();
    expect(() =>
      sm.addDiffComment("missing", {
        eventId: "e1",
        path: "a.ts",
        startLine: 1,
        endLine: 1,
        body: "note",
      }),
    ).toThrow(/unknown session/);
  });

  it("drops diff comments when the session is deleted", async () => {
    const sm = await manager();
    const session = await sm.create({
      agent: fakeAgent(),
      cwd: process.cwd(),
      prompt: "review this",
    });
    sm.addDiffComment(session.id, {
      eventId: "e1",
      path: "a.ts",
      startLine: 1,
      endLine: 1,
      body: "note",
    });
    await sm.delete(session.id);
    expect(sm.diffComments(session.id)).toEqual([]);
    expect(sm.diffCommentsBySession()[session.id]).toBeUndefined();
  });
});

describe("SessionManager authentication", () => {
  it("authenticates an auth-gated agent and makes the session usable", async () => {
    const sm = await manager();
    const agent = fakeAgent();
    agent.env = { ...agent.env, FAKE_ACP_REQUIRE_AUTH: "1" };
    const session = await sm.create({
      agent,
      cwd: process.cwd(),
      prompt: "hello",
    });

    await waitFor(() => (sm.get(session.id)?.authRequired ? true : null));
    expect(
      sm.get(session.id)?.authMethods?.map((method) => method.id),
    ).toContain("fake-login");

    await sm.authenticate(session.id, "fake-login");

    await waitFor(() =>
      sm.get(session.id)?.status === "idle" &&
      sm.get(session.id)?.authRequired === false
        ? true
        : null,
    );

    await sm.send(session.id, "hello");
    await waitFor(() =>
      sm
        .transcript(session.id)
        .some(
          (event) =>
            event.kind === "agent_message" &&
            String(event.payload.text).includes("echo: hello"),
        )
        ? true
        : null,
    );
  });
});

describe("SessionManager MCP servers", () => {
  it("defaults to an empty list and persists sanitized servers", async () => {
    const sm = await manager();
    expect(sm.mcpServers()).toEqual([]);

    const saved = sm.setMcpServers([
      {
        kind: "stdio",
        name: " fs ",
        command: " npx ",
        args: [" -y ", 3, ""],
        env: [
          { name: " R ", value: " 1 " },
          { name: "", value: "drop" },
        ],
      },
      { kind: "http", name: "h", url: "https://h", headers: [] },
      { kind: "nope", name: "bad", command: "x" },
    ]);

    expect(saved).toEqual([
      {
        kind: "stdio",
        name: "fs",
        command: "npx",
        args: ["-y"],
        env: [{ name: "R", value: "1" }],
      },
      { kind: "http", name: "h", url: "https://h", headers: [] },
    ]);
    expect(sm.mcpServers()).toEqual(saved);
  });

  it("tolerates corrupt stored JSON", async () => {
    const dir = mkdtempSync(join(tmpdir(), "relay-db-"));
    const store = await openStore(join(dir, "relay.db"));
    store.setSetting("mcpServers", "{ not json");
    const sm = new SessionManager(store);
    managers.push(sm);
    expect(sm.mcpServers()).toEqual([]);
  });

  it("sends the stored MCP servers when resuming through loadSession", async () => {
    const sm = await manager();
    const base = fakeAgent();
    const storePath = base.env!.FAKE_ACP_STORE!;
    const agent: AgentConfig = {
      ...base,
      env: { ...base.env, FAKE_ACP_MCP_DUMP: "1" },
    };
    const dumpPath = join(dirname(storePath), "mcp.json");

    sm.setMcpServers([
      {
        kind: "stdio",
        name: "fs",
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"],
        env: [{ name: "API_KEY", value: "secret" }],
      },
      {
        kind: "http",
        name: "web",
        url: "https://example.com/mcp",
        headers: [{ name: "Authorization", value: "Bearer token" }],
      },
    ]);

    const session = await sm.create({
      agent,
      cwd: process.cwd(),
      prompt: "warmup",
    });
    const acpId = await waitFor(() => sm.get(session.id)?.acpSessionId ?? null);
    await waitFor(() => (sm.get(session.id)?.status === "idle" ? true : null));

    rmSync(dumpPath, { force: true });

    await sm.detachAll();
    expect(sm.get(session.id)?.status).toBe("exited");

    await sm.send(session.id, "follow up");
    await waitFor(() => (existsSync(dumpPath) ? true : null));

    expect(JSON.parse(readFileSync(dumpPath, "utf8"))).toEqual(
      mcpServersToAcp(sm.mcpServers()),
    );
    expect(sm.get(session.id)?.acpSessionId).toBe(acpId);
  });
});

describe("SessionManager fork", () => {
  it("forks a live session into a new session without touching the source", async () => {
    const sm = await manager();
    const source = await sm.create({
      agent: fakeAgent(),
      cwd: process.cwd(),
      prompt: "seed the fork",
    });
    await waitFor(() => sm.get(source.id)?.status === "idle" ? true : null);
    const before = { ...sm.get(source.id)! };

    const forked = await sm.fork(source.id);

    expect(forked).not.toBeNull();
    expect(forked!.id).not.toBe(source.id);
    expect(forked!.acpSessionId).toBeTruthy();
    expect(forked!.acpSessionId).not.toBe(before.acpSessionId);
    expect(forked!.workingDirectory).toBe(source.workingDirectory);
    expect(forked!.agentConfigId).toBe(source.agentConfigId);
    expect(forked!.title).toBe(`${source.title} (fork)`);
    expect(forked!.status).toBe("idle");
    expect(sm.get(forked!.id)).toBeTruthy();
    expect(sm.list().map((s) => s.id).sort()).toEqual(
      [source.id, forked!.id].sort(),
    );

    const after = sm.get(source.id)!;
    expect(after.acpSessionId).toBe(before.acpSessionId);
    expect(after.title).toBe(before.title);
    expect(after.status).toBe(before.status);
    expect(after.workingDirectory).toBe(before.workingDirectory);
    expect(after.agentConfigId).toBe(before.agentConfigId);
    expect(after.updatedAt).toBe(before.updatedAt);

    await sm.send(forked!.id, "follow up");
    expect(
      sm.transcript(forked!.id).some(
        (e) =>
          e.kind === "agent_message" &&
          String(e.payload.text).includes("echo: follow up"),
      ),
    ).toBe(true);
  });

  it("returns null when the agent does not support forking", async () => {
    const sm = await manager();
    const base = fakeAgent();
    const agent = {
      ...base,
      env: { ...base.env, FAKE_ACP_NO_FORK: "1" },
    };
    const source = await sm.create({
      agent,
      cwd: process.cwd(),
      prompt: "cannot fork",
    });
    await waitFor(() => sm.get(source.id)?.status === "idle" ? true : null);

    expect(await sm.fork(source.id)).toBeNull();
    expect(sm.list().map((s) => s.id)).toEqual([source.id]);
  });

  it("attaches a non-live source before forking", async () => {
    const sm = await manager();
    const source = await sm.create({
      agent: fakeAgent(),
      cwd: process.cwd(),
      prompt: "detach me",
    });
    await waitFor(() => sm.get(source.id)?.status === "idle" ? true : null);
    await sm.detachAll();
    expect(sm.get(source.id)?.status).toBe("exited");

    const forked = await sm.fork(source.id);

    expect(forked).not.toBeNull();
    expect(forked!.id).not.toBe(source.id);
    expect(sm.get(source.id)?.status).toBe("idle");
  });
});
