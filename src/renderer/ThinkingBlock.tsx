import { useState } from "react";
import { ExpandableBadge } from "./ExpandableBadge";
import { IconThinking } from "./icons";

export function ThinkingBlock({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <section className={`thinking${open ? " open" : ""}`}>
      <ExpandableBadge
        className="thinking-head"
        icon={
          <span className="thinking-icon" aria-hidden>
            <IconThinking />
          </span>
        }
        label={<span className="thinking-label">Thinking</span>}
        open={open}
        onToggle={() => setOpen((value) => !value)}
      >
        {text}
      </ExpandableBadge>
    </section>
  );
}