import { Fragment, useEffect, useRef, useState } from "react";
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
import { formatDay, formatTime } from "./time";

type Props = {
  events: TranscriptEvent[];
  onEditUser?: (text: string) => void;
  footer?: ReactNode;
};

function EventRow({
  event,
  onEditUser,
}: {
  event: TranscriptEvent;
  onEditUser?: (text: string) => void;
}) {
  if (event.kind === "commands") return null;

  if (event.kind === "user") {
    const attachments = event.payload.attachments as
      | { name: string; thumb?: string }[]
      | undefined;
    return (
      <div className="msg user">
        {event.createdAt != null ? (
          <span className="msg-time">{formatTime(event.createdAt)}</span>
        ) : null}
        {onEditUser ? (
          <div className="msg-actions">
            <button
              type="button"
              className="msg-action"
              aria-label="Edit message"
              onClick={() => onEditUser(String(event.payload.text ?? ""))}
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
        {event.createdAt != null ? (
          <span className="msg-time">{formatTime(event.createdAt)}</span>
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
    return (
      <DiffBlock
        path={String(event.payload.path ?? "file")}
        oldText={(event.payload.oldText as string | null) ?? null}
        newText={String(event.payload.newText ?? "")}
      />
    );
  }

  if (event.kind === "error") {
    return <div className="msg error">{String(event.payload.text ?? "Error")}</div>;
  }

  return <div className="msg status">{String(event.payload.text ?? "")}</div>;
}

export function Transcript({ events, onEditUser, footer }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [stick, setStick] = useState(true);

  useEffect(() => {
    if (!stick) return;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [events, stick]);

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
        {events.map((event, index) => {
          const day = event.createdAt != null ? formatDay(event.createdAt) : null;
          const previous = index > 0 ? events[index - 1] : undefined;
          const previousDay =
            previous?.createdAt != null ? formatDay(previous.createdAt) : null;
          return (
            <Fragment key={event.id}>
              {day != null && day !== previousDay ? (
                <div className="day-separator">{day}</div>
              ) : null}
              <div className="msg-row">
                <EventRow event={event} onEditUser={onEditUser} />
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
