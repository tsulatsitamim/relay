import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import { afterEach, describe, expect, it, vi } from "vitest";
import initSqlJs from "sql.js";
import { openStore } from "../src/main/db.ts";
import type { AgentConfig, Session, TranscriptEvent } from "../src/shared/types.ts";

const require = createRequire(import.meta.url);
const dirs: string[] = [];

afterEach(() => {
  vi.useRealTimers();
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function tempFile(): string {
  const dir = mkdtempSync(join(tmpdir(), "relay-store-"));
  dirs.push(dir);
  return join(dir, "relay.db");
}

function recorder() {
  const writes: Array<{ path: string; data: Buffer }> = [];
  const renames: Array<[string, string]> = [];
  return {
    writes,
    renames,
    write: (path: string, data: Buffer) => writes.push({ path, data }),
    rename: (from: string, to: string) => renames.push([from, to]),
  };
}

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

    store.flushNow();
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

    store.flushNow();
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
    store.flushNow();
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

  it("stores settings as key/value pairs and overwrites them", async () => {
    const file = join(mkdtempSync(join(tmpdir(), "relay-store-")), "relay.db");
    const store = await openStore(file);
    expect(store.getSetting("defaultAgentId")).toBeNull();
    expect(store.listSettings()).toEqual({});

    store.setSetting("defaultAgentId", "opencode");
    store.setSetting("confirmDeleteProvider", "true");
    store.setSetting("defaultAgentId", "claude-code");

    store.flushNow();
    const reopened = await openStore(file);
    expect(reopened.getSetting("defaultAgentId")).toBe("claude-code");
    expect(reopened.getSetting("missing")).toBeNull();
    expect(reopened.listSettings()).toEqual({
      defaultAgentId: "claude-code",
      confirmDeleteProvider: "true",
    });
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

  it("stores, lists, deletes, and marks diff comments sent", async () => {
    const file = join(mkdtempSync(join(tmpdir(), "relay-store-")), "relay.db");
    const store = await openStore(file);
    store.addDiffComment({
      id: "c2",
      sessionId: "s1",
      eventId: "e1",
      path: "b.ts",
      startLine: 2,
      endLine: 2,
      body: "second",
      createdAt: 20,
    });
    store.addDiffComment({
      id: "c1",
      sessionId: "s1",
      eventId: "e1",
      path: "a.ts",
      startLine: 1,
      endLine: 3,
      body: "first",
      createdAt: 10,
    });
    store.addDiffComment({
      id: "c3",
      sessionId: "s2",
      eventId: "e9",
      path: "c.ts",
      startLine: 1,
      endLine: 1,
      body: "other session",
      createdAt: 5,
    });

    expect(store.listDiffComments("s1").map((c) => c.id)).toEqual(["c1", "c2"]);
    expect(store.listDiffComments("s2").map((c) => c.id)).toEqual(["c3"]);

    store.flushNow();
    const reopened = await openStore(file);
    expect(reopened.listDiffComments("s1").map((c) => c.body)).toEqual([
      "first",
      "second",
    ]);

    store.markDiffCommentsSent(["c1"], 999);
    expect(store.listDiffComments("s1").find((c) => c.id === "c1")?.sentAt).toBe(999);
    expect(
      store.listDiffComments("s1").find((c) => c.id === "c2")?.sentAt,
    ).toBeUndefined();

    store.deleteDiffComment("c1");
    expect(store.listDiffComments("s1").map((c) => c.id)).toEqual(["c2"]);
  });

  it("removes diff comments when their session is deleted", async () => {
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
    store.addDiffComment({
      id: "c1",
      sessionId: "sess-1",
      eventId: "e1",
      path: "a.ts",
      startLine: 1,
      endLine: 1,
      body: "note",
      createdAt: 1,
    });
    store.deleteSession("sess-1");
    expect(store.listDiffComments("sess-1")).toEqual([]);
  });

  it("creates the events session/seq index", async () => {
    const dir = mkdtempSync(join(tmpdir(), "relay-store-"));
    dirs.push(dir);
    const file = join(dir, "relay.db");
    const store = await openStore(file);
    store.setSetting("probe", "1");
    store.flushNow();
    const SQL = await initSqlJs({
      wasmBinary: Uint8Array.from(
        readFileSync(require.resolve("sql.js/dist/sql-wasm.wasm")),
      ).slice().buffer as ArrayBuffer,
    });
    const db = new SQL.Database(readFileSync(file));
    const rows = db.exec(
      "SELECT name FROM sqlite_master WHERE type='index' AND name='idx_events_session_seq'",
    );
    expect(rows[0]?.values).toEqual([["idx_events_session_seq"]]);
    db.close();
  });
});

describe("Store write debouncing", () => {
  it("coalesces rapid mutations into exactly one write", async () => {
    const file = tempFile();
    const rec = recorder();
    const store = await openStore(file, {
      write: rec.write,
      rename: rec.rename,
      flushDelayMs: 200,
    });
    vi.useFakeTimers();
    store.setSetting("a", "1");
    store.setSetting("b", "2");
    store.appendEvent({
      id: "e1",
      sessionId: "s1",
      seq: 1,
      kind: "user",
      payload: { text: "hi" },
      createdAt: 1,
    });
    expect(rec.writes).toHaveLength(0);
    vi.advanceTimersByTime(200);
    expect(rec.writes).toHaveLength(1);
    expect(rec.renames).toHaveLength(1);
  });

  it("writes atomically through the injected writer and renames onto the db path", async () => {
    const file = tempFile();
    const rec = recorder();
    const store = await openStore(file, {
      write: rec.write,
      rename: rec.rename,
      flushDelayMs: 200,
    });
    vi.useFakeTimers();
    store.setSetting("a", "1");
    vi.advanceTimersByTime(200);
    expect(rec.writes[0]?.path).toBe(`${file}.tmp`);
    expect(rec.renames[0]).toEqual([`${file}.tmp`, file]);
  });

  it("flushNow writes immediately and cancels the pending timer", async () => {
    const file = tempFile();
    const rec = recorder();
    const store = await openStore(file, {
      write: rec.write,
      rename: rec.rename,
      flushDelayMs: 200,
    });
    vi.useFakeTimers();
    store.setSetting("a", "1");
    store.flushNow();
    expect(rec.writes).toHaveLength(1);
    vi.advanceTimersByTime(1000);
    expect(rec.writes).toHaveLength(1);
  });

  it("does not write a clean store", async () => {
    const file = tempFile();
    const rec = recorder();
    const store = await openStore(file, {
      write: rec.write,
      rename: rec.rename,
      flushDelayMs: 200,
    });
    vi.useFakeTimers();
    store.flushNow();
    vi.advanceTimersByTime(1000);
    expect(rec.writes).toHaveLength(0);
  });

  it("persists a status change made by markClosed", async () => {
    const file = tempFile();
    const first = await openStore(file);
    first.saveSession({
      id: "s1",
      title: "x",
      agentConfigId: "a",
      agentName: "A",
      workingDirectory: "/tmp",
      status: "idle",
      createdAt: 1,
      updatedAt: 1,
    });
    first.flushNow();

    const rec = recorder();
    const reopened = await openStore(file, {
      write: rec.write,
      rename: rec.rename,
      flushDelayMs: 20,
    });
    expect(reopened.listSessions()[0]?.status).toBe("exited");
    expect(rec.writes).toHaveLength(0);
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(rec.writes).toHaveLength(1);
  });
});
