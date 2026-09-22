import { describe, expect, it, vi } from "vitest";
import {
  FLUSH_THRESHOLD_BYTES,
  SCROLLBACK_LIMIT_BYTES,
  type TerminalEvent,
} from "../src/shared/terminal.ts";
import {
  TerminalManager,
  type PtyLike,
  type PtySpawnOptions,
} from "../src/main/terminal-manager.ts";

class FakePty implements PtyLike {
  pid = 4242;
  written: string[] = [];
  sizes: Array<[number, number]> = [];
  kills = 0;
  private dataListeners: Array<(data: string) => void> = [];
  private exitListeners: Array<(event: { exitCode: number; signal?: number }) => void> = [];

  onData(listener: (data: string) => void): void {
    this.dataListeners.push(listener);
  }

  onExit(listener: (event: { exitCode: number; signal?: number }) => void): void {
    this.exitListeners.push(listener);
  }

  write(data: string): void {
    this.written.push(data);
  }

  resize(cols: number, rows: number): void {
    this.sizes.push([cols, rows]);
  }

  kill(): void {
    this.kills += 1;
  }

  emitData(data: string): void {
    for (const listener of this.dataListeners) listener(data);
  }

  emitExit(event: { exitCode: number; signal?: number }): void {
    for (const listener of this.exitListeners) listener(event);
  }
}

function setup() {
  const ptys: FakePty[] = [];
  const spawns: PtySpawnOptions[] = [];
  const scheduled: Array<() => void> = [];
  let seq = 0;
  const manager = new TerminalManager({
    spawnPty: (options) => {
      spawns.push(options);
      const pty = new FakePty();
      ptys.push(pty);
      return pty;
    },
    shell: () => "/bin/zsh",
    env: () => ({ PATH: "/usr/bin" }),
    schedule: (callback) => {
      scheduled.push(callback);
    },
    createId: () => `terminal:00000000-0000-4000-8000-00000000000${seq++}`,
  });
  const events: TerminalEvent[] = [];
  manager.onEvent((event) => events.push(event));
  const flushScheduled = () => {
    while (scheduled.length > 0) scheduled.shift()!();
  };
  return { manager, ptys, spawns, events, flushScheduled };
}

const SESSION = "s1";
const CWD = "/tmp/project";

describe("TerminalManager create", () => {
  it("mints a uuid id, titles by per-session ordinal, and spawns a login shell in the session cwd", async () => {
    const { manager, spawns } = setup();
    const first = await manager.create({ sessionId: SESSION, cwd: CWD, cols: 120, rows: 30 });
    const second = await manager.create({ sessionId: SESSION, cwd: CWD, cols: 80, rows: 24 });
    expect(first.terminalId).not.toBe(second.terminalId);
    expect(first.title).toBe("Terminal 1");
    expect(second.title).toBe("Terminal 2");
    expect(spawns[0]).toEqual({
      file: "/bin/zsh",
      args: ["-l"],
      cwd: CWD,
      env: { PATH: "/usr/bin" },
      cols: 120,
      rows: 30,
    });
  });

  it("clamps the initial size", async () => {
    const { manager, spawns } = setup();
    await manager.create({ sessionId: SESSION, cwd: CWD, cols: 0, rows: 1e9 });
    expect(spawns[0]!.cols).toBe(1);
    expect(spawns[0]!.rows).toBe(1000);
  });

  it("titles independently per session", async () => {
    const { manager } = setup();
    await manager.create({ sessionId: SESSION, cwd: CWD, cols: 80, rows: 24 });
    const other = await manager.create({ sessionId: "s2", cwd: CWD, cols: 80, rows: 24 });
    expect(other.title).toBe("Terminal 1");
  });
});

describe("TerminalManager attach", () => {
  it("answers missing for an unknown or malformed id", () => {
    const { manager } = setup();
    expect(manager.attach("terminal:00000000-0000-4000-8000-0000000000ff")).toEqual({
      ok: false,
      reason: "missing",
    });
    expect(manager.attach("terminal:1")).toEqual({ ok: false, reason: "missing" });
  });

  it("replays the buffered output prefixed with the reset sequence", async () => {
    const { manager, ptys, events, flushScheduled } = setup();
    const { terminalId } = await manager.create({
      sessionId: SESSION,
      cwd: CWD,
      cols: 80,
      rows: 24,
    });
    expect(manager.attach(terminalId)).toMatchObject({ ok: true, data: "" });
    ptys[0]!.emitData("hello ");
    ptys[0]!.emitData("world");
    expect(events).toHaveLength(0);
    flushScheduled();
    expect(events).toEqual([
      { type: "terminalData", terminalId, data: "hello world", seq: 1 },
    ]);
    expect(manager.attach(terminalId)).toEqual({
      ok: true,
      data: `${"\x1b[0m\x1b[?25h"}hello world`,
      seq: 1,
      exited: false,
      exitCode: null,
      signal: null,
    });
  });
});

describe("TerminalManager coalescing and buffering", () => {
  it("coalesces a tick of writes into one event", async () => {
    const { manager, ptys, events, flushScheduled } = setup();
    const { terminalId } = await manager.create({
      sessionId: SESSION,
      cwd: CWD,
      cols: 80,
      rows: 24,
    });
    for (let index = 0; index < 50; index += 1) ptys[0]!.emitData("x");
    flushScheduled();
    expect(events).toEqual([
      { type: "terminalData", terminalId, data: "x".repeat(50), seq: 1 },
    ]);
  });

  it("flushes immediately past the threshold instead of waiting for the tick", async () => {
    const { manager, ptys, events } = setup();
    await manager.create({ sessionId: SESSION, cwd: CWD, cols: 80, rows: 24 });
    ptys[0]!.emitData("y".repeat(FLUSH_THRESHOLD_BYTES));
    expect(events).toHaveLength(1);
    expect((events[0] as { data: string }).data).toHaveLength(FLUSH_THRESHOLD_BYTES);
  });

  it("trims the buffer to whole chunks once it exceeds the cap", async () => {
    const { manager, ptys, flushScheduled } = setup();
    const { terminalId } = await manager.create({
      sessionId: SESSION,
      cwd: CWD,
      cols: 80,
      rows: 24,
    });
    const chunk = "z".repeat(Math.ceil(SCROLLBACK_LIMIT_BYTES / 2));
    for (let index = 0; index < 4; index += 1) {
      ptys[0]!.emitData(chunk);
      flushScheduled();
    }
    const replay = manager.attach(terminalId);
    expect(replay.ok).toBe(true);
    if (!replay.ok) return;
    const body = replay.data.slice("\x1b[0m\x1b[?25h".length);
    expect(body.length).toBeLessThanOrEqual(SCROLLBACK_LIMIT_BYTES);
    expect(body.length).toBe(chunk.length * 2);
  });

  it("keeps buffering while the renderer is detached", async () => {
    const { manager, ptys, flushScheduled } = setup();
    const { terminalId } = await manager.create({
      sessionId: SESSION,
      cwd: CWD,
      cols: 80,
      rows: 24,
    });
    ptys[0]!.emitData("before-unmount");
    flushScheduled();
    ptys[0]!.emitData("while-unmounted");
    flushScheduled();
    const replay = manager.attach(terminalId);
    expect(replay).toMatchObject({ ok: true, data: expect.stringContaining("while-unmounted") });
  });
});

describe("TerminalManager lifecycle", () => {
  it("reports an exit and stops accepting writes", async () => {
    const { manager, ptys, events } = setup();
    const { terminalId } = await manager.create({
      sessionId: SESSION,
      cwd: CWD,
      cols: 80,
      rows: 24,
    });
    ptys[0]!.emitExit({ exitCode: 3 });
    expect(events).toContainEqual({
      type: "terminalExit",
      terminalId,
      exitCode: 3,
      signal: null,
    });
    expect(manager.attach(terminalId)).toMatchObject({ ok: true, exited: true, exitCode: 3 });
    manager.write(terminalId, "echo hi");
    expect(ptys[0]!.written).toEqual([]);
  });

  it("closes a terminal, kills the pty and stays idempotent", async () => {
    const { manager, ptys } = setup();
    const { terminalId } = await manager.create({
      sessionId: SESSION,
      cwd: CWD,
      cols: 80,
      rows: 24,
    });
    manager.close(terminalId);
    expect(ptys[0]!.kills).toBe(1);
    expect(manager.attach(terminalId)).toEqual({ ok: false, reason: "missing" });
    manager.close(terminalId);
    expect(ptys[0]!.kills).toBe(1);
  });

  it("stays a no-op after the pty already exited", async () => {
    const { manager, ptys } = setup();
    const { terminalId } = await manager.create({
      sessionId: SESSION,
      cwd: CWD,
      cols: 80,
      rows: 24,
    });
    ptys[0]!.emitExit({ exitCode: 0 });
    manager.close(terminalId);
    expect(ptys[0]!.kills).toBe(0);
  });

  it("does not report an exit for a terminal it killed itself", async () => {
    const { manager, ptys, events } = setup();
    const { terminalId } = await manager.create({
      sessionId: SESSION,
      cwd: CWD,
      cols: 80,
      rows: 24,
    });
    manager.close(terminalId);
    ptys[0]!.emitExit({ exitCode: 0 });
    expect(events.filter((event) => event.type === "terminalExit")).toEqual([]);
  });

  it("resizes with clamped numbers", async () => {
    const { manager, ptys } = setup();
    const { terminalId } = await manager.create({
      sessionId: SESSION,
      cwd: CWD,
      cols: 80,
      rows: 24,
    });
    manager.resize(terminalId, 0, 1e9);
    expect(ptys[0]!.sizes).toEqual([[1, 1000]]);
  });

  it("restarts under the same id with a cleared buffer and a reset event", async () => {
    const { manager, ptys, events, flushScheduled } = setup();
    const { terminalId } = await manager.create({
      sessionId: SESSION,
      cwd: CWD,
      cols: 80,
      rows: 24,
    });
    ptys[0]!.emitData("old output");
    flushScheduled();
    await manager.restart(terminalId);
    expect(ptys).toHaveLength(2);
    expect(ptys[0]!.kills).toBe(1);
    expect(events).toContainEqual({ type: "terminalReset", terminalId });
    expect(manager.attach(terminalId)).toEqual({
      ok: true,
      data: "",
      seq: 0,
      exited: false,
      exitCode: null,
      signal: null,
    });
  });

  it("keeps the title and the ordinal across a restart", async () => {
    const { manager } = setup();
    const created = await manager.create({
      sessionId: SESSION,
      cwd: CWD,
      cols: 80,
      rows: 24,
    });
    await manager.restart(created.terminalId);
    const next = await manager.create({
      sessionId: SESSION,
      cwd: CWD,
      cols: 80,
      rows: 24,
    });
    expect(next.title).toBe("Terminal 2");
  });

  it("sweeps terminals whose session is gone and keeps the rest", async () => {
    const { manager, ptys } = setup();
    await manager.create({ sessionId: SESSION, cwd: CWD, cols: 80, rows: 24 });
    const kept = await manager.create({ sessionId: "s2", cwd: CWD, cols: 80, rows: 24 });
    manager.sweep(["s2"]);
    expect(ptys[0]!.kills).toBe(1);
    expect(manager.attach(kept.terminalId)).toMatchObject({ ok: true });
  });

  it("removes every terminal of one session", async () => {
    const { manager, ptys } = setup();
    const one = await manager.create({ sessionId: SESSION, cwd: CWD, cols: 80, rows: 24 });
    const two = await manager.create({ sessionId: SESSION, cwd: CWD, cols: 80, rows: 24 });
    manager.removeSession(SESSION);
    expect(manager.attach(one.terminalId)).toEqual({ ok: false, reason: "missing" });
    expect(manager.attach(two.terminalId)).toEqual({ ok: false, reason: "missing" });
    expect(ptys.every((pty) => pty.kills === 1)).toBe(true);
  });

  it("shuts everything down and unsubscribes listeners", async () => {
    const { manager, ptys } = setup();
    await manager.create({ sessionId: SESSION, cwd: CWD, cols: 80, rows: 24 });
    const listener = vi.fn();
    const unsubscribe = manager.onEvent(listener);
    unsubscribe();
    manager.shutdown();
    expect(ptys[0]!.kills).toBe(1);
    expect(listener).not.toHaveBeenCalled();
  });
});

describe("TerminalManager ordering and spawn failures", () => {
  it("stamps increasing sequence numbers and reports the snapshot sequence on attach", async () => {
    const { manager, ptys, events, flushScheduled } = setup();
    const created = await manager.create({ sessionId: SESSION, cwd: CWD, cols: 80, rows: 24 });
    ptys[0]!.emitData("one");
    flushScheduled();
    ptys[0]!.emitData("two");
    flushScheduled();
    expect(manager.attach(created.terminalId)).toMatchObject({ ok: true, seq: 2 });
    const sequences = events
      .filter((event) => event.type === "terminalData")
      .map((event) => event.seq);
    expect(sequences).toEqual([1, 2]);
  });

  it("emits nothing for a disposed terminal whose flush was already scheduled", async () => {
    const { manager, ptys, events, flushScheduled } = setup();
    const created = await manager.create({ sessionId: SESSION, cwd: CWD, cols: 80, rows: 24 });
    ptys[0]!.emitData("stale");
    manager.close(created.terminalId);
    flushScheduled();
    expect(events.some((event) => event.type === "terminalData")).toBe(false);
  });

  it("rejects create when the shell cannot spawn and leaves no entry", async () => {
    const manager = new TerminalManager({
      spawnPty: () => {
        throw new Error("shell missing");
      },
      shell: () => "/bin/zsh",
      env: () => ({ PATH: "/usr/bin" }),
      schedule: (callback) => callback(),
      createId: () => "terminal:00000000-0000-4000-8000-000000000000",
    });
    await expect(
      manager.create({ sessionId: SESSION, cwd: CWD, cols: 80, rows: 24 }),
    ).rejects.toThrow("shell missing");
    expect(manager.attach("terminal:00000000-0000-4000-8000-000000000000")).toEqual({
      ok: false,
      reason: "missing",
    });
  });

  it("rejects restart when the shell cannot respawn and leaves no entry", async () => {
    const ptys: FakePty[] = [];
    const events: TerminalEvent[] = [];
    let calls = 0;
    const manager = new TerminalManager({
      spawnPty: () => {
        calls += 1;
        if (calls > 1) throw new Error("shell gone");
        const pty = new FakePty();
        ptys.push(pty);
        return pty;
      },
      shell: () => "/bin/zsh",
      env: () => ({ PATH: "/usr/bin" }),
      schedule: (callback) => callback(),
      createId: () => "terminal:00000000-0000-4000-8000-000000000001",
    });
    manager.onEvent((event) => events.push(event));
    const created = await manager.create({ sessionId: SESSION, cwd: CWD, cols: 80, rows: 24 });
    await expect(manager.restart(created.terminalId)).rejects.toThrow("shell gone");
    expect(manager.attach(created.terminalId)).toEqual({ ok: false, reason: "missing" });
    expect(events.some((event) => event.type === "terminalReset")).toBe(false);
    expect(ptys[0]!.kills).toBe(1);
  });
});
