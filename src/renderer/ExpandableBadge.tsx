import type { ReactNode } from "react";
import { AnimatedHeight } from "./AnimatedHeight";
import { IconChevronRight } from "./icons";

export function ExpandableBadge({
  icon,
  label,
  meta,
  open,
  onToggle,
  children,
  className,
}: {
  icon: ReactNode;
  label: ReactNode;
  meta?: ReactNode;
  open: boolean;
  onToggle: () => void;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <>
      <button
        type="button"
        className={`badge-head${className ? ` ${className}` : ""}`}
        aria-expanded={open}
        onClick={onToggle}
      >
        {icon}
        {label}
        {meta}
        <span className={`badge-chevron${open ? " open" : ""}`} aria-hidden>
          <IconChevronRight />
        </span>
      </button>
      <AnimatedHeight open={open}>
        {open ? <div className="badge-body">{children}</div> : null}
      </AnimatedHeight>
    </>
  );
}