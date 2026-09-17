import { useEffect, useRef, useState } from "react";
import type { TranscriptEvent } from "../shared/types.ts";
import { IconCheck, IconChevronRight, IconSpinner, IconWarning } from "./icons";
import { ToolCallCard, type ToolCallData } from "./ToolCallCard";
import { toolGroupMeta, toolGroupSummary } from "./tool-group";

export function ToolGroup({ events }: { events: TranscriptEvent[] }) {
  const meta = toolGroupMeta(
    events.map((event) => (event.payload as ToolCallData).status),
  );
  const running = meta.tone === "running";
  const [open, setOpen] = useState(running);
  const userToggled = useRef(false);
  const previousRunning = useRef(running);

  useEffect(() => {
    if (previousRunning.current === running) return;
    previousRunning.current = running;
    if (running) {
      setOpen(true);
      return;
    }
    if (!userToggled.current) setOpen(false);
  }, [running]);

  function toggle() {
    userToggled.current = true;
    setOpen((value) => !value);
  }

  const summary = toolGroupSummary(events);

  return (
    <section className={`toolgroup toolgroup-${meta.tone}`}>
      <button
        type="button"
        className="toolgroup-head"
        aria-expanded={open}
        onClick={toggle}
      >
        <span className="tool-status" aria-hidden>
          {meta.tone === "running" ? (
            <IconSpinner />
          ) : meta.tone === "done" ? (
            <IconCheck />
          ) : meta.tone === "error" ? (
            <IconWarning />
          ) : (
            <span className="tool-dot" />
          )}
        </span>
        <span className="toolgroup-title">{events.length} tool calls</span>
        {summary ? <span className="toolgroup-hint">{summary}</span> : null}
        <span className="tool-state">{meta.label}</span>
        <span className={`tool-chevron${open ? " open" : ""}`} aria-hidden>
          <IconChevronRight />
        </span>
      </button>
      {open ? (
        <div className="toolgroup-body">
          {events.map((event) => (
            <ToolCallCard key={event.id} toolCall={event.payload as ToolCallData} />
          ))}
        </div>
      ) : null}
    </section>
  );
}
