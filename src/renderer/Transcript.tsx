import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { PlanEntry, TranscriptEvent } from "../shared/types.ts";
import { DiffBlock } from "./DiffBlock";
import { formatUsage } from "./format";
import { Markdown } from "./Markdown";
import { PlanBlock } from "./PlanBlock";
import { ThinkingBlock } from "./ThinkingBlock";
import { ToolCallCard, type ToolCallData } from "./ToolCallCard";
import { IconArrowDown } from "./icons";
import { isNearBottom, nextFollowMode, type FollowMode } from "./scroll";
import { buildRows } from "./transcript-rows";
import { useVisibleAnimation } from "./visible-animation";

type Props = {
  events: TranscriptEvent[];
  onEditUser?: (text: string, eventId: string) => void;
  onRegenerate?: (agentEventId: string) => void;
  reviewedDiffIds?: Set<string>;
  onToggleReviewed?: (eventId: string) => void;
  onOpenDiff?: (path: string) => void | Promise<unknown>;
  footer?: ReactNode;
  activeEventId?: string | null;
  streaming?: boolean;
};

function EventRow({
  event,
  time,
  onEditUser,
  onRegenerate,
  reviewedDiffIds,
  onToggleReviewed,
  onOpenDiff,
  isLast,
}: {
  event: TranscriptEvent;
  time: string | null;
  onEditUser?: (text: string, eventId: string) => void;
  onRegenerate?: (agentEventId: string) => void;
  reviewedDiffIds?: Set<string>;
  onToggleReviewed?: (eventId: string) => void;
  onOpenDiff?: (path: string) => void | Promise<unknown>;
  isLast?: boolean;
}) {
  if (event.kind === "commands") return null;

  if (event.kind === "user") {
    const attachments = event.payload.attachments as
      | { name: string; thumb?: string }[]
      | undefined;
    return (
      <div className="msg user">
        {time != null ? (
          <span className="msg-time">{time}</span>
        ) : null}
        {onEditUser ? (
          <div className="msg-actions">
            <button
              type="button"
              className="msg-action"
              aria-label="Edit message"
              onClick={() => onEditUser(String(event.payload.text ?? ""), event.id)}
            >
              Edit
            </button>
          </div>
        ) : null}
        {String(event.payload.text ?? "")}
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
      </div>
    );
  }

  if (event.kind === "agent_message") {
    return (
      <div className="msg agent">
        {time != null ? (
          <span className="msg-time">{time}</span>
        ) : null}
        <div className="msg-actions">
          <button
            type="button"
            className="msg-action"
            aria-label="Copy message"
            onClick={() =>
              void navigator.clipboard?.writeText(String(event.payload.text ?? ""))
            }
          >
            Copy
          </button>
          {isLast && onRegenerate ? (
            <button
              type="button"
              className="msg-action"
              aria-label="Regenerate answer"
              onClick={() => onRegenerate(event.id)}
            >
              Regenerate
            </button>
          ) : null}
        </div>
        <Markdown text={String(event.payload.text ?? "")} />
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
        onToggleReviewed={
          onToggleReviewed ? () => onToggleReviewed(event.id) : undefined
        }
        onOpen={onOpenDiff ? () => onOpenDiff(path) : undefined}
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
  isLast,
  streamingRow,
  onEditUser,
  onRegenerate,
  reviewedDiffIds,
  onToggleReviewed,
  onOpenDiff,
}: {
  event: TranscriptEvent;
  time: string | null;
  isActive: boolean;
  isLast: boolean;
  streamingRow?: boolean;
  onEditUser?: (text: string, eventId: string) => void;
  onRegenerate?: (agentEventId: string) => void;
  reviewedDiffIds?: Set<string>;
  onToggleReviewed?: (eventId: string) => void;
  onOpenDiff?: (path: string) => void | Promise<unknown>;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useVisibleAnimation(ref);
  return (
    <div
      ref={ref}
      className={`msg-row${isActive ? " find-active" : ""}`}
      data-event-id={event.id}
      data-streaming-row={streamingRow ? "" : undefined}
    >
      <EventRow
        event={event}
        time={time}
        onEditUser={onEditUser}
        onRegenerate={onRegenerate}
        reviewedDiffIds={reviewedDiffIds}
        onToggleReviewed={onToggleReviewed}
        onOpenDiff={onOpenDiff}
        isLast={isLast}
      />
    </div>
  );
}

export function Transcript({
  events,
  onEditUser,
  onRegenerate,
  reviewedDiffIds,
  onToggleReviewed,
  onOpenDiff,
  footer,
  activeEventId,
  streaming = false,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<FollowMode>("following");
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
  const lastAgentId = events.reduce<string | null>(
    (last, event) => (event.kind === "agent_message" ? event.id : last),
    null,
  );

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

  useEffect(() => {
    if (!activeEventId) return;
    const row = scrollRef.current?.querySelector(
      `[data-event-id="${activeEventId}"]`,
    );
    if (row instanceof HTMLElement) row.scrollIntoView?.({ block: "center" });
  }, [activeEventId]);

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
        {rows.map(({ event, time, day, showSeparator }, index) => {
          return (
            <Fragment key={event.id}>
              {showSeparator ? (
                <div className="day-separator">{day}</div>
              ) : null}
              <MessageRow
                event={event}
                time={time}
                isActive={event.id === activeEventId}
                isLast={event.id === lastAgentId}
                streamingRow={
                  streamingSinceRef.current !== null &&
                  index >= streamingSinceRef.current
                }
                onEditUser={onEditUser}
                onRegenerate={onRegenerate}
                reviewedDiffIds={reviewedDiffIds}
                onToggleReviewed={onToggleReviewed}
                onOpenDiff={onOpenDiff}
              />
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
    </div>
  );
}
