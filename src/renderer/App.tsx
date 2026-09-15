import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import type { RelayState } from "../shared/ipc.ts";
import type { Repo, Session, TranscriptEvent } from "../shared/types.ts";
import { repoFor } from "../shared/repo.ts";
import { timeAgo } from "../shared/time.ts";
import { HomeComposer } from "./HomeComposer";
import { Transcript } from "./Transcript";
import { Composer } from "./Composer";
import {
  IconArchive,
  IconAutomations,
  IconCheck,
  IconArrowLeft,
  IconArrowRight,
  IconChevron,
  IconCustomize,
  IconFilter,
  IconFolder,
  IconFolderOpen,
  IconFolderPlus,
  IconMore,
  IconOut,
  IconPanelLeft,
  IconPen,
  IconPencil,
  IconPin,
  IconPlus,
  IconRedo,
  IconSearch,
  IconTrash,
} from "./icons";

const shortcutMod = navigator.platform.includes("Mac") ? "⌘" : "Ctrl+";

const emptyState: RelayState = {
  sessions: [],
  agents: [],
  recents: [],
  repos: [],
  transcripts: {},
  homeDir: "",
};

type MenuState =
  | { kind: "filter"; x: number; y: number }
  | { kind: "repo"; x: number; y: number; path: string };

function Menu({
  x,
  y,
  onClose,
  ignoreRef,
  children,
}: {
  x: number;
  y: number;
  onClose: () => void;
  ignoreRef?: RefObject<HTMLElement | null>;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      const target = e.target as Node;
      if (ref.current?.contains(target)) return;
      if (ignoreRef?.current?.contains(target)) return;
      onClose();
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [onClose, ignoreRef]);
  return createPortal(
    <div ref={ref} className="menu" style={{ top: y, left: x }} role="menu">
      {children}
    </div>,
    document.body,
  );
}

function WindowLights() {
  return (
    <span className="traffic-lights">
      <button
        type="button"
        className="traffic-btn close"
        title="Close"
        aria-label="Close"
        onClick={() => void window.relay.windowControl("close")}
        onMouseDown={(e) => e.preventDefault()}
      />
      <button
        type="button"
        className="traffic-btn min"
        title="Minimize"
        aria-label="Minimize"
        onClick={() => void window.relay.windowControl("min")}
        onMouseDown={(e) => e.preventDefault()}
      />
      <button
        type="button"
        className="traffic-btn max"
        title="Maximize"
        aria-label="Maximize"
        onClick={() => void window.relay.windowControl("max")}
        onMouseDown={(e) => e.preventDefault()}
      />
    </span>
  );
}

function TitlebarChrome({
  collapsed,
  spread,
  onToggle,
  prevChatId,
  nextChatId,
  onSelect,
}: {
  collapsed: boolean;
  spread?: boolean;
  onToggle: () => void;
  prevChatId: string | null;
  nextChatId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <>
      <WindowLights />
      <button
        type="button"
        className="icon-btn"
        title={collapsed ? "Show Sidebar" : "Hide Sidebar"}
        aria-label={collapsed ? "Show Sidebar" : "Hide Sidebar"}
        onMouseDown={(e) => e.preventDefault()}
        onClick={onToggle}
      >
        <IconPanelLeft />
      </button>
      {spread ? <span className="titlebar-spacer" /> : null}
      <span className="canvas-tools-nav">
        <button
          type="button"
          className="icon-btn"
          title="Go Back"
          aria-label="Go Back"
          disabled={!prevChatId}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => prevChatId && onSelect(prevChatId)}
        >
          <IconArrowLeft />
        </button>
        <button
          type="button"
          className="icon-btn"
          title="Go Forward"
          aria-label="Go Forward"
          disabled={!nextChatId}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => nextChatId && onSelect(nextChatId)}
        >
          <IconArrowRight />
        </button>
      </span>
    </>
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
  const [reposCollapsed, setReposCollapsed] = useState(false);
  const [pinnedCollapsed, setPinnedCollapsed] = useState(false);
  const [collapsedRepos, setCollapsedRepos] = useState<Set<string>>(() => new Set());
  const [showArchived, setShowArchived] = useState(
    () => localStorage.getItem("relay.showArchived") === "1",
  );
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => localStorage.getItem("relay.sidebarCollapsed") === "1",
  );
  const filterBtnRef = useRef<HTMLButtonElement>(null);

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
        setSearching(false);
        setSelectedId(null);
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearching((v) => !v);
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "b") {
        e.preventDefault();
        toggleSidebar();
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
  const chats = state.sessions.filter((session) => {
    if (q && !session.title.toLowerCase().includes(q)) return false;
    if (!showArchived && session.archived) return false;
    return true;
  });
  const pinned = chats.filter((session) => session.pinned);
  const sessionsByRepo = new Map<string, Session[]>();
  const ungrouped: Session[] = [];
  for (const session of chats) {
    if (session.pinned) continue;
    const repo = repoFor(session.workingDirectory, state.repos);
    if (!repo) {
      ungrouped.push(session);
      continue;
    }
    const list = sessionsByRepo.get(repo.path) ?? [];
    list.push(session);
    sessionsByRepo.set(repo.path, list);
  }
  const grouped = state.repos.map((repo) => ({
    repo,
    sessions: sessionsByRepo.get(repo.path) ?? [],
  }));
  const orderedChats = [
    ...pinned,
    ...grouped.flatMap(({ sessions }) => sessions),
    ...ungrouped,
  ];
  const chatIndex = orderedChats.findIndex((session) => session.id === selectedId);
  const prevChatId = chatIndex > 0 ? orderedChats[chatIndex - 1]!.id : null;
  const nextChatId =
    chatIndex === -1
      ? (orderedChats[0]?.id ?? null)
      : chatIndex < orderedChats.length - 1
        ? orderedChats[chatIndex + 1]!.id
        : null;

  function toggleSidebar() {
    setSidebarCollapsed((v) => {
      const next = !v;
      localStorage.setItem("relay.sidebarCollapsed", next ? "1" : "0");
      return next;
    });
  }

  function toggleRepo(path: string) {
    setCollapsedRepos((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

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

  function ChatRow({ session }: { session: Session }) {
    const active = session.id === selectedId;
    return (
      <div
        className={`row-item ${active ? "active" : ""} ${session.archived ? "muted" : ""}`}
        role="button"
        tabIndex={0}
        data-has-actions="true"
        data-active={active || undefined}
        onClick={() => setSelectedId(session.id)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setSelectedId(session.id);
          }
        }}
      >
        <span className="cell-icon">
          {session.archived ? (
            <IconArchive className="status-icon" />
          ) : (
            <span className={`dot ${session.status}`} />
          )}
        </span>
        <span className="cell-content">{session.title}</span>
        <span className="row-end">
          <span className="row-actions">
            <button
              className={`row-action ${session.pinned ? "on" : ""}`}
              title={session.pinned ? "Unpin" : "Pin"}
              aria-label={session.pinned ? "Unpin" : "Pin"}
              onClick={(e) => {
                e.stopPropagation();
                void window.relay.setPinned(session.id, !session.pinned);
              }}
            >
              <IconPin />
            </button>
            <button
              className={`row-action ${session.archived ? "on" : ""}`}
              title={session.archived ? "Unarchive" : "Archive"}
              aria-label={session.archived ? "Unarchive" : "Archive"}
              onClick={(e) => {
                e.stopPropagation();
                void window.relay.setArchived(session.id, !session.archived);
              }}
            >
              {session.archived ? <IconRedo /> : <IconArchive />}
            </button>
          </span>
          <span className="when">{timeAgo(session.updatedAt)}</span>
        </span>
      </div>
    );
  }

  return (
    <div className={`app${sidebarCollapsed ? " sidebar-collapsed" : ""}`}>
      <aside className="sidebar">
        {!sidebarCollapsed && (
          <div className="traffic">
            <TitlebarChrome
              collapsed={false}
              spread
              onToggle={toggleSidebar}
              prevChatId={prevChatId}
              nextChatId={nextChatId}
              onSelect={setSelectedId}
            />
          </div>
        )}
        <div className="nav">
          <button
            className={`nav-item ${onHome && !searching ? "active" : ""}`}
            data-active={onHome && !searching ? true : undefined}
            onClick={() => {
              setSearching(false);
              setSelectedId(null);
            }}
          >
            <span className="cell-icon">
              <IconPen />
            </span>
            <span className="cell-content">New Chat</span>
            <span className="row-end">
              <span className="kbd-badge">{shortcutMod}N</span>
            </span>
          </button>
          <button
            className={`nav-item ${searching ? "active" : ""}`}
            data-active={searching || undefined}
            onClick={() => setSearching((v) => !v)}
          >
            <span className="cell-icon">
              <IconSearch />
            </span>
            <span className="cell-content">Search</span>
            <span className="row-end">
              <span className="kbd-badge">{shortcutMod}K</span>
            </span>
          </button>
          <button className="nav-item" type="button" disabled>
            <span className="cell-icon">
              <IconAutomations />
            </span>
            <span className="cell-content">Automations</span>
          </button>
          <button className="nav-item" type="button" disabled>
            <span className="cell-icon">
              <IconCustomize />
            </span>
            <span className="cell-content">Customize</span>
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
          {pinned.length > 0 && (
            <div className={`section ${pinnedCollapsed ? "collapsed" : ""}`}>
              <div
                className="group-label"
                role="button"
                tabIndex={0}
                aria-expanded={!pinnedCollapsed}
                onClick={() => setPinnedCollapsed((v) => !v)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setPinnedCollapsed((v) => !v);
                  }
                }}
              >
                <span className="group-label-main">
                  <span className="group-label-title">Pinned</span>
                  <span className="group-label-chevron">
                    <IconChevron />
                  </span>
                </span>
              </div>
              {!pinnedCollapsed && (
                <div className="list">
                  {pinned.map((session) => (
                    <ChatRow key={session.id} session={session} />
                  ))}
                </div>
              )}
            </div>
          )}

          <div className={`section ${reposCollapsed ? "collapsed" : ""}`}>
            <div
              className="group-label"
              role="button"
              tabIndex={0}
              aria-expanded={!reposCollapsed}
              onClick={() => setReposCollapsed((v) => !v)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setReposCollapsed((v) => !v);
                }
              }}
            >
              <span className="group-label-main">
                <span className="group-label-title">Repositories</span>
                <span className="group-label-chevron">
                  <IconChevron />
                </span>
              </span>
              <span className="group-label-actions" onClick={(e) => e.stopPropagation()}>
                <button
                  ref={filterBtnRef}
                  type="button"
                  className="icon-btn"
                  title="Customize Sidebar"
                  aria-label="Customize Sidebar"
                  aria-expanded={menu?.kind === "filter"}
                  aria-haspopup="menu"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (menu?.kind === "filter") {
                      setMenu(null);
                      return;
                    }
                    const box = e.currentTarget.getBoundingClientRect();
                    setMenu({ kind: "filter", x: box.right + 4, y: box.top });
                  }}
                >
                  <IconFilter />
                </button>
                <button
                  type="button"
                  className="icon-btn"
                  title="Open Workspace"
                  aria-label="Open Workspace"
                  onClick={async () => {
                    const repos = await window.relay.addRepo();
                    await setRepos(repos);
                    if (repos[0] && !repoPath) setRepoPath(repos[0].path);
                  }}
                >
                  <IconFolderPlus />
                </button>
              </span>
            </div>
            {!reposCollapsed && (
              <div className="list">
                {state.repos.length === 0 && ungrouped.length === 0 && (
                  <div className="row-item muted disabled">
                    <span className="cell-icon" />
                    <span className="cell-content">No repositories</span>
                  </div>
                )}
                {grouped.map(({ repo, sessions }) => {
                  const collapsed = collapsedRepos.has(repo.path);
                  return (
                    <div key={repo.path} className={`repo-group ${collapsed ? "collapsed" : ""}`}>
                      <button
                        className="repo-row"
                        data-section-head=""
                        data-has-actions="true"
                        aria-expanded={!collapsed}
                        onClick={() => toggleRepo(repo.path)}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          setMenu({ kind: "repo", x: e.clientX, y: e.clientY, path: repo.path });
                        }}
                      >
                        <span className="cell-icon repo-icon">
                          <span className="icon-default">
                            {collapsed ? <IconFolder /> : <IconFolderOpen />}
                          </span>
                          <span className="icon-hover">
                            <IconChevron />
                          </span>
                        </span>
                        <span className="cell-content">{repo.name}</span>
                        <span className="row-end">
                          <span className="row-actions">
                            <button
                              className="row-action"
                              title="New Chat"
                              aria-label="New Chat"
                              onClick={(e) => {
                                e.stopPropagation();
                                setRepoPath(repo.path);
                                setSearching(false);
                                setSelectedId(null);
                              }}
                            >
                              <IconPlus />
                            </button>
                          </span>
                        </span>
                      </button>
                      {!collapsed &&
                        sessions.map((session) => (
                          <ChatRow key={session.id} session={session} />
                        ))}
                      {!collapsed && sessions.length === 0 && (
                        <div className="row-item muted disabled">
                          <span className="cell-icon" />
                          <span className="cell-content">No agents yet</span>
                        </div>
                      )}
                    </div>
                  );
                })}
                {ungrouped.map((session) => (
                  <ChatRow key={session.id} session={session} />
                ))}
              </div>
            )}
          </div>
        </div>
        {menu?.kind === "filter" && (
          <Menu
            x={menu.x}
            y={menu.y}
            ignoreRef={filterBtnRef}
            onClose={() => setMenu(null)}
          >
            <button
              className="menu-item"
              onClick={() => {
                setShowArchived((v) => {
                  const next = !v;
                  localStorage.setItem("relay.showArchived", next ? "1" : "0");
                  return next;
                });
              }}
            >
              Archived
              {showArchived ? <IconCheck className="menu-check" /> : <span className="menu-slot" />}
            </button>
            <button
              className="menu-item"
              onClick={() => {
                setCollapsedRepos(new Set(state.repos.map((repo) => repo.path)));
                setMenu(null);
              }}
            >
              Collapse All
            </button>
          </Menu>
        )}
        {menu?.kind === "repo" && (
          <Menu x={menu.x} y={menu.y} onClose={() => setMenu(null)}>
            <button className="menu-item" type="button" disabled>
              <IconPencil />
              Edit Workspace
            </button>
            <button
              className="menu-item danger"
              onClick={async () => {
                const path = menu.path;
                const selectedGone =
                  selectedId !== null &&
                  repoFor(
                    state.sessions.find((session) => session.id === selectedId)?.workingDirectory ?? "",
                    state.repos,
                  )?.path === path;
                const repos = await window.relay.removeRepo(path);
                await setRepos(repos);
                if (selectedGone) setSelectedId(null);
                setMenu(null);
              }}
            >
              <IconTrash />
              Remove from Sidebar
            </button>
          </Menu>
        )}
      </aside>

      <section className="canvas">
        <header className="canvas-tools">
          {sidebarCollapsed ? (
            <span className="canvas-tools-left">
              <TitlebarChrome
                collapsed
                onToggle={toggleSidebar}
                prevChatId={prevChatId}
                nextChatId={nextChatId}
                onSelect={setSelectedId}
              />
            </span>
          ) : (
            <span />
          )}
          <span className="canvas-tools-drag" />
          <span className="canvas-tools-right">
            <span className="ide-link" aria-disabled="true">
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
