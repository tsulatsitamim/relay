import { useEffect, useMemo, useState } from "react";
import type { RelayState } from "../shared/ipc.ts";
import type { Session, TranscriptEvent } from "../shared/types.ts";
import { NewAgent } from "./NewAgent";
import { Transcript } from "./Transcript";
import { Composer } from "./Composer";

const emptyState: RelayState = {
  sessions: [],
  agents: [],
  recents: [],
  transcripts: {},
};

function statusLabel(status: Session["status"]): string {
  return status[0]!.toUpperCase() + status.slice(1);
}

export function App() {
  const [state, setState] = useState<RelayState>(emptyState);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void window.relay.getState().then((next) => {
      setState(next);
      setSelectedId(next.sessions[0]?.id ?? null);
    }).catch((err) => {
      console.error(err);
    });
    return window.relay.subscribe((event) => {
      setState((prev) => {
        if (event.type === "sessions") return { ...prev, sessions: event.sessions };
        if (event.type === "transcript") {
          return {
            ...prev,
            transcripts: { ...prev.transcripts, [event.sessionId]: event.events },
          };
        }
        return prev;
      });
    });
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "n") {
        e.preventDefault();
        setCreating(true);
      }
      if (e.key === "Escape") {
        const current = state.sessions.find((s) => s.id === selectedId);
        if (current && (current.status === "working" || current.status === "starting")) {
          void window.relay.cancel(current.id);
        } else {
          setCreating(false);
        }
      }
      if (!creating && (e.key === "j" || e.key === "k" || e.key === "ArrowDown" || e.key === "ArrowUp")) {
        e.preventDefault();
        const ids = state.sessions.map((s) => s.id);
        const idx = ids.indexOf(selectedId ?? "");
        const delta = e.key === "j" || e.key === "ArrowDown" ? 1 : -1;
        const next = ids[(idx + delta + ids.length) % ids.length];
        if (next) setSelectedId(next);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [creating, selectedId, state.sessions]);

  const selected = useMemo(
    () => state.sessions.find((s) => s.id === selectedId) ?? null,
    [state.sessions, selectedId],
  );
  const events: TranscriptEvent[] = selected
    ? (state.transcripts[selected.id] ?? [])
    : [];
  const composerLocked = Boolean(
    selected && ["starting", "working", "cancelling"].includes(selected.status),
  );

  async function refresh() {
    const next = await window.relay.getState();
    setState(next);
    return next;
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">Relay</div>
        <button className="new-btn" onClick={() => setCreating(true)}>
          + New Agent
        </button>
        <div className="session-list">
          {state.sessions.map((session) => (
            <button
              key={session.id}
              className={`session-row ${session.id === selectedId ? "active" : ""}`}
              onClick={() => setSelectedId(session.id)}
            >
              <span className={`dot ${session.status}`} />
              <span>
                <div className="title">{session.title}</div>
                <div className="meta">
                  {session.agentName} · {statusLabel(session.status)}
                </div>
              </span>
            </button>
          ))}
        </div>
      </aside>

      <section className="thread">
        {selected ? (
          <>
            <header className="thread-head">
              <div>
                <h1>{selected.title}</h1>
                <div className="sub">
                  {selected.agentName} · {selected.workingDirectory}
                  {selected.error ? ` · ${selected.error}` : ""}
                </div>
              </div>
              <div className="actions">
                <button
                  className="ghost"
                  onClick={() => void window.relay.cancel(selected.id)}
                  disabled={!composerLocked}
                >
                  Stop
                </button>
                <button
                  className="ghost"
                  onClick={() => void window.relay.restart(selected.id)}
                >
                  Restart
                </button>
                <button
                  className="ghost"
                  onClick={() => void window.relay.copyDebug(selected.id)}
                >
                  Copy debug
                </button>
                <button
                  className="ghost danger"
                  onClick={async () => {
                    await window.relay.delete(selected.id);
                    const next = await refresh();
                    setSelectedId(next.sessions[0]?.id ?? null);
                  }}
                >
                  Delete
                </button>
              </div>
            </header>
            <Transcript events={events} />
            <Composer
              disabled={composerLocked || busy}
              onSend={async (text) => {
                setBusy(true);
                try {
                  await window.relay.send(selected.id, text);
                } finally {
                  setBusy(false);
                }
              }}
            />
          </>
        ) : (
          <div className="empty">
            No agent sessions yet.
            <div>Press ⌘N to start one.</div>
          </div>
        )}
      </section>

      {creating && (
        <NewAgent
          agents={state.agents}
          recents={state.recents}
          onClose={() => setCreating(false)}
          onCreate={async (payload) => {
            const session = await window.relay.create(payload);
            const next = await refresh();
            setState(next);
            setSelectedId(session.id);
            setCreating(false);
          }}
        />
      )}
    </div>
  );
}
