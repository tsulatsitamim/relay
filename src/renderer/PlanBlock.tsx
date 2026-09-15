import type { PlanEntry } from "../shared/types.ts";
import { IconCheck, IconPlan, IconSpinner } from "./icons";

function statusLabel(status: string | undefined): "completed" | "in progress" | "pending" {
  if (status === "completed") return "completed";
  if (status === "in_progress") return "in progress";
  return "pending";
}

export function PlanBlock({ entries }: { entries: PlanEntry[] }) {
  if (entries.length === 0) return null;
  return (
    <section className="plan">
      <div className="plan-head">
        <span className="plan-icon" aria-hidden>
          <IconPlan />
        </span>
        <span className="plan-label">Plan</span>
      </div>
      <ol className="plan-list">
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
    </section>
  );
}
