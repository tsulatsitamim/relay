import { useEffect, useState } from "react";
import { IconCheck, IconChevronRight, IconSpinner, IconWarning } from "./icons";
import { prettyValue, toolStatusMeta } from "./toolFormat";

export type ToolCallData = {
  toolCallId?: string;
  title?: string;
  kind?: string;
  status?: string;
  locations?: Array<{ path: string; line?: number }>;
  rawInput?: unknown;
  rawOutput?: unknown;
};

export function ToolCallCard({ toolCall }: { toolCall: ToolCallData }) {
  const { tone, label } = toolStatusMeta(toolCall.status);
  const [open, setOpen] = useState(tone === "running" || tone === "error");

  useEffect(() => {
    if (tone === "running") setOpen(true);
  }, [tone]);

  const input = prettyValue(toolCall.rawInput);
  const output = prettyValue(toolCall.rawOutput);

  return (
    <section className={`tool tool-${tone}`}>
      <button
        type="button"
        className="tool-head"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
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
        <span className="tool-title">{toolCall.title ?? "Tool"}</span>
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
      {open ? (
        <div className="tool-body">
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
      ) : null}
    </section>
  );
}
