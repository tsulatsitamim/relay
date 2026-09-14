import { useEffect, useMemo, useState } from "react";
import type { RelayState } from "../shared/ipc.ts";
import type { Repo, TranscriptEvent } from "../shared/types.ts";
import { timeAgo } from "../shared/time.ts";
import { HomeComposer } from "./HomeComposer";
import { Transcript } from "./Transcript";
import { Composer } from "./Composer";

const emptyState: RelayState = {
  sessions: [],
  agents: [],
  recents: [],
  repos: [],
  transcripts: {},
  homeDir: "",
};

function IconPen() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M2.5 13.5H6l7-7-3.5-3.5-7 7v3.5Z" />
    </svg>
  );
}

function IconSearch() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="7" cy="7" r="4.2" />
      <path d="M10.2 10.2 13.5 13.5" />
    </svg>
  );
}

function IconFolder() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M2.5 5.2V12a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1V6.2a1 1 0 0 0-1-1H8L6.7 4H3.5a1 1 0 0 0-1 1.2Z" />
    </svg>
  );
}

export function App() {
  const [state, setState] = useState<RelayState>(emptyState);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [repoPath, setRepoPath] = useState("");
  const [agentId, setAgentId] = useState("");
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onHome = selectedId === null;

  useEffect(() => {
    void window.relay
      .getState()
      .then((next) => {
        setState(next);
        setAgentId((id) => id || next.agents[0]?.id || "");
        setRepoPath((path) => path || next.repos[0]?.path || "");
      })
      .catch((err) => console.error(err));
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
        setSelectedId(null);
      }
      if (e.key === "Escape") {
        const current = state.sessions.find((s) => s.id === selectedId);
        if (current && (current.status === "working" || current.status === "starting")) {
          void window.relay.cancel(current.id);
        } else {
          setSearching(false);
          setSelectedId(null);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedId, state.sessions]);

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
  const chats = state.sessions.filter((session) =>
    session.title.toLowerCase().includes(query.trim().toLowerCase()),
  );

  async function refresh() {
    const next = await window.relay.getState();
    setState(next);
    return next;
  }

  async function setRepos(repos: Repo[]) {
    setState((prev) => ({ ...prev, repos }));
    if (repoPath && !repos.some((r) => r.path === repoPath)) {
      setRepoPath(repos[0]?.path ?? "");
    }
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="traffic" />
        <div className="nav">
          <button
            className={`nav-item ${onHome ? "active" : ""}`}
            onClick={() => setSelectedId(null)}
          >
            <IconPen />
            New Chat
          </button>
          <button
            className={`nav-item ${searching ? "active" : ""}`}
            onClick={() => setSearching((v) => !v)}
          >
            <IconSearch />
            Search
          </button>
        </div>
        {searching && (
          <div className="search-box">
            <input
              autoFocus
              value={query}
              placeholder="Search chats"
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        )}

        <div className="section list">
          {chats.map((session) => (
            <button
              key={session.id}
              className={`row-item ${session.id === selectedId ? "active" : ""}`}
              onClick={() => setSelectedId(session.id)}
            >
              <span className={`dot ${session.status}`} />
              <span className="label">{session.title}</span>
              <span className="when">{timeAgo(session.updatedAt)}</span>
            </button>
          ))}
        </div>

        <div className="section">
          <div className="section-head">
            <span>Repositories</span>
            <button
              className="icon-btn"
              title="Add repository"
              onClick={async () => {
                const repos = await window.relay.addRepo();
                await setRepos(repos);
                if (repos[0] && !repoPath) setRepoPath(repos[0].path);
              }}
            >
              +
            </button>
          </div>
          <div className="list">
            {state.repos.length === 0 && (
              <div className="blank">No repositories</div>
            )}
            {state.repos.map((repo) => (
              <button
                key={repo.path}
                className={`row-item ${repo.path === repoPath && onHome ? "active" : ""}`}
                onClick={() => {
                  setRepoPath(repo.path);
                  setSelectedId(null);
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  void window.relay.removeRepo(repo.path).then(setRepos);
                }}
              >
                <IconFolder />
                <span className="label">{repo.name}</span>
                <span className="when" />
              </button>
            ))}
          </div>
        </div>
      </aside>

      <section className="canvas">
        {selected ? (
          <>
            <header className="thread-head">
              <div>
                <h1>{selected.title}</h1>
                <div className="sub">
                  {selected.agentName}
                  {selected.workingDirectory ? ` · ${selected.workingDirectory}` : ""}
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
                <button className="ghost" onClick={() => void window.relay.restart(selected.id)}>
                  Restart
                </button>
                <button
                  className="ghost danger"
                  onClick={async () => {
                    await window.relay.delete(selected.id);
                    await refresh();
                    setSelectedId(null);
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
          <HomeComposer
            agents={state.agents}
            repos={state.repos}
            agentId={agentId}
            repoPath={repoPath}
            busy={busy}
            error={error}
            onAgentId={setAgentId}
            onRepoPath={setRepoPath}
            onSubmit={async (prompt) => {
              if (!agentId) {
                setError("Choose an agent.");
                return;
              }
              setBusy(true);
              setError(null);
              try {
                const session = await window.relay.create({
                  agentId,
                  cwd: repoPath,
                  prompt,
                });
                const next = await refresh();
                setState(next);
                setSelectedId(session.id);
              } catch (err) {
                setError(err instanceof Error ? err.message : String(err));
              } finally {
                setBusy(false);
              }
            }}
          />
        )}
      </section>
    </div>
  );
}
