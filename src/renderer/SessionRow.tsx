import { memo, useEffect, useRef, useState, type MouseEvent } from "react";
import type { Session } from "../shared/types.ts";
import { timeAgo } from "../shared/time.ts";
import { IconArchive, IconPin, IconRedo } from "./icons";

type Props = {
  session: Session;
  active: boolean;
  renaming: boolean;
  permission?: boolean;
  unread?: boolean;
  onSelect: (id: string) => void;
  onContextMenu: (session: Session, event: MouseEvent) => void;
  onRename: (id: string, title: string) => void;
  onCancelRename: () => void;
};

export const SessionRow = memo(function SessionRow({
  session,
  active,
  renaming,
  permission,
  unread,
  onSelect,
  onContextMenu,
  onRename,
  onCancelRename,
}: Props) {
  const [value, setValue] = useState(session.title);
  const inputRef = useRef<HTMLInputElement>(null);
  const skipBlur = useRef(false);

  useEffect(() => {
    if (!renaming) return;
    setValue(session.title);
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [renaming, session.title]);

  function commit() {
    if (skipBlur.current) {
      skipBlur.current = false;
      return;
    }
    const trimmed = value.trim();
    if (trimmed && trimmed !== session.title) onRename(session.id, trimmed);
    else onCancelRename();
  }

  return (
    <div
      className={`row-item ${active ? "active" : ""} ${session.archived ? "muted" : ""} ${unread ? "unread" : ""}`}
      role="button"
      tabIndex={0}
      data-has-actions="true"
      data-active={active || undefined}
      onClick={() => {
        if (!renaming) onSelect(session.id);
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        onContextMenu(session, e);
      }}
      onKeyDown={(e) => {
        if (renaming) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(session.id);
        }
      }}
    >
      <span className="cell-icon">
        {session.archived ? (
          <IconArchive className="status-icon" />
        ) : (
          <span
            className={`dot ${session.status} ${permission ? "permission" : ""}`}
            title={permission ? "Permission required" : undefined}
          />
        )}
      </span>
      {renaming ? (
        <input
          ref={inputRef}
          className="rename-input"
          value={value}
          aria-label="Rename chat"
          onChange={(e) => setValue(e.target.value)}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter") {
              e.preventDefault();
              commit();
            } else if (e.key === "Escape") {
              e.preventDefault();
              skipBlur.current = true;
              onCancelRename();
            }
          }}
          onBlur={commit}
        />
      ) : (
        <span className="cell-content">{session.title}</span>
      )}
      <span className="row-end">
        <span className="row-actions">
          <button
            className={`row-action ${session.pinned ? "on" : ""}`}
            title={session.pinned ? "Unpin" : "Pin"}
            aria-label={session.pinned ? "Unpin" : "Pin"}
            onClick={(e) => {
              e.stopPropagation();
              void window.relay.setPinned(session.id, !session.pinned);
            }}
          >
            <IconPin />
          </button>
          <button
            className={`row-action ${session.archived ? "on" : ""}`}
            title={session.archived ? "Unarchive" : "Archive"}
            aria-label={session.archived ? "Unarchive" : "Archive"}
            onClick={(e) => {
              e.stopPropagation();
              void window.relay.setArchived(session.id, !session.archived);
            }}
          >
            {session.archived ? <IconRedo /> : <IconArchive />}
          </button>
        </span>
        {unread && !renaming ? (
          <span className="unread-badge" title="Unread" aria-label="Unread" />
        ) : null}
        <span className="when">{timeAgo(session.updatedAt)}</span>
      </span>
    </div>
  );
});
