import { randomUUID } from "node:crypto";
import {
  FLUSH_THRESHOLD_BYTES,
  REPLAY_PREFIX,
  SCROLLBACK_LIMIT_BYTES,
  clampCols,
  clampRows,
  type TerminalAttachResult,
  type TerminalCreateResult,
  type TerminalEvent,
} from "../shared/terminal.ts";

export type PtyLike = {
  pid: number;
  onData(listener: (data: string) => void): unknown;
  onExit(listener: (event: { exitCode: number; signal?: number }) => void): unknown;
  write(data: string): void;
  resize(cols: number, rows: number): void;
  kill(signal?: string): void;
};

export type PtySpawnOptions = {
  file: string;
  args: string[];
  cwd: string;
  env: Record<string, string>;
  cols: number;
  rows: number;
};

export type PtySpawner = (options: PtySpawnOptions) => PtyLike | Promise<PtyLike>;

export type TerminalManagerDeps = {
  spawnPty: PtySpawner;
  shell?: () => string;
  env?: () => Record<string, string>;
  schedule?: (callback: () => void) => void;
  createId?: () => `terminal:${string}`;
};

type Entry = {
  terminalId: string;
  sessionId: string;
  title: string;
  cwd: string;
  cols: number;
  rows: number;
  pty: PtyLike;
  chunks: Array<{ data: string; size: number }>;
  bytes: number;
  pending: string;
  scheduled: boolean;
  disposed: boolean;
  exited: boolean;
  exitCode: number | null;
  signal: number | null;
};

function processEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === "string") env[key] = value;
  }
  return env;
}

export async function defaultPtySpawner(options: PtySpawnOptions): Promise<PtyLike> {
  const nodePty = await import("node-pty");
  return nodePty.spawn(options.file, options.args, {
    name: "xterm-256color",
    cwd: options.cwd,
    env: options.env,
    cols: options.cols,
    rows: options.rows,
  });
}

export class TerminalManager {
  private readonly entries = new Map<string, Entry>();
  private readonly ordinals = new Map<string, number>();
  private readonly listeners = new Set<(event: TerminalEvent) => void>();
  private readonly spawnPty: PtySpawner;
  private readonly resolveShell: () => string;
  private readonly resolveEnv: () => Record<string, string>;
  private readonly schedule: (callback: () => void) => void;
  private readonly createId: () => `terminal:${string}`;

  constructor(deps: TerminalManagerDeps) {
    this.spawnPty = deps.spawnPty;
    this.resolveShell = deps.shell ?? (() => "/bin/zsh");
    this.resolveEnv = deps.env ?? processEnv;
    this.schedule = deps.schedule ?? ((callback) => void setImmediate(callback));
    this.createId = deps.createId ?? (() => `terminal:${randomUUID()}`);
  }

  onEvent(listener: (event: TerminalEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async create(input: {
    sessionId: string;
    cwd: string;
    cols: unknown;
    rows: unknown;
  }): Promise<TerminalCreateResult> {
    const terminalId = this.createId();
    const ordinal = (this.ordinals.get(input.sessionId) ?? 0) + 1;
    this.ordinals.set(input.sessionId, ordinal);
    const entry = await this.spawnEntry({
      terminalId,
      sessionId: input.sessionId,
      title: `Terminal ${ordinal}`,
      cwd: input.cwd,
      cols: clampCols(input.cols),
      rows: clampRows(input.rows),
    });
    this.entries.set(terminalId, entry);
    return { terminalId, title: entry.title };
  }

  attach(terminalId: string): TerminalAttachResult {
    const entry = this.entries.get(terminalId);
    if (!entry) return { ok: false, reason: "missing" };
    return {
      ok: true,
      data: entry.chunks.length ? REPLAY_PREFIX + entry.chunks.map((c) => c.data).join("") : "",
      exited: entry.exited,
      exitCode: entry.exitCode,
      signal: entry.signal,
    };
  }

  write(terminalId: string, data: string): void {
    const entry = this.entries.get(terminalId);
    if (!entry || entry.exited || !data) return;
    entry.pty.write(data);
  }

  resize(terminalId: string, cols: unknown, rows: unknown): void {
    const entry = this.entries.get(terminalId);
    if (!entry || entry.disposed) return;
    entry.cols = clampCols(cols);
    entry.rows = clampRows(rows);
    entry.pty.resize(entry.cols, entry.rows);
  }

  close(terminalId: string): void {
    const entry = this.entries.get(terminalId);
    if (!entry) return;
    this.entries.delete(terminalId);
    this.dispose(entry);
  }

  async restart(terminalId: string): Promise<void> {
    const entry = this.entries.get(terminalId);
    if (!entry) return;
    this.dispose(entry);
    const replacement = await this.spawnEntry({
      terminalId: entry.terminalId,
      sessionId: entry.sessionId,
      title: entry.title,
      cwd: entry.cwd,
      cols: entry.cols,
      rows: entry.rows,
    });
    this.entries.set(terminalId, replacement);
    this.emit({ type: "terminalReset", terminalId });
  }

  removeSession(sessionId: string): void {
    for (const [terminalId, entry] of [...this.entries]) {
      if (entry.sessionId !== sessionId) continue;
      this.entries.delete(terminalId);
      this.dispose(entry);
    }
    this.ordinals.delete(sessionId);
  }

  sweep(activeSessionIds: Iterable<string>): void {
    const active = new Set(activeSessionIds);
    for (const [terminalId, entry] of [...this.entries]) {
      if (active.has(entry.sessionId)) continue;
      this.entries.delete(terminalId);
      this.dispose(entry);
    }
  }

  shutdown(): void {
    for (const terminalId of [...this.entries.keys()]) this.close(terminalId);
  }

  private async spawnEntry(base: {
    terminalId: string;
    sessionId: string;
    title: string;
    cwd: string;
    cols: number;
    rows: number;
  }): Promise<Entry> {
    const pty = await this.spawnPty({
      file: this.resolveShell(),
      args: ["-l"],
      cwd: base.cwd,
      env: this.resolveEnv(),
      cols: base.cols,
      rows: base.rows,
    });
    const entry: Entry = {
      ...base,
      pty,
      chunks: [],
      bytes: 0,
      pending: "",
      scheduled: false,
      disposed: false,
      exited: false,
      exitCode: null,
      signal: null,
    };
    pty.onData((data) => this.push(entry, data));
    pty.onExit((event) => this.handleExit(entry, event));
    return entry;
  }

  private push(entry: Entry, data: string): void {
    if (!data || entry.disposed || entry.exited) return;
    entry.pending += data;
    if (entry.pending.length >= FLUSH_THRESHOLD_BYTES) {
      this.flush(entry);
      return;
    }
    if (entry.scheduled) return;
    entry.scheduled = true;
    this.schedule(() => this.flush(entry));
  }

  private flush(entry: Entry): void {
    entry.scheduled = false;
    const data = entry.pending;
    if (!data) return;
    entry.pending = "";
    this.append(entry, data);
    this.emit({ type: "terminalData", terminalId: entry.terminalId, data });
  }

  private append(entry: Entry, data: string): void {
    const size = Buffer.byteLength(data, "utf8");
    entry.chunks.push({ data, size });
    entry.bytes += size;
    while (entry.bytes > SCROLLBACK_LIMIT_BYTES && entry.chunks.length > 1) {
      const removed = entry.chunks.shift();
      if (!removed) break;
      entry.bytes -= removed.size;
    }
  }

  private handleExit(entry: Entry, event: { exitCode: number; signal?: number }): void {
    if (entry.disposed) return;
    entry.exited = true;
    entry.exitCode = Number.isFinite(event.exitCode) ? Math.floor(event.exitCode) : null;
    entry.signal = typeof event.signal === "number" ? event.signal : null;
    this.flush(entry);
    this.emit({
      type: "terminalExit",
      terminalId: entry.terminalId,
      exitCode: entry.exitCode,
      signal: entry.signal,
    });
  }

  private dispose(entry: Entry): void {
    entry.disposed = true;
    if (entry.exited) return;
    entry.exited = true;
    try {
      entry.pty.kill();
    } catch {
      return;
    }
  }

  private emit(event: TerminalEvent): void {
    for (const listener of this.listeners) listener(event);
  }
}
