import { useEffect, useRef, useState } from "react";
import type { PlanEntry, TranscriptEvent } from "../shared/types.ts";
import { DiffBlock } from "./DiffBlock";
import { Markdown } from "./Markdown";
import { PlanBlock } from "./PlanBlock";
import { ThinkingBlock } from "./ThinkingBlock";
import { ToolCallCard, type ToolCallData } from "./ToolCallCard";
import { IconArrowDown } from "./icons";
import { isNearBottom } from "./scroll";

type Props = {
  events: TranscriptEvent[];
};

function EventRow({ event }: { event: TranscriptEvent }) {
  if (event.kind === "commands") return null;

  if (event.kind === "user") {
    const attachments = event.payload.attachments as
      | { name: string }[]
      | undefined;
    return (
      <div className="msg user">
        {String(event.payload.text ?? "")}
        {attachments?.length ? (
          <div className="msg-attachments">
            {attachments.map((a, index) => (
              <span className="msg-attachment" key={`${index}-${a.name}`}>
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
        <Markdown text={String(event.payload.text ?? "")} />
      </div>
    );
  }

  if (event.kind === "thinking") {
    return <ThinkingBlock text={String(event.payload.text ?? "")} />;
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

export function Transcript({ events }: Props) {
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
        onScroll={onScroll}
      >
        {events.map((event) => (
          <EventRow key={event.id} event={event} />
        ))}
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
