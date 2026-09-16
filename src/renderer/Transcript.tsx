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
import { isNearBottom } from "./scroll";
import { buildRows } from "./transcript-rows";

type Props = {
  events: TranscriptEvent[];
  onEditUser?: (text: string, eventId: string) => void;
  onRegenerate?: (agentEventId: string) => void;
  reviewedDiffIds?: Set<string>;
  onToggleReviewed?: (eventId: string) => void;
  onOpenDiff?: (path: string) => void | Promise<unknown>;
  footer?: ReactNode;
  activeEventId?: string | null;
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

export function Transcript({
  events,
  onEditUser,
  onRegenerate,
  reviewedDiffIds,
  onToggleReviewed,
  onOpenDiff,
  footer,
  activeEventId,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [stick, setStick] = useState(true);
  const rows = useMemo(() => buildRows(events), [events]);
  const lastAgentId = events.reduce<string | null>(
    (last, event) => (event.kind === "agent_message" ? event.id : last),
    null,
  );

  useEffect(() => {
    if (!stick) return;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [events, stick]);

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
    setStick(
      isNearBottom({
        scrollTop: el.scrollTop,
        scrollHeight: el.scrollHeight,
        clientHeight: el.clientHeight,
      }),
    );
  }

  function jumpToLatest() {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
    setStick(true);
  }

  return (
    <div className="transcript-wrap">
      <div
        ref={scrollRef}
        className={`transcript${events.length === 0 ? " empty" : ""}`}
        role="log"
        aria-live="polite"
        aria-relevant="additions"
        onScroll={onScroll}
      >
        {rows.map(({ event, time, day, showSeparator }) => {
          return (
            <Fragment key={event.id}>
              {showSeparator ? (
                <div className="day-separator">{day}</div>
              ) : null}
              <div
                className={`msg-row${event.id === activeEventId ? " find-active" : ""}`}
                data-event-id={event.id}
              >
                <EventRow
                  event={event}
                  time={time}
                  onEditUser={onEditUser}
                  onRegenerate={onRegenerate}
                  reviewedDiffIds={reviewedDiffIds}
                  onToggleReviewed={onToggleReviewed}
                  onOpenDiff={onOpenDiff}
                  isLast={event.id === lastAgentId}
                />
              </div>
            </Fragment>
          );
        })}
        {footer}
      </div>
      {!stick && events.length > 0 ? (
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
