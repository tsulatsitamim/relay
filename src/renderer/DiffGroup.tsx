import { useState } from "react";
import { diffStat } from "../shared/diff.ts";
import type { TranscriptEvent } from "../shared/types.ts";
import { DiffBlock } from "./DiffBlock";
import { IconChevronRight } from "./icons";

type Props = {
  events: TranscriptEvent[];
  reviewedDiffIds?: Set<string>;
  onToggleReviewed?: (eventId: string) => void;
  onOpenDiff?: (path: string) => void | Promise<unknown>;
};

export function DiffGroup({
  events,
  reviewedDiffIds,
  onToggleReviewed,
  onOpenDiff,
}: Props) {
  const [open, setOpen] = useState(false);
  const files = events.map((event) => {
    const path = String(event.payload.path ?? "file");
    const oldText = (event.payload.oldText as string | null) ?? null;
    const newText = String(event.payload.newText ?? "");
    return { event, path, oldText, newText, ...diffStat(oldText, newText) };
  });
  const adds = files.reduce((sum, file) => sum + file.adds, 0);
  const dels = files.reduce((sum, file) => sum + file.dels, 0);
  const count = files.length;

  return (
    <section className="diffgroup">
      <button
        type="button"
        className="diffgroup-head"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="diffgroup-title">
          {count} changed {count === 1 ? "file" : "files"}
        </span>
        <span className="diffgroup-total">
          <span className="diff-add">+{adds}</span>
          <span className="diff-del">-{dels}</span>
        </span>
        <span className={`diffgroup-chevron${open ? " open" : ""}`} aria-hidden>
          <IconChevronRight />
        </span>
      </button>
      <ul className="diffgroup-list">
        {files.map(({ event, path, adds: fileAdds, dels: fileDels }) => (
          <li className="diffgroup-file" key={event.id}>
            <span className="diff-path">{path}</span>
            <span className="diff-stat">
              <span className="diff-add">+{fileAdds}</span>
              <span className="diff-del">-{fileDels}</span>
            </span>
          </li>
        ))}
      </ul>
      {open ? (
        <div className="diffgroup-body">
          {files.map(({ event, path, oldText, newText }) => (
            <DiffBlock
              key={event.id}
              path={path}
              oldText={oldText}
              newText={newText}
              reviewed={reviewedDiffIds?.has(event.id)}
              onToggleReviewed={
                onToggleReviewed ? () => onToggleReviewed(event.id) : undefined
              }
              onOpen={onOpenDiff ? () => onOpenDiff(path) : undefined}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}
