import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { createRequire } from "node:module";
import initSqlJs, { type Database } from "sql.js";
import type { AgentConfig, Session, SessionStatus, TranscriptEvent } from "../shared/types.ts";

const require = createRequire(import.meta.url);

const SCHEMA = `
CREATE TABLE IF NOT EXISTS agents (
  id TEXT PRIMARY KEY,
  json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  seq INTEGER NOT NULL,
  json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS recents (
  path TEXT PRIMARY KEY,
  used_at INTEGER NOT NULL
);
`;

export class Store {
  private dirty = false;

  constructor(
    private readonly db: Database,
    private readonly file: string,
  ) {}

  saveAgents(agents: AgentConfig[]): void {
    this.db.run("DELETE FROM agents");
    const stmt = this.db.prepare("INSERT INTO agents (id, json) VALUES (?, ?)");
    for (const agent of agents) {
      stmt.run([agent.id, JSON.stringify(agent)]);
    }
    stmt.free();
    this.flush();
  }

  listAgents(): AgentConfig[] {
    const rows = this.db.exec("SELECT json FROM agents");
    if (!rows[0]) return [];
    return rows[0].values.map((v) => JSON.parse(String(v[0])) as AgentConfig);
  }

  saveSession(session: Session): void {
    this.db.run("INSERT OR REPLACE INTO sessions (id, json) VALUES (?, ?)", [
      session.id,
      JSON.stringify(session),
    ]);
    this.flush();
  }

  listSessions(): Session[] {
    const rows = this.db.exec("SELECT json FROM sessions");
    if (!rows[0]) return [];
    return rows[0].values
      .map((v) => JSON.parse(String(v[0])) as Session)
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }

  deleteSession(id: string): void {
    this.db.run("DELETE FROM sessions WHERE id = ?", [id]);
    this.db.run("DELETE FROM events WHERE session_id = ?", [id]);
    this.flush();
  }

  appendEvent(event: TranscriptEvent): void {
    this.db.run(
      "INSERT OR REPLACE INTO events (id, session_id, seq, json) VALUES (?, ?, ?, ?)",
      [
        event.id,
        event.sessionId ?? "",
        event.seq ?? 0,
        JSON.stringify(event),
      ],
    );
    this.flush();
  }

  listEvents(sessionId: string): TranscriptEvent[] {
    const stmt = this.db.prepare(
      "SELECT json FROM events WHERE session_id = ? ORDER BY seq ASC",
    );
    stmt.bind([sessionId]);
    const events: TranscriptEvent[] = [];
    while (stmt.step()) {
      const row = stmt.getAsObject();
      events.push(JSON.parse(String(row.json)) as TranscriptEvent);
    }
    stmt.free();
    return events;
  }

  nextSeq(sessionId: string): number {
    const stmt = this.db.prepare(
      "SELECT COALESCE(MAX(seq), 0) as m FROM events WHERE session_id = ?",
    );
    stmt.bind([sessionId]);
    stmt.step();
    const seq = Number(stmt.getAsObject().m ?? 0) + 1;
    stmt.free();
    return seq;
  }

  touchRecent(path: string): void {
    this.db.run(
      "INSERT OR REPLACE INTO recents (path, used_at) VALUES (?, ?)",
      [path, Date.now()],
    );
    this.flush();
  }

  listRecents(): string[] {
    const rows = this.db.exec(
      "SELECT path FROM recents ORDER BY used_at DESC LIMIT 20",
    );
    if (!rows[0]) return [];
    return rows[0].values.map((v) => String(v[0]));
  }

  private flush(): void {
    this.dirty = true;
    mkdirSync(dirname(this.file), { recursive: true });
    writeFileSync(this.file, Buffer.from(this.db.export()));
    this.dirty = false;
  }
}

export async function openStore(file: string): Promise<Store> {
  const SQL = await initSqlJs({
    wasmBinary: Uint8Array.from(
      readFileSync(require.resolve("sql.js/dist/sql-wasm.wasm")),
    ).slice().buffer as ArrayBuffer,
  });
  const db = existsSync(file)
    ? new SQL.Database(readFileSync(file))
    : new SQL.Database();
  db.run(SCHEMA);
  markClosed(db);
  const store = new Store(db, file);
  return store;
}

function markClosed(db: Database): void {
  const rows = db.exec("SELECT id, json FROM sessions");
  if (!rows[0]) return;
  const now = Date.now();
  for (const [id, json] of rows[0].values) {
    const session = JSON.parse(String(json)) as Session;
    if (session.status === "error") continue;
    session.status = "exited" as SessionStatus;
    session.updatedAt = now;
    db.run("INSERT OR REPLACE INTO sessions (id, json) VALUES (?, ?)", [
      String(id),
      JSON.stringify(session),
    ]);
  }
}
