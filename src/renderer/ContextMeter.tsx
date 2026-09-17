import { useState } from "react";
import { formatUsage } from "./format";

export type UsageInfo = {
  used?: number;
  size?: number;
  costAmount?: number;
  costCurrency?: string;
};

const RADIUS = 9;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function ContextMeter({ usage }: { usage?: UsageInfo }) {
  const [pinned, setPinned] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);

  const used = usage?.used;
  const size = usage?.size;
  if (typeof used !== "number" || typeof size !== "number" || size <= 0) {
    return null;
  }

  const percent = Math.round((used / size) * 100);
  const filled = Math.max(0, Math.min(100, percent));
  const danger = percent > 90;
  const dash = (filled / 100) * CIRCUMFERENCE;
  const open = pinned || hovered || focused;

  return (
    <div className={`context-meter${danger ? " danger" : ""}`}>
      <button
        type="button"
        className="context-meter-btn"
        aria-label={`Context ${percent}% used`}
        aria-expanded={open}
        onClick={() => setPinned((value) => !value)}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      >
        <svg className="context-ring" viewBox="0 0 24 24" width="22" height="22" aria-hidden>
          <circle className="context-ring-track" cx="12" cy="12" r={RADIUS} />
          <circle
            className="context-ring-fill"
            cx="12"
            cy="12"
            r={RADIUS}
            strokeDasharray={`${dash} ${CIRCUMFERENCE}`}
            transform="rotate(-90 12 12)"
          />
        </svg>
        <span className="context-pct">{percent}%</span>
      </button>
      {open ? (
        <div className="context-popover" role="tooltip">
          <span className="context-popover-line">
            {formatUsage({
              used,
              size,
              costAmount: usage?.costAmount,
              costCurrency: usage?.costCurrency,
            })}
          </span>
          <span className="context-popover-line">
            {percent}% of context window used
          </span>
        </div>
      ) : null}
    </div>
  );
}
