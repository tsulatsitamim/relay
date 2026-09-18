import { useEffect, useRef, useState } from "react";
import {
  IconCheck,
  IconChevronRight,
  IconSpinner,
  IconToolEdit,
  IconToolExecute,
  IconToolGeneric,
  IconToolRead,
  IconToolSearch,
  IconToolWeb,
  IconWarning,
} from "./icons";
import { prettyValue, toolIcon, toolStatusMeta } from "./toolFormat";
import { AnimatedHeight } from "./AnimatedHeight";

export type ToolCallData = {
  toolCallId?: string;
  title?: string;
  kind?: string;
  status?: string;
  locations?: Array<{ path: string; line?: number }>;
  rawInput?: unknown;
  rawOutput?: unknown;
};

export function ToolKindIcon({ kind, title }: { kind: unknown; title?: string }) {
  const mapped = toolIcon(kind, title);
  return (
    <span className="tool-icon" aria-hidden>
      {mapped === "read" ? (
        <IconToolRead />
      ) : mapped === "edit" ? (
        <IconToolEdit />
      ) : mapped === "execute" ? (
        <IconToolExecute />
      ) : mapped === "search" ? (
        <IconToolSearch />
      ) : mapped === "web" ? (
        <IconToolWeb />
      ) : (
        <IconToolGeneric />
      )}
    </span>
  );
}

export function ToolCallCard({ toolCall }: { toolCall: ToolCallData }) {
  const { tone, label } = toolStatusMeta(toolCall.status);
  const [open, setOpen] = useState(tone === "running" || tone === "error");
  const userToggled = useRef(false);
  const previousTone = useRef(tone);

  useEffect(() => {
    if (previousTone.current === tone) return;
    previousTone.current = tone;
    if (tone === "running") {
      setOpen(true);
      return;
    }
    if (!userToggled.current) setOpen(false);
  }, [tone]);

  function toggle() {
    userToggled.current = true;
    setOpen((value) => !value);
  }

  const input = prettyValue(toolCall.rawInput);
  const output = prettyValue(toolCall.rawOutput);

  return (
    <section className={`tool tool-${tone}`}>
      <button
        type="button"
        className="tool-head"
        aria-expanded={open}
        onClick={toggle}
      >
        <span className="tool-status" aria-hidden>
          {tone === "running" ? (
            <IconSpinner />
          ) : tone === "done" ? (
            <IconCheck />
          ) : tone === "error" ? (
            <IconWarning />
          ) : (
            <span className="tool-dot" />
          )}
        </span>
        <ToolKindIcon kind={toolCall.kind} title={toolCall.title} />
        <span className={`tool-title${tone === "running" ? " shimmer" : ""}`}>
          {toolCall.title ?? "Tool"}
        </span>
        {toolCall.kind ? <span className="tool-kind">{toolCall.kind}</span> : null}
        {(toolCall.locations ?? []).map((location, index) => (
          <span className="tool-loc" key={`${location.path}-${index}`}>
            {location.path}
            {location.line ? `:${location.line}` : ""}
          </span>
        ))}
        <span className="tool-state">{label}</span>
        <span className={`tool-chevron${open ? " open" : ""}`} aria-hidden>
          <IconChevronRight />
        </span>
      </button>
      <AnimatedHeight open={open}>
        <div className="tool-body" aria-hidden={open ? undefined : true}>
          {input ? (
            <div className="tool-section">
              <span className="tool-section-label">Input</span>
              <pre className="tool-pre">{input}</pre>
            </div>
          ) : null}
          {output ? (
            <div className="tool-section">
              <span className="tool-section-label">Output</span>
              <pre className="tool-pre">{output}</pre>
            </div>
          ) : null}
          {!input && !output ? (
            <div className="tool-section tool-empty">No details</div>
          ) : null}
        </div>
      </AnimatedHeight>
    </section>
  );
}
