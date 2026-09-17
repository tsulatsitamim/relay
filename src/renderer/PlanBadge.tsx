import { useState } from "react";
import type { PlanEntry } from "../shared/types.ts";

function statusClass(status: string | undefined): string {
  if (status === "completed") return "completed";
  if (status === "in_progress") return "in-progress";
  return "pending";
}

function statusLabel(status: string | undefined): string {
  if (status === "completed") return "completed";
  if (status === "in_progress") return "in progress";
  return "pending";
}

export function PlanBadge({ entries = [] }: { entries?: PlanEntry[] }) {
  const [pinned, setPinned] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);

  if (entries.length === 0) return null;

  const completed = entries.filter((entry) => entry.status === "completed").length;
  const open = pinned || hovered || focused;

  return (
    <div className="plan-badge">
      <button
        type="button"
        className="plan-badge-btn"
        aria-expanded={open}
        aria-label={`${completed}/${entries.length} tasks`}
        onClick={() => setPinned((value) => !value)}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      >
        <span className="plan-badge-count">
          {completed}/{entries.length} tasks
        </span>
        <span className="plan-badge-bar" aria-hidden>
          {entries.map((entry, index) => (
            <span
              key={`${entry.content}-${index}`}
              className={`plan-seg plan-seg-${statusClass(entry.status)}`}
            />
          ))}
        </span>
      </button>
      {open ? (
        <div className="plan-popover" role="list">
          {entries.map((entry, index) => (
            <div
              className="plan-popover-item"
              role="listitem"
              key={`${entry.content}-${index}`}
            >
              <span
                className={`plan-popover-dot plan-seg-${statusClass(entry.status)}`}
                aria-hidden
              />
              <span className="plan-popover-text">{entry.content}</span>
              <span className="plan-popover-status">{statusLabel(entry.status)}</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
