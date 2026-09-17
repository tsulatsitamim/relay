import type { ReactNode } from "react";
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
      {open ? <div className="badge-body">{children}</div> : null}
    </>
  );
}