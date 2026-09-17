import { useState } from "react";
import type { PlanEntry } from "../shared/types.ts";
import { AnimatedHeight } from "./AnimatedHeight";
import { IconCheck, IconPlan, IconSpinner } from "./icons";

const COLLAPSE_MAX_ENTRIES = 8;
const COLLAPSE_MAX_CHARS = 900;

function statusLabel(status: string | undefined): "completed" | "in progress" | "pending" {
  if (status === "completed") return "completed";
  if (status === "in_progress") return "in progress";
  return "pending";
}

function statusClass(status: string | undefined): "completed" | "in-progress" | "pending" {
  if (status === "completed") return "completed";
  if (status === "in_progress") return "in-progress";
  return "pending";
}

export function PlanBlock({ entries }: { entries: PlanEntry[] }) {
  const [expanded, setExpanded] = useState(false);
  if (entries.length === 0) return null;
  const completed = entries.filter((entry) => entry.status === "completed").length;
  const chars = entries.reduce((sum, entry) => sum + entry.content.length, 0);
  const collapsible =
    entries.length > COLLAPSE_MAX_ENTRIES || chars > COLLAPSE_MAX_CHARS;
  const collapsed = collapsible && !expanded;

  return (
    <section className="plan plan-card">
      <div className="plan-head">
        <span className="plan-icon" aria-hidden>
          <IconPlan />
        </span>
        <span className="plan-label">Plan</span>
        <span className="plan-progress">
          <span className="plan-progress-text">
            {completed}/{entries.length}
          </span>
          <span className="plan-progress-bar" aria-hidden>
            {entries.map((entry, index) => (
              <span
                key={`${entry.content}-${index}`}
                className={`plan-seg plan-seg-${statusClass(entry.status)}`}
              />
            ))}
          </span>
        </span>
      </div>
      <AnimatedHeight open={!collapsed}>
        <ol className={`plan-list${collapsed ? " collapsed" : ""}`}>
          {entries.map((entry, index) => {
            const label = statusLabel(entry.status);
            return (
              <li className={`plan-item ${label.replace(" ", "-")}`} key={`${entry.content}-${index}`}>
                <span className="plan-status" role="img" aria-label={label}>
                  {label === "completed" ? (
                    <IconCheck />
                  ) : label === "in progress" ? (
                    <IconSpinner />
                  ) : (
                    <span className="plan-dot" />
                  )}
                </span>
                <span className="plan-text">{entry.content}</span>
              </li>
            );
          })}
        </ol>
      </AnimatedHeight>
      {collapsible ? (
        <button
          type="button"
          className="plan-expand"
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? "Show less" : "Show all"}
        </button>
      ) : null}
    </section>
  );
}