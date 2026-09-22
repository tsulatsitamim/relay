import { afterEach, describe, expect, it } from "vitest";
import { TerminalManager, defaultPtySpawner } from "../src/main/terminal-manager.ts";

async function ptyLoadable(): Promise<boolean> {
  try {
    await import("node-pty");
    return true;
  } catch {
    return false;
  }
}

const available = await ptyLoadable();
const managers: TerminalManager[] = [];

afterEach(() => {
  for (const manager of managers.splice(0)) manager.shutdown();
});

// postinstall builds node-pty for the Electron ABI, so under Vitest's Node 24
// the binary may not load. Skip rather than fail in that case; the manual
// checklist covers the real shell for good.
describe.skipIf(!available)("TerminalManager with a real pty", () => {
  it("runs a command and replays its output", async () => {
    const manager = new TerminalManager({ spawnPty: defaultPtySpawner });
    managers.push(manager);
    const { terminalId } = await manager.create({
      sessionId: "s1",
      cwd: process.cwd(),
      cols: 80,
      rows: 24,
    });
    manager.write(terminalId, "printf '__REAL_PTY__\\n'\r");
    const started = Date.now();
    let replay = manager.attach(terminalId);
    while (started + 8000 > Date.now()) {
      replay = manager.attach(terminalId);
      if (replay.ok && replay.data.includes("__REAL_PTY__")) break;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    expect(replay.ok).toBe(true);
    expect(replay.ok && replay.data).toContain("__REAL_PTY__");
  });
});
