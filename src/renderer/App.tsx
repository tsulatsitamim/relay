import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import type { RelayState } from "../shared/ipc.ts";
import type {
  AvailableCommandLike,
  AgentConfig,
  DiffComment,
  PlanEntry,
  PromptAttachment,
  Repo,
  Session,
  TranscriptEvent,
} from "../shared/types.ts";
import { repoFor } from "../shared/repo.ts";
import { HomeComposer } from "./HomeComposer";
import { Transcript } from "./Transcript";
import { Composer } from "./Composer";
import type { DiffCommentDraft } from "./DiffBlock.tsx";
import { composeReview, unsentComments } from "./review.ts";
import { SettingsNav, SettingsPage, type SettingsSection } from "./Settings";
import type { UsageInfo } from "./ContextMeter";
import { WorkingStatus } from "./WorkingStatus";
import { BranchPill } from "./BranchPill";
import { ConnectionStatus } from "./ConnectionStatus";
import { TurnFooter } from "./TurnFooter";
import { ErrorBanner } from "./ErrorBanner";
import { nextQueued, promoteQueued, pruneQueued, queuedNowMode } from "./queue";
import {
  commandsForAgent,
  lastCommands,
  mergeCommands,
  promptTurns,
} from "./commands";
import { PermissionCard } from "./PermissionCard";
import { SessionRow } from "./SessionRow";
import { findMatches, matchesSession } from "./search.ts";
import { promptHistory } from "./history.ts";
import { FindBar } from "./FindBar";
import { HelpDialog, type ShortcutHint } from "./HelpDialog";
import { CommandPalette, type PaletteCommand } from "./CommandPalette";
import {
  eventKey,
  isTypingTarget,
  resolveBinding,
  type KeyBinding,
  type TypingTargetLike,
} from "./keys.ts";
import {
  IconCheck,
  IconArrowLeft,
  IconArrowRight,
  IconChevron,
  IconCopy,
  IconFilter,
  IconFolder,
  IconFolderOpen,
  IconFolderPlus,
  IconMore,
  IconOut,
  IconPanelLeft,
  IconPen,
  IconPencil,
  IconPlus,
  IconRedo,
  IconSearch,
  IconSettings,
  IconTrash,
  IconTrafficClose,
  IconTrafficMax,
  IconTrafficMin,
} from "./icons";

const shortcutMod = navigator.platform.includes("Mac") ? "⌘" : "Ctrl+";

const emptyState: RelayState = {
  sessions: [],
  agents: [],
  recents: [],
  repos: [],
  transcripts: {},
  diffComments: {},
  permissions: [],
  homeDir: "",
  autoApprove: [],
  agentDefaults: {},
  settings: {},
  about: { version: "", dataPath: "" },
};

type MenuState =
  | { kind: "filter"; x: number; y: number }
  | { kind: "repo"; x: number; y: number; path: string }
  | { kind: "session"; x: number; y: number; sessionId: string };

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
      >
        <IconTrafficClose />
      </button>
      <button
        type="button"
        className="traffic-btn min"
        title="Minimize"
        aria-label="Minimize"
        onClick={() => void window.relay.windowControl("min")}
        onMouseDown={(e) => e.preventDefault()}
      >
        <IconTrafficMin />
      </button>
      <button
        type="button"
        className="traffic-btn max"
        title="Maximize"
        aria-label="Maximize"
        onClick={() => void window.relay.windowControl("max")}
        onMouseDown={(e) => e.preventDefault()}
      >
        <IconTrafficMax />
      </button>
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
  const [unread, setUnread] = useState<Set<string>>(() => new Set());
  const [autoApprove, setAutoApprove] = useState<Set<string>>(() => new Set());
  const selectedIdRef = useRef<string | null>(selectedId);
  const [repoPath, setRepoPath] = useState("");
  const [agentId, setAgentId] = useState("");
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [chatError, setChatError] = useState<
    {
      sessionId: string;
      message: string;
      prompt: string;
      attachments?: PromptAttachment[];
    } | null
  >(null);
  const [reposCollapsed, setReposCollapsed] = useState(false);
  const [pinnedCollapsed, setPinnedCollapsed] = useState(false);
  const [collapsedRepos, setCollapsedRepos] = useState<Set<string>>(() => new Set());
  const [showArchived, setShowArchived] = useState(
    () => localStorage.getItem("relay.showArchived") === "1",
  );
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [queued, setQueued] = useState<Record<string, string[]>>({});
  const [stashes, setStashes] = useState<Record<string, string>>({});
  const [findOpen, setFindOpen] = useState(false);
  const [findQuery, setFindQuery] = useState("");
  const [findIndex, setFindIndex] = useState(0);
  const flushing = useRef<Set<string>>(new Set());
  const sentPrompts = useRef<Record<string, string[]>>({});
  const [flushTick, setFlushTick] = useState(0);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => localStorage.getItem("relay.sidebarCollapsed") === "1",
  );
  const [inject, setInject] = useState<
    { text: string; nonce: number; fromEventId?: string } | undefined
  >();
  const [homeInject, setHomeInject] = useState<
    { text: string; nonce: number } | undefined
  >();
  const pendingTruncate = useRef<string | null>(null);
  const [injectSessionId, setInjectSessionId] = useState<string | null>(null);
  const [reviewedDiffs, setReviewedDiffs] = useState<Set<string>>(() => new Set());
  const [diffComments, setDiffComments] = useState<Record<string, DiffComment[]>>({});
  const [diffView, setDiffView] = useState<"unified" | "split">("unified");
  const pendingReview = useRef<string[] | null>(null);
  const [permissionIndex, setPermissionIndex] = useState(0);
  const [view, setView] = useState<"chat" | "settings">("chat");
  const [section, setSection] = useState<SettingsSection>("general");
  const [helpOpen, setHelpOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const bindingsRef = useRef<KeyBinding[]>([]);
  const filterBtnRef = useRef<HTMLButtonElement>(null);

  if (injectSessionId !== selectedId) {
    setInjectSessionId(selectedId);
    setInject(undefined);
  }

  const onHome = selectedId === null;

  useEffect(() => {
    void window.relay
      .getState()
      .then((next) => {
        setState(next);
        setAutoApprove(new Set(next.autoApprove));
        setDiffComments(next.diffComments ?? {});
        setRepoPath((path) => path || next.repos[0]?.path || "");
      })
      .catch((err) => console.error(err));
    return window.relay.subscribe((event) => {
      if (event.type === "transcript" && event.sessionId !== selectedIdRef.current) {
        setUnread((prev) => {
          if (prev.has(event.sessionId)) return prev;
          const next = new Set(prev);
          next.add(event.sessionId);
          return next;
        });
      }
      setState((prev) => {
        if (event.type === "sessions") return { ...prev, sessions: event.sessions };
        if (event.type === "transcript") {
          return {
            ...prev,
            transcripts: { ...prev.transcripts, [event.sessionId]: event.events },
          };
        }
        if (event.type === "permission") {
          return {
            ...prev,
            permissions: [
              ...prev.permissions.filter((p) => p.id !== event.request.id),
              event.request,
            ],
          };
        }
        if (event.type === "permission_resolved") {
          return {
            ...prev,
            permissions: prev.permissions.filter((p) => p.id !== event.requestId),
          };
        }
        return prev;
      });
    });
  }, []);

  useEffect(() => {
    const enabled = state.agents.filter((agent) => agent.enabled !== false);
    const preferred =
      state.agentDefaults[repoPath || state.homeDir] ??
      state.settings.defaultAgentId ??
      "";
    setAgentId(enabled.some((agent) => agent.id === preferred) ? preferred : "");
  }, [repoPath, state.agentDefaults, state.agents, state.settings.defaultAgentId]);

  useEffect(() => {
    selectedIdRef.current = selectedId;
    if (selectedId === null) return;
    setUnread((prev) => {
      if (!prev.has(selectedId)) return prev;
      const next = new Set(prev);
      next.delete(selectedId);
      return next;
    });
  }, [selectedId]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const binding = resolveBinding(
        bindingsRef.current,
        eventKey(event),
        isTypingTarget(event.target as unknown as TypingTargetLike),
      );
      if (!binding) return;
      event.preventDefault();
      binding.run();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    setFindOpen(false);
    setFindQuery("");
    setFindIndex(0);
    pendingTruncate.current = null;
    pendingReview.current = null;
  }, [selectedId]);

  const selected = useMemo(
    () => state.sessions.find((s) => s.id === selectedId) ?? null,
    [state.sessions, selectedId],
  );
  const events: TranscriptEvent[] = selected
    ? (state.transcripts[selected.id] ?? [])
    : [];
  const planEntries = useMemo(() => {
    for (let index = events.length - 1; index >= 0; index -= 1) {
      const event = events[index]!;
      if (event.kind === "plan") {
        return (event.payload.entries as PlanEntry[] | undefined) ?? [];
      }
    }
    return [];
  }, [events]);
  const usage = useMemo(() => {
    for (let index = events.length - 1; index >= 0; index -= 1) {
      const event = events[index]!;
      if (event.kind === "usage") return event.payload as UsageInfo;
    }
    return undefined;
  }, [events]);
  const composerHistory = selected
    ? promptHistory(events, sentPrompts.current[selected.id] ?? [])
    : [];
  const findResults = useMemo(
    () => (findOpen ? findMatches(events, findQuery) : []),
    [findOpen, events, findQuery],
  );
  const findCount = findResults.length;
  const activeMatchId =
    findCount > 0 ? findResults[Math.min(findIndex, findCount - 1)]! : null;

  const stepMatch = (delta: number) => {
    if (findCount === 0) return;
    setFindIndex((prev) => (prev + delta + findCount) % findCount);
  };
  const commands: AvailableCommandLike[] = selected
    ? lastCommands(events)
    : commandsForAgent(state.sessions, state.transcripts, agentId);
  const skillsCwd = selected ? selected.workingDirectory : repoPath;
  const [skillNames, setSkillNames] = useState<string[]>([]);
  useEffect(() => {
    let cancelled = false;
    void window.relay
      .listSkills(skillsCwd || undefined)
      .then((names) => {
        if (!cancelled) setSkillNames(names);
      })
      .catch(() => {
        if (!cancelled) setSkillNames([]);
      });
    return () => {
      cancelled = true;
    };
  }, [skillsCwd]);
  const commandList = mergeCommands(commands, skillNames);
  const composerLocked = Boolean(
    selected && ["starting", "working", "cancelling"].includes(selected.status),
  );
  const [sending, setSending] = useState<Set<string>>(new Set());
  useEffect(() => {
    setSending((prev) => {
      if (prev.size === 0) return prev;
      const next = new Set(prev);
      for (const id of prev) {
        const session = state.sessions.find((item) => item.id === id);
        if (session && !["starting", "working", "cancelling"].includes(session.status)) {
          next.delete(id);
        }
      }
      return next.size === prev.size ? prev : next;
    });
  }, [state.sessions]);
  const markSending = (id: string) => setSending((prev) => new Set(prev).add(id));
  const working = Boolean(
    selected && (composerLocked || sending.has(selected.id)),
  );
  const permissions = selected
    ? state.permissions.filter((request) => request.sessionId === selected.id)
    : [];
  const permissionCount = permissions.length;
  useEffect(() => {
    setPermissionIndex((index) =>
      permissionCount === 0 ? 0 : Math.min(index, permissionCount - 1),
    );
  }, [permissionCount]);
  const activePermissionIndex = Math.min(
    permissionIndex,
    Math.max(0, permissionCount - 1),
  );
  const stepPermission = (delta: number) => {
    if (permissionCount === 0) return;
    setPermissionIndex((index) => (index + delta + permissionCount) % permissionCount);
  };
  const permissionSessionIds = new Set(
    state.permissions.map((request) => request.sessionId),
  );
  const canRestart = Boolean(
    selected && ["exited", "error"].includes(selected.status),
  );

  const answerPermission = (requestId: string, optionId: string | null) => {
    setState((prev) => ({
      ...prev,
      permissions: prev.permissions.filter((p) => p.id !== requestId),
    }));
    void window.relay.permission(requestId, optionId);
  };

  const allowAllForSession = (
    sessionId: string,
    requestId: string,
    optionId: string | null,
  ) => {
    answerPermission(requestId, optionId);
    setAutoApprove((prev) => new Set(prev).add(sessionId));
    void window.relay.setAutoApprove(sessionId, true);
  };

  const disableAutoApprove = (sessionId: string) => {
    setAutoApprove((prev) => {
      if (!prev.has(sessionId)) return prev;
      const next = new Set(prev);
      next.delete(sessionId);
      return next;
    });
    void window.relay.setAutoApprove(sessionId, false);
  };

  const toggleDiffReviewed = (eventId: string) => {
    setReviewedDiffs((prev) => {
      const next = new Set(prev);
      if (next.has(eventId)) next.delete(eventId);
      else next.add(eventId);
      return next;
    });
  };

  const openDiff = (path: string) => {
    if (!selected) return Promise.resolve(false);
    return window.relay.openPath(selected.workingDirectory, path);
  };

  const addDiffComment = (
    sessionId: string,
    eventId: string,
    input: DiffCommentDraft,
  ) => {
    void window.relay
      .addDiffComment(sessionId, { eventId, ...input })
      .then((comment) => {
        setDiffComments((prev) => ({
          ...prev,
          [sessionId]: [...(prev[sessionId] ?? []), comment],
        }));
      })
      .catch((err) => console.error(err));
  };

  const deleteDiffComment = (id: string) => {
    void window.relay
      .deleteDiffComment(id)
      .then(() => {
        setDiffComments((prev) => {
          const next: Record<string, DiffComment[]> = {};
          for (const [key, list] of Object.entries(prev)) {
            next[key] = list.filter((comment) => comment.id !== id);
          }
          return next;
        });
      })
      .catch((err) => console.error(err));
  };

  const markPendingReviewSent = (sessionId: string) => {
    const ids = pendingReview.current;
    if (!ids || ids.length === 0) return;
    void window.relay
      .markDiffCommentsSent(sessionId, ids)
      .then(() => {
        pendingReview.current = null;
        const when = Date.now();
        setDiffComments((prev) => ({
          ...prev,
          [sessionId]: (prev[sessionId] ?? []).map((comment) =>
            ids.includes(comment.id) ? { ...comment, sentAt: when } : comment,
          ),
        }));
      })
      .catch((err) => console.error(err));
  };

  const sendDiffReview = (sessionId: string, ids: string[]) => {
    const picked = unsentComments(
      (diffComments[sessionId] ?? []).filter((comment) => ids.includes(comment.id)),
    );
    if (picked.length === 0) return;
    pendingReview.current = picked.map((comment) => comment.id);
    setInject({ text: composeReview(picked), nonce: Date.now() });
  };

  const rewind = async (sessionId: string, eventId: string, text: string) => {
    const session = state.sessions.find((s) => s.id === sessionId);
    if (
      !session ||
      ["starting", "working", "cancelling"].includes(session.status)
    ) {
      return;
    }
    pendingTruncate.current = null;
    try {
      await window.relay.truncate(sessionId, eventId);
    } catch (err) {
      setChatError({
        sessionId,
        message: err instanceof Error ? err.message : String(err),
        prompt: text,
      });
      return;
    }
    setInject({ text, nonce: Date.now() });
  };

  const sendToSession = async (
    sessionId: string,
    text: string,
    attachments?: PromptAttachment[],
  ) => {
    const fromEventId = pendingTruncate.current;
    if (fromEventId) {
      pendingTruncate.current = null;
      await window.relay.truncate(sessionId, fromEventId).catch(() => undefined);
    }
    const turns = promptTurns(
      text,
      commandList.map((command) => command.name),
      skillNames,
    );
    const first = turns[0] ?? text;
    const trimmed = text.trim();
    if (trimmed) {
      sentPrompts.current[sessionId] = [
        ...(sentPrompts.current[sessionId] ?? []),
        trimmed,
      ];
    }
    if (turns.length > 1) {
      const rest = turns.slice(1);
      setQueued((prev) => ({
        ...prev,
        [sessionId]: [...(prev[sessionId] ?? []), ...rest],
      }));
    }
    setBusy(true);
    setChatError(null);
    markSending(sessionId);
    let sent = false;
    try {
      await window.relay.send(sessionId, first, attachments);
      sent = true;
    } catch (err) {
      setChatError({
        sessionId,
        message: err instanceof Error ? err.message : String(err),
        prompt: text,
        attachments,
      });
    } finally {
      setBusy(false);
    }
    if (sent) markPendingReviewSent(sessionId);
  };

  const enqueue = (sessionId: string, text: string) => {
    pendingTruncate.current = null;
    setQueued((prev) => ({
      ...prev,
      [sessionId]: [...(prev[sessionId] ?? []), text],
    }));
  };

  const removeQueued = (sessionId: string, index: number) => {
    setQueued((prev) => ({
      ...prev,
      [sessionId]: (prev[sessionId] ?? []).filter((_, i) => i !== index),
    }));
  };

  const clearQueued = (sessionId: string) => {
    setQueued((prev) => ({
      ...prev,
      [sessionId]: [],
    }));
  };

  const editQueued = (sessionId: string, index: number) => {
    const text = (queued[sessionId] ?? [])[index];
    if (text == null) return;
    removeQueued(sessionId, index);
    setInject({ text, nonce: Date.now() });
  };

  const sendQueuedNext = (sessionId: string, index: number) => {
    pendingTruncate.current = null;
    setQueued((prev) => ({
      ...prev,
      [sessionId]: promoteQueued(prev[sessionId] ?? [], index),
    }));
  };

  const sendQueuedNow = (sessionId: string, index: number) => {
    const item = (queued[sessionId] ?? [])[index];
    if (item == null) return;
    pendingTruncate.current = null;
    const session = state.sessions.find((entry) => entry.id === sessionId);
    if (queuedNowMode(session?.status ?? "idle") === "send") {
      removeQueued(sessionId, index);
      void sendToSession(sessionId, item);
      return;
    }
    setQueued((prev) => ({
      ...prev,
      [sessionId]: promoteQueued(prev[sessionId] ?? [], index),
    }));
    void window.relay.cancel(sessionId).catch((err) => {
      setChatError({
        sessionId,
        message: err instanceof Error ? err.message : String(err),
        prompt: item,
      });
    });
  };

  useEffect(() => {
    setQueued((prev) =>
      pruneQueued(
        prev,
        state.sessions.map((session) => session.id),
      ),
    );
  }, [state.sessions]);

  useEffect(() => {
    for (const session of state.sessions) {
      const next = nextQueued(queued[session.id] ?? [], session.status);
      if (!next || flushing.current.has(session.id)) continue;
      flushing.current.add(session.id);
      setQueued((prev) => ({
        ...prev,
        [session.id]: (prev[session.id] ?? []).slice(1),
      }));
      void sendToSession(session.id, next).finally(() => {
        flushing.current.delete(session.id);
        setFlushTick((tick) => tick + 1);
      });
    }
  }, [state.sessions, queued, flushTick]);

  const activeChatError =
    chatError && selected && chatError.sessionId === selected.id ? chatError : null;

  const chats = state.sessions.filter((session) => {
    if (!showArchived && session.archived) return false;
    if (
      query.trim() &&
      !matchesSession(query, session.title, state.transcripts[session.id] ?? [])
    ) {
      return false;
    }
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
    setAutoApprove(new Set(next.autoApprove));
    return next;
  }

  async function setRepos(repos: Repo[]) {
    setState((prev) => ({ ...prev, repos }));
    if (repoPath && !repos.some((r) => r.path === repoPath)) {
      setRepoPath(repos[0]?.path ?? "");
    }
  }

  async function saveAgent(agent: AgentConfig): Promise<AgentConfig> {
    const saved = await window.relay.saveAgent(agent);
    setState((prev) => {
      const exists = prev.agents.some((item) => item.id === saved.id);
      return {
        ...prev,
        agents: exists
          ? prev.agents.map((item) => (item.id === saved.id ? saved : item))
          : [...prev.agents, saved],
      };
    });
    return saved;
  }

  async function deleteAgent(id: string) {
    await window.relay.deleteAgent(id);
    setState((prev) => ({
      ...prev,
      agents: prev.agents.filter((item) => item.id !== id),
    }));
  }

  async function installClaudeAdapter(onOutput?: (line: string) => void) {
    const result = await window.relay.installClaudeAdapter(onOutput);
    if (result.ok) await refresh();
    return result;
  }

  function setSetting(key: string, value: string) {
    setState((prev) => ({
      ...prev,
      settings: { ...prev.settings, [key]: value },
    }));
    void window.relay.setSetting(key, value);
  }

  function toggleSettings() {
    setView((current) => (current === "settings" ? "chat" : "settings"));
  }

  function newChat() {
    setSearching(false);
    setSelectedId(null);
  }

  function findInConversation() {
    if (selectedId !== null) setFindOpen((value) => !value);
  }

  function runEscape() {
    if (commandOpen) {
      setCommandOpen(false);
      return;
    }
    if (helpOpen) {
      setHelpOpen(false);
      return;
    }
    if (view === "settings") {
      setView("chat");
      return;
    }
    if (findOpen) {
      setFindOpen(false);
      return;
    }
    const current = state.sessions.find((session) => session.id === selectedId);
    if (current && (current.status === "working" || current.status === "starting")) {
      void window.relay.cancel(current.id);
    } else {
      setSearching(false);
      setSelectedId(null);
    }
  }

  const paletteCommands: PaletteCommand[] = [
    {
      id: "new-chat",
      label: "New chat",
      hint: "Start a fresh conversation",
      shortcut: "mod+n",
      run: newChat,
    },
    {
      id: "open-settings",
      label: "Open settings",
      hint: "Preferences and providers",
      run: () => setView("settings"),
    },
    { id: "toggle-sidebar", label: "Toggle sidebar", shortcut: "mod+b", run: toggleSidebar },
  ];
  if (selected) {
    paletteCommands.push(
      {
        id: "find",
        label: "Find in conversation",
        hint: selected.title,
        shortcut: "mod+f",
        run: findInConversation,
      },
      {
        id: "clear-queue",
        label: "Clear queued messages",
        hint: selected.title,
        run: () => clearQueued(selected.id),
      },
      {
        id: "copy-debug",
        label: "Copy debug info",
        hint: selected.title,
        run: () => void window.relay.copyDebug(selected.id),
      },
      {
        id: "restart",
        label: "Restart session",
        hint: selected.title,
        run: () => void window.relay.restart(selected.id),
      },
    );
  }

  const bindings: KeyBinding[] = [
    { id: "new-chat", keys: "mod+n", label: "New chat", scope: "global", run: newChat },
    {
      id: "palette",
      keys: "mod+k",
      label: "Command palette",
      scope: "global",
      run: () => setCommandOpen((value) => !value),
    },
    { id: "sidebar", keys: "mod+b", label: "Toggle sidebar", scope: "global", run: toggleSidebar },
    {
      id: "find",
      keys: "mod+f",
      label: "Find in conversation",
      scope: "global",
      run: findInConversation,
    },
    {
      id: "help",
      keys: "mod+/",
      label: "Keyboard shortcuts",
      scope: "notTyping",
      run: () => setHelpOpen(true),
    },
    {
      id: "help-question",
      keys: "?",
      label: "Keyboard shortcuts",
      scope: "notTyping",
      run: () => setHelpOpen(true),
    },
    { id: "escape", keys: "Escape", label: "Close overlay", scope: "global", run: runEscape },
  ];

  const shortcutHints: ShortcutHint[] = [
    { label: "New chat", keys: "mod+n" },
    { label: "Command palette", keys: "mod+k" },
    { label: "Find in conversation", keys: "mod+f" },
    { label: "Toggle sidebar", keys: "mod+b" },
    { label: "Stash / restore draft", keys: "mod+s" },
    { label: "Keyboard shortcuts", keys: "?" },
    { label: "Close overlay", keys: "Escape" },
  ];

  useEffect(() => {
    bindingsRef.current = bindings;
  });

  function renderRow(session: Session) {
    return (
      <SessionRow
        key={session.id}
        session={session}
        active={session.id === selectedId}
        renaming={session.id === renamingId}
        permission={permissionSessionIds.has(session.id)}
        unread={unread.has(session.id)}
        onSelect={setSelectedId}
        onContextMenu={(row, e) =>
          setMenu({ kind: "session", x: e.clientX, y: e.clientY, sessionId: row.id })
        }
        onRename={(id, title) => {
          setRenamingId(null);
          void window.relay.rename(id, title);
        }}
        onCancelRename={() => setRenamingId(null)}
      />
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
        {view === "settings" ? (
          <SettingsNav section={section} onSelect={setSection} onClose={toggleSettings} />
        ) : (
          <>
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
                  {pinned.map((session) => renderRow(session))}
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
                      <div
                        className="repo-row"
                        role="button"
                        tabIndex={0}
                        data-section-head=""
                        data-has-actions="true"
                        aria-expanded={!collapsed}
                        onClick={() => toggleRepo(repo.path)}
                        onKeyDown={(e) => {
                          if (e.key !== "Enter" && e.key !== " ") return;
                          e.preventDefault();
                          toggleRepo(repo.path);
                        }}
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
                      </div>
                      {!collapsed &&
                        sessions.map((session) => renderRow(session))}
                      {!collapsed && sessions.length === 0 && (
                        <div className="row-item muted disabled">
                          <span className="cell-icon" />
                          <span className="cell-content">No agents yet</span>
                        </div>
                      )}
                    </div>
                  );
                })}
                {ungrouped.map((session) => renderRow(session))}
              </div>
            )}
          </div>
        </div>
          </>
        )}
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
        {menu?.kind === "session" && (
          <Menu x={menu.x} y={menu.y} onClose={() => setMenu(null)}>
            <button
              className="menu-item"
              onClick={() => {
                setRenamingId(menu.sessionId);
                setMenu(null);
              }}
            >
              <IconPencil />
              Rename
            </button>
            <button
              className="menu-item"
              onClick={() => {
                void window.relay.restart(menu.sessionId);
                setMenu(null);
              }}
            >
              <IconRedo />
              Restart
            </button>
            <button
              className="menu-item"
              onClick={() => {
                void window.relay.copyDebug(menu.sessionId);
                setMenu(null);
              }}
            >
              <IconCopy />
              Copy Debug Info
            </button>
            <button
              className="menu-item danger"
              onClick={async () => {
                const id = menu.sessionId;
                setMenu(null);
                setRenamingId((current) => (current === id ? null : current));
                await window.relay.delete(id);
                setSelectedId((current) => (current === id ? null : current));
              }}
            >
              <IconTrash />
              Delete
            </button>
          </Menu>
        )}
        <div className="sidebar-foot">
          <button
            type="button"
            className={`icon-btn${view === "settings" ? " active" : ""}`}
            title="Settings"
            aria-label="Settings"
            aria-pressed={view === "settings"}
            onClick={toggleSettings}
          >
            <IconSettings />
          </button>
        </div>
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
        {view === "settings" ? (
          <SettingsPage
            section={section}
            agents={state.agents}
            settings={state.settings}
            about={state.about}
            sessionCount={state.sessions.length}
            claudeAdapter={state.claudeAdapter}
            onSaveAgent={saveAgent}
            onDeleteAgent={deleteAgent}
            onSetSetting={setSetting}
            onInstallClaudeAdapter={installClaudeAdapter}
          />
        ) : selected ? (
          <div className="thread">
            <header className="thread-head">
              <span className="thread-name">{selected.title}</span>
              <ConnectionStatus status={selected.status} />
              <BranchPill cwd={selected.workingDirectory} />
              <WorkingStatus active={working} since={selected.lastPromptAt} />
              {autoApprove.has(selected.id) ? (
                <span className="auto-approve-pill">
                  Auto-approve on
                  <button
                    type="button"
                    className="auto-approve-off"
                    aria-label="Turn off auto-approve"
                    onClick={() => disableAutoApprove(selected.id)}
                  >
                    Off
                  </button>
                </span>
              ) : null}
              {selected.error ? <span className="thread-err">{selected.error}</span> : null}
              {canRestart ? (
                <button
                  type="button"
                  className="thread-restart"
                  onClick={() => void window.relay.restart(selected.id)}
                >
                  Restart
                </button>
              ) : null}
            </header>
            {findOpen ? (
              <FindBar
                query={findQuery}
                onQuery={(value) => {
                  setFindQuery(value);
                  setFindIndex(0);
                }}
                count={findCount}
                index={findIndex}
                onPrev={() => stepMatch(-1)}
                onNext={() => stepMatch(1)}
                onClose={() => setFindOpen(false)}
              />
            ) : null}
            <Transcript
              events={events}
              activeEventId={findOpen ? activeMatchId : null}
              sessionId={selected.id}
              streaming={working}
              onEditUser={(text, eventId) => {
                if (working) {
                  pendingTruncate.current = eventId;
                  setInject({ text, nonce: Date.now(), fromEventId: eventId });
                  return;
                }
                pendingTruncate.current = eventId;
                setInject(undefined);
                void sendToSession(selected.id, text);
              }}
              onRewind={(eventId, text) => void rewind(selected.id, eventId, text)}
              onFork={(text) => {
                setSelectedId(null);
                setRepoPath(selected.workingDirectory);
                setAgentId(selected.agentConfigId);
                setHomeInject({ text, nonce: Date.now() });
              }}
              reviewedDiffIds={reviewedDiffs}
              diffComments={diffComments[selected.id] ?? []}
              diffView={diffView}
              onSetDiffView={setDiffView}
              onToggleReviewed={toggleDiffReviewed}
              onOpenDiff={openDiff}
              onAddDiffComment={(eventId, input) =>
                addDiffComment(selected.id, eventId, input)
              }
              onDeleteDiffComment={deleteDiffComment}
              onSendDiffReview={(ids) => sendDiffReview(selected.id, ids)}
              footer={
                <TurnFooter
                  events={events}
                  lastPromptAt={selected.lastPromptAt}
                  working={working}
                />
              }
            />
            {permissions.length > 0 ? (
              <div className="permission-dock">
                {permissions.map((request, index) => (
                  <PermissionCard
                    key={request.id}
                    request={request}
                    active={index === activePermissionIndex}
                    position={{ index, total: permissionCount }}
                    onStep={permissionCount > 1 ? stepPermission : undefined}
                    onAnswer={answerPermission}
                    onAllowAll={(requestId, optionId) =>
                      allowAllForSession(request.sessionId, requestId, optionId)
                    }
                  />
                ))}
              </div>
            ) : null}
            {activeChatError ? (
              <ErrorBanner
                message={activeChatError.message}
                onRetry={() =>
                  void sendToSession(
                    activeChatError.sessionId,
                    activeChatError.prompt,
                    activeChatError.attachments,
                  )
                }
              />
            ) : null}
            <Composer
              key={selected.id}
              disabled={busy}
              working={composerLocked}
              onCancel={() => void window.relay.cancel(selected.id)}
              onSend={(text, attachments) => sendToSession(selected.id, text, attachments)}
              queued={queued[selected.id] ?? []}
              onQueue={(text) => enqueue(selected.id, text)}
              onRemoveQueued={(index) => removeQueued(selected.id, index)}
              onClearQueued={() => clearQueued(selected.id)}
              onEditQueued={(index) => editQueued(selected.id, index)}
              onSendQueued={(index) => sendQueuedNext(selected.id, index)}
              onSendQueuedNow={(index) => sendQueuedNow(selected.id, index)}
              commands={commandList}
              cwd={selected.workingDirectory}
              inject={inject}
              plan={planEntries}
              usage={usage}
              history={composerHistory}
              stash={stashes[selected.id] ?? null}
              onStash={(text) =>
                setStashes((prev) => ({ ...prev, [selected.id]: text }))
              }
              onRestoreStash={() =>
                setStashes((prev) => {
                  const next = { ...prev };
                  delete next[selected.id];
                  return next;
                })
              }
            />
          </div>
        ) : (
          <HomeComposer
            agents={state.agents.filter((agent) => agent.enabled !== false)}
            repos={state.repos}
            recents={state.recents}
            agentId={agentId}
            repoPath={repoPath}
            busy={busy}
            error={error}
            commands={commandList}
            inject={homeInject}
            onAgentId={setAgentId}
            onRepoPath={setRepoPath}
            onSubmit={async (prompt, attachments) => {
              if (!agentId) {
                setError("Choose an agent.");
                return;
              }
              setBusy(true);
              setError(null);
              try {
                const turns = promptTurns(
                  prompt,
                  commandList.map((command) => command.name),
                  skillNames,
                );
                const session = await window.relay.create({
                  agentId,
                  cwd: repoPath,
                  prompt: turns[0] ?? prompt,
                  attachments,
                });
                markSending(session.id);
                if (turns.length > 1) {
                  const rest = turns.slice(1);
                  setQueued((prev) => ({
                    ...prev,
                    [session.id]: [...(prev[session.id] ?? []), ...rest],
                  }));
                }
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
      {commandOpen ? (
        <CommandPalette
          commands={paletteCommands}
          sessions={state.sessions}
          transcripts={state.transcripts}
          folders={state.recents}
          mod={shortcutMod}
          onSelectSession={(id) => {
            setView("chat");
            setSelectedId(id);
          }}
          onSelectFolder={(path) => {
            setView("chat");
            setRepoPath(path);
            setSelectedId(null);
          }}
          onClose={() => setCommandOpen(false)}
        />
      ) : null}
      {helpOpen ? (
        <HelpDialog
          shortcuts={shortcutHints}
          mod={shortcutMod}
          onClose={() => setHelpOpen(false)}
        />
      ) : null}
    </div>
  );
}
