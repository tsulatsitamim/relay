import { useState } from "react";
import { IconChevronRight, IconThinking } from "./icons";

export function ThinkingBlock({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <section className={`thinking${open ? " open" : ""}`}>
      <button
        type="button"
        className="thinking-head"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="thinking-icon" aria-hidden>
          <IconThinking />
        </span>
        <span className="thinking-label">Thinking</span>
        <span className={`thinking-chevron${open ? " open" : ""}`} aria-hidden>
          <IconChevronRight />
        </span>
      </button>
      {open ? <div className="thinking-body">{text}</div> : null}
    </section>
  );
}
