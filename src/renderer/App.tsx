import { useEffect, useMemo, useState } from "react";
import type { RelayState } from "../shared/ipc.ts";
import type { Repo, Session, TranscriptEvent } from "../shared/types.ts";
import { timeAgo } from "../shared/time.ts";
import { HomeComposer } from "./HomeComposer";
import { Transcript } from "./Transcript";
import { Composer } from "./Composer";
import {
  IconAutomations,
  IconChevron,
  IconCustomize,
  IconFolder,
  IconMore,
  IconOut,
  IconPen,
  IconPlus,
  IconSearch,
} from "./icons";

const emptyState: RelayState = {
  sessions: [],
  agents: [],
  recents: [],
  repos: [],
  transcripts: {},
  homeDir: "",
};

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

  const q = query.trim().toLowerCase();
  const chats = state.sessions.filter((session) => session.title.toLowerCase().includes(q));
  const repoPaths = new Set(state.repos.map((repo) => repo.path));
  const ungrouped = chats.filter((session) => !repoPaths.has(session.workingDirectory));
  const grouped = state.repos.map((repo) => ({
    repo,
    sessions: chats.filter((session) => session.workingDirectory === repo.path),
  }));

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

  function ChatRow({ session, nested }: { session: Session; nested?: boolean }) {
    return (
      <button
        className={`row-item ${nested ? "nested" : ""} ${session.id === selectedId ? "active" : ""}`}
        onClick={() => setSelectedId(session.id)}
      >
        <span className={`dot ${session.status}`} />
        <span className="label">{session.title}</span>
        <span className="when">{timeAgo(session.updatedAt)}</span>
      </button>
    );
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="traffic" />
        <div className="nav">
          <button
            className={`nav-item ${onHome && !searching ? "active" : ""}`}
            onClick={() => {
              setSearching(false);
              setSelectedId(null);
            }}
          >
            <span className="nav-icon">
              <IconPen />
            </span>
            New Chat
          </button>
          <button
            className={`nav-item ${searching ? "active" : ""}`}
            onClick={() => setSearching((v) => !v)}
          >
            <span className="nav-icon">
              <IconSearch />
            </span>
            Search
          </button>
          <button className="nav-item" type="button" disabled>
            <span className="nav-icon">
              <IconAutomations />
            </span>
            Automations
          </button>
          <button className="nav-item" type="button" disabled>
            <span className="nav-icon">
              <IconCustomize />
            </span>
            Customize
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

        <div className="sidebar-scroll">
          {ungrouped.length > 0 && (
            <div className="list">
              {ungrouped.map((session) => (
                <ChatRow key={session.id} session={session} />
              ))}
            </div>
          )}

          <div className="section">
            <div className="section-head">
              <span>Repositories</span>
              <span className="section-actions">
                <span className="icon-btn static" aria-hidden>
                  <IconChevron />
                </span>
                <button
                  className="icon-btn"
                  title="Add repository"
                  onClick={async () => {
                    const repos = await window.relay.addRepo();
                    await setRepos(repos);
                    if (repos[0] && !repoPath) setRepoPath(repos[0].path);
                  }}
                >
                  <IconPlus />
                </button>
              </span>
            </div>
            <div className="list">
              {state.repos.length === 0 && <div className="blank">No repositories</div>}
              {grouped.map(({ repo, sessions }) => (
                <div key={repo.path} className="repo-group">
                  <button
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
                  {sessions.map((session) => (
                    <ChatRow key={session.id} session={session} nested />
                  ))}
                  {sessions.length === 0 && <div className="blank nested">No agents yet</div>}
                </div>
              ))}
            </div>
          </div>
        </div>
      </aside>

      <section className="canvas">
        <header className="canvas-tools">
          <span />
          <span className="canvas-tools-right">
            <span className="ide-link">
              IDE
              <IconOut />
            </span>
            <span className="icon-btn static" aria-hidden>
              <IconMore />
            </span>
          </span>
        </header>
        {selected ? (
          <div className="thread">
            <header className="thread-head">
              <span className="thread-name">{selected.title}</span>
              {selected.error ? <span className="thread-err">{selected.error}</span> : null}
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
          </div>
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
