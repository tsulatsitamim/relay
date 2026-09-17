import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { DiffComment, PlanEntry, TranscriptEvent } from "../shared/types.ts";
import { DiffBlock, type DiffCommentDraft, type DiffView } from "./DiffBlock";
import { DiffGroup } from "./DiffGroup";
import { formatUsage } from "./format";
import { Markdown } from "./Markdown";
import { AGENT_MESSAGE_CAP, capAgentMessage } from "./message-cap";
import { PlanBlock } from "./PlanBlock";
import { ThinkingBlock } from "./ThinkingBlock";
import { ToolCallCard, type ToolCallData } from "./ToolCallCard";
import { ToolGroup } from "./ToolGroup";
import { CopyButton } from "./CopyButton";
import { htmlFromNode } from "./rich-clipboard";
import { IconArrowDown, IconCheck, IconChevron, IconFork, IconRewind, IconX } from "./icons";
import { MinimapRail } from "./MinimapRail";
import { buildTurns as buildRailTurns, jumpTop } from "./minimap";
import { isNearBottom, nextFollowMode, type FollowMode } from "./scroll";
import { buildRows } from "./transcript-rows";
import { buildTurns, isTurnOpen, turnSummary } from "./turns";
import { useVisibleAnimation } from "./visible-animation";

type Props = {
  events: TranscriptEvent[];
  onEditUser?: (text: string, eventId: string) => void;
  onRewind?: (eventId: string, text: string) => void;
  onFork?: (text: string) => void;
  reviewedDiffIds?: Set<string>;
  diffComments?: DiffComment[];
  diffView?: DiffView;
  onSetDiffView?: (view: DiffView) => void;
  onToggleReviewed?: (eventId: string) => void;
  onOpenDiff?: (path: string) => void | Promise<unknown>;
  onAddDiffComment?: (eventId: string, input: DiffCommentDraft) => void;
  onDeleteDiffComment?: (id: string) => void;
  onSendDiffReview?: (ids: string[]) => void;
  footer?: ReactNode;
  activeEventId?: string | null;
  sessionId?: string;
  streaming?: boolean;
};

const COLLAPSE_MAX_CHARS = 600;
const COLLAPSE_MAX_LINES = 8;
const DEFAULT_OPEN_TURNS = 5;
const FOLD_PROMPT_MAX = 72;

function foldPrompt(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > FOLD_PROMPT_MAX
    ? `${flat.slice(0, FOLD_PROMPT_MAX - 1).trimEnd()}…`
    : flat;
}

function EventRow({
  event,
  time,
  onEditUser,
  onRewind,
  onFork,
  reviewedDiffIds,
  diffComments,
  diffView,
  onSetDiffView,
  onToggleReviewed,
  onOpenDiff,
  onAddDiffComment,
  onDeleteDiffComment,
  onSendDiffReview,
}: {
  event: TranscriptEvent;
  time: string | null;
  onEditUser?: (text: string, eventId: string) => void;
  onRewind?: (eventId: string, text: string) => void;
  onFork?: (text: string) => void;
  reviewedDiffIds?: Set<string>;
  diffComments?: DiffComment[];
  diffView?: DiffView;
  onSetDiffView?: (view: DiffView) => void;
  onToggleReviewed?: (eventId: string) => void;
  onOpenDiff?: (path: string) => void | Promise<unknown>;
  onAddDiffComment?: (eventId: string, input: DiffCommentDraft) => void;
  onDeleteDiffComment?: (id: string) => void;
  onSendDiffReview?: (ids: string[]) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [expanded, setExpanded] = useState(false);
  const editRef = useRef<HTMLTextAreaElement>(null);
  const markdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!editing) return;
    const el = editRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [editing, draft]);

  if (event.kind === "commands") return null;

  if (event.kind === "user") {
    const text = String(event.payload.text ?? "");
    const attachments = event.payload.attachments as
      | { name: string; thumb?: string }[]
      | undefined;
    const isLong =
      text.length > COLLAPSE_MAX_CHARS ||
      text.split("\n").length > COLLAPSE_MAX_LINES;
    const save = () => {
      setEditing(false);
      onEditUser?.(draft, event.id);
    };
    return (
      <div
        className="msg user"
        onClick={() => {
          if (editing || !onEditUser) return;
          setDraft(text);
          setEditing(true);
        }}
      >
        <div className="msg-bubble">
          {editing ? (
            <div className="msg-edit">
              <textarea
                ref={editRef}
                className="msg-edit-input"
                aria-label="Edit message text"
                value={draft}
                autoFocus
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    save();
                  } else if (e.key === "Escape") {
                    e.preventDefault();
                    setEditing(false);
                  }
                }}
              />
              <div className="msg-edit-actions">
                <button
                  type="button"
                  className="msg-action"
                  aria-label="Save edit"
                  title="Save"
                  onClick={(e) => {
                    e.stopPropagation();
                    save();
                  }}
                >
                  <IconCheck />
                </button>
                <button
                  type="button"
                  className="msg-action"
                  aria-label="Cancel edit"
                  title="Cancel"
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditing(false);
                  }}
                >
                  <IconX />
                </button>
              </div>
            </div>
          ) : (
            <>
              {isLong ? (
                <div className={`msg-text${expanded ? " expanded" : " collapsed"}`}>
                  {text}
                </div>
              ) : (
                text
              )}
              {isLong ? (
                <button
                  type="button"
                  className="msg-expand"
                  onClick={(e) => {
                    e.stopPropagation();
                    setExpanded((value) => !value);
                  }}
                >
                  {expanded ? "Show less" : "Show full message"}
                </button>
              ) : null}
              {attachments?.length ? (
                <div className="msg-attachments">
                  {attachments.map((a, index) => (
                    <span className="msg-attachment" key={`${index}-${a.name}`}>
                      {a.thumb ? (
                        <img className="msg-thumb" src={a.thumb} alt={a.name} />
                      ) : null}
                      {a.name}
                    </span>
                  ))}
                </div>
              ) : null}
            </>
          )}
        </div>
        {editing ? null : (
          <div className="msg-foot" onClick={(e) => e.stopPropagation()}>
            <div className="msg-actions">
              <CopyButton text={text} />
              {onRewind ? (
                <button
                  type="button"
                  className="msg-action"
                  aria-label="Rewind to this message"
                  title="Rewind"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRewind(event.id, text);
                  }}
                >
                  <IconRewind />
                </button>
              ) : null}
              {onFork ? (
                <button
                  type="button"
                  className="msg-action"
                  aria-label="Fork as new chat"
                  title="Fork"
                  onClick={(e) => {
                    e.stopPropagation();
                    onFork(text);
                  }}
                >
                  <IconFork />
                </button>
              ) : null}
            </div>
            {time != null ? <span className="msg-time">{time}</span> : null}
          </div>
        )}
      </div>
    );
  }

  if (event.kind === "agent_message") {
    const text = String(event.payload.text ?? "");
    const { text: shownText, capped } = capAgentMessage(text);
    return (
      <div className="msg agent">
        <div ref={markdownRef}>
          <Markdown text={shownText} />
        </div>
        {capped ? (
          <div className="msg-cap">
            Message capped at {AGENT_MESSAGE_CAP.toLocaleString("en-US")} characters
          </div>
        ) : null}
        <div className="msg-foot">
          <div className="msg-actions">
            <CopyButton text={text} html={() => htmlFromNode(markdownRef.current)} />
          </div>
          {time != null ? <span className="msg-time">{time}</span> : null}
        </div>
      </div>
    );
  }

  if (event.kind === "thinking") {
    return <ThinkingBlock text={String(event.payload.text ?? "")} />;
  }

  if (event.kind === "usage") {
    const line = formatUsage(
      event.payload as {
        used?: number;
        size?: number;
        costAmount?: number;
        costCurrency?: string;
      },
    );
    if (!line) return null;
    return <div className="msg usage">{line}</div>;
  }

  if (event.kind === "plan") {
    return <PlanBlock entries={(event.payload.entries as PlanEntry[] | undefined) ?? []} />;
  }

  if (event.kind === "tool_call") {
    return <ToolCallCard toolCall={event.payload as ToolCallData} />;
  }

  if (event.kind === "diff") {
    const path = String(event.payload.path ?? "file");
    return (
      <DiffBlock
        path={path}
        oldText={(event.payload.oldText as string | null) ?? null}
        newText={String(event.payload.newText ?? "")}
        reviewed={reviewedDiffIds?.has(event.id)}
        view={diffView}
        onView={onSetDiffView}
        comments={(diffComments ?? []).filter((comment) => comment.eventId === event.id)}
        onToggleReviewed={
          onToggleReviewed ? () => onToggleReviewed(event.id) : undefined
        }
        onOpen={onOpenDiff ? () => onOpenDiff(path) : undefined}
        onAddComment={
          onAddDiffComment ? (input) => onAddDiffComment(event.id, input) : undefined
        }
        onDeleteComment={onDeleteDiffComment}
        onSendReview={onSendDiffReview}
      />
    );
  }

  if (event.kind === "error") {
    return <div className="msg error">{String(event.payload.text ?? "Error")}</div>;
  }

  return <div className="msg status">{String(event.payload.text ?? "")}</div>;
}

function MessageRow({
  event,
  time,
  isActive,
  streamingRow,
  userTurn,
  group,
  groupKind,
  onEditUser,
  onRewind,
  onFork,
  reviewedDiffIds,
  diffComments,
  diffView,
  onSetDiffView,
  onToggleReviewed,
  onOpenDiff,
  onAddDiffComment,
  onDeleteDiffComment,
  onSendDiffReview,
}: {
  event: TranscriptEvent;
  time: string | null;
  isActive: boolean;
  streamingRow?: boolean;
  userTurn?: number;
  group?: TranscriptEvent[];
  groupKind?: "tool" | "diff";
  onEditUser?: (text: string, eventId: string) => void;
  onRewind?: (eventId: string, text: string) => void;
  onFork?: (text: string) => void;
  reviewedDiffIds?: Set<string>;
  diffComments?: DiffComment[];
  diffView?: DiffView;
  onSetDiffView?: (view: DiffView) => void;
  onToggleReviewed?: (eventId: string) => void;
  onOpenDiff?: (path: string) => void | Promise<unknown>;
  onAddDiffComment?: (eventId: string, input: DiffCommentDraft) => void;
  onDeleteDiffComment?: (id: string) => void;
  onSendDiffReview?: (ids: string[]) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useVisibleAnimation(ref);
  return (
    <div
      ref={ref}
      className={`msg-row${isActive ? " find-active" : ""}`}
      data-event-id={event.id}
      data-user-turn={userTurn}
      data-streaming-row={streamingRow ? "" : undefined}
    >
      {group ? (
        groupKind === "diff" ? (
          <DiffGroup
            events={group}
            reviewedDiffIds={reviewedDiffIds}
            comments={diffComments}
            view={diffView}
            onView={onSetDiffView}
            onToggleReviewed={onToggleReviewed}
            onOpenDiff={onOpenDiff}
            onAddComment={onAddDiffComment}
            onDeleteComment={onDeleteDiffComment}
            onSendReview={onSendDiffReview}
          />
        ) : (
          <ToolGroup events={group} />
        )
      ) : (
        <EventRow
          event={event}
          time={time}
          onEditUser={onEditUser}
          onRewind={onRewind}
          onFork={onFork}
          reviewedDiffIds={reviewedDiffIds}
          diffComments={diffComments}
          diffView={diffView}
          onSetDiffView={onSetDiffView}
          onToggleReviewed={onToggleReviewed}
          onOpenDiff={onOpenDiff}
          onAddDiffComment={onAddDiffComment}
          onDeleteDiffComment={onDeleteDiffComment}
          onSendDiffReview={onSendDiffReview}
        />
      )}
    </div>
  );
}

export function Transcript({
  events,
  onEditUser,
  onRewind,
  onFork,
  reviewedDiffIds,
  diffComments,
  diffView,
  onSetDiffView,
  onToggleReviewed,
  onOpenDiff,
  onAddDiffComment,
  onDeleteDiffComment,
  onSendDiffReview,
  footer,
  activeEventId,
  sessionId,
  streaming = false,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<FollowMode>("following");
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const seenEventIds = useRef<Set<string>>(new Set(events.map((event) => event.id)));
  const suppressScroll = useRef(false);
  const streamingSinceRef = useRef<number | null>(null);
  if (streaming) {
    if (streamingSinceRef.current === null) {
      streamingSinceRef.current = events.length;
    }
  } else {
    streamingSinceRef.current = null;
  }
  const rows = useMemo(() => buildRows(events), [events]);
  const turns = useMemo(() => buildTurns(rows), [rows]);
  const railTurns = useMemo(() => buildRailTurns(events), [events]);
  const rowOffsets = useMemo(() => {
    const offsets: number[] = [];
    let total = 0;
    for (const turn of turns) {
      offsets.push(total);
      total += turn.rows.length;
    }
    return offsets;
  }, [turns]);
  const turnIndexByEventId = useMemo(() => {
    const map = new Map<string, number>();
    let index = 0;
    for (const event of events) {
      if (event.kind === "user") map.set(event.id, index++);
    }
    return map;
  }, [events]);

  function resumeScrollTracking() {
    suppressScroll.current = true;
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => {
        suppressScroll.current = false;
      });
    } else {
      suppressScroll.current = false;
    }
  }

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const newest = events[events.length - 1];
    if (newest && newest.kind === "user" && !seenEventIds.current.has(newest.id)) {
      seenEventIds.current.add(newest.id);
      const row = el.querySelector(`[data-event-id="${newest.id}"]`);
      if (row instanceof HTMLElement) {
        resumeScrollTracking();
        row.scrollIntoView?.({ block: "start" });
      }
      setMode((current) => nextFollowMode(current, "jump-to-latest"));
      return;
    }
    if (modeRef.current !== "following") return;
    el.scrollTop = el.scrollHeight;
  }, [events]);

  const sessionRef = useRef(sessionId);
  useEffect(() => {
    if (sessionRef.current === sessionId) return;
    sessionRef.current = sessionId;
    setExpanded(new Set());
  }, [sessionId]);

  useEffect(() => {
    if (!activeEventId) return;
    const index = turns.findIndex((turn) =>
      turn.rows.some((row) => row.event.id === activeEventId),
    );
    if (index < 0 || isTurnOpen(turns, index, expanded, DEFAULT_OPEN_TURNS)) return;
    setExpanded((prev) => {
      if (prev.has(turns[index]!.key)) return prev;
      const next = new Set(prev);
      next.add(turns[index]!.key);
      return next;
    });
  }, [activeEventId, turns, expanded]);

  useEffect(() => {
    if (!activeEventId) return;
    const row = scrollRef.current?.querySelector(
      `[data-event-id="${activeEventId}"]`,
    );
    if (row instanceof HTMLElement) row.scrollIntoView?.({ block: "center" });
  }, [activeEventId, expanded]);

  function onScroll() {
    const el = scrollRef.current;
    if (!el) return;
    if (suppressScroll.current) return;
    const near = isNearBottom({
      scrollTop: el.scrollTop,
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
    });
    setMode((current) =>
      nextFollowMode(current, near ? "near-bottom" : "scrolled-up"),
    );
  }

  function jumpToLatest() {
    const el = scrollRef.current;
    resumeScrollTracking();
    if (el) el.scrollTop = el.scrollHeight;
    setMode((current) => nextFollowMode(current, "jump-to-latest"));
  }

  function jumpToTurn(index: number) {
    const el = scrollRef.current;
    if (!el) return;
    const row = el.querySelector<HTMLElement>(`[data-user-turn="${index}"]`);
    if (!row) return;
    const top =
      row.getBoundingClientRect().top -
      el.getBoundingClientRect().top +
      el.scrollTop;
    resumeScrollTracking();
    el.scrollTop = jumpTop(top);
    setMode("free");
  }

  return (
    <div className="transcript-wrap">
      <div
        ref={scrollRef}
        className={`transcript${events.length === 0 ? " empty" : ""}`}
        role="log"
        aria-live="polite"
        aria-relevant="additions"
        data-streaming={streaming ? "" : undefined}
        onScroll={onScroll}
      >
        {turns.map((turn, turnIndex) => {
          const foldable = turnIndex < turns.length - DEFAULT_OPEN_TURNS;
          const open = isTurnOpen(turns, turnIndex, expanded, DEFAULT_OPEN_TURNS);
          const base = rowOffsets[turnIndex] ?? 0;
          const userTurn = turn.userEventId
            ? turnIndexByEventId.get(turn.userEventId)
            : undefined;
          return (
            <Fragment key={turn.key}>
              {foldable ? (
                <button
                  type="button"
                  className="turn-fold"
                  aria-expanded={open}
                  data-user-turn={open ? undefined : userTurn}
                  onClick={() =>
                    setExpanded((prev) => {
                      const next = new Set(prev);
                      if (next.has(turn.key)) next.delete(turn.key);
                      else next.add(turn.key);
                      return next;
                    })
                  }
                >
                  <span className="turn-fold-chevron">
                    <IconChevron />
                  </span>
                  <span className="turn-fold-summary">{turnSummary(turn)}</span>
                  {turn.prompt ? (
                    <span className="turn-fold-prompt">{foldPrompt(turn.prompt)}</span>
                  ) : null}
                </button>
              ) : null}
              {open
                ? turn.rows.map(
                    ({ event, time, day, showSeparator, group, groupKind }, rowIndex) => (
                      <Fragment key={event.id}>
                        {showSeparator ? (
                          <div className="day-separator">{day}</div>
                        ) : null}
                        <MessageRow
                          event={event}
                          time={time}
                          isActive={event.id === activeEventId}
                          userTurn={turnIndexByEventId.get(event.id)}
                          group={group}
                          groupKind={groupKind}
                          streamingRow={
                            streamingSinceRef.current !== null &&
                            base + rowIndex >= streamingSinceRef.current
                          }
                          onEditUser={onEditUser}
                          onRewind={onRewind}
                          onFork={onFork}
                          reviewedDiffIds={reviewedDiffIds}
                          diffComments={diffComments}
                          diffView={diffView}
                          onSetDiffView={onSetDiffView}
                          onToggleReviewed={onToggleReviewed}
                          onOpenDiff={onOpenDiff}
                          onAddDiffComment={onAddDiffComment}
                          onDeleteDiffComment={onDeleteDiffComment}
                          onSendDiffReview={onSendDiffReview}
                        />
                      </Fragment>
                    ),
                  )
                : null}
            </Fragment>
          );
        })}
        {footer}
      </div>
      {mode === "free" && events.length > 0 ? (
        <button
          type="button"
          className="jump-latest"
          aria-label="Jump to latest"
          onClick={jumpToLatest}
        >
          <IconArrowDown />
          <span>Latest</span>
        </button>
      ) : null}
      <MinimapRail turns={railTurns} scrollRef={scrollRef} onJump={jumpToTurn} />
    </div>
  );
}
