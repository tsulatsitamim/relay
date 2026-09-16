import { useEffect, useRef, useState, type MouseEvent } from "react";
import { diffStat, unifiedDiff } from "../shared/diff.ts";

const OPEN_ERROR_MS = 2000;

type Props = {
  path: string;
  oldText: string | null;
  newText: string;
  reviewed?: boolean;
  onToggleReviewed?: () => void;
  onOpen?: () => void | Promise<unknown>;
};

export function DiffBlock({
  path,
  oldText,
  newText,
  reviewed,
  onToggleReviewed,
  onOpen,
}: Props) {
  const diff = unifiedDiff(oldText, newText, path);
  const { adds, dels } = diffStat(oldText, newText);
  const [openError, setOpenError] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  function showOpenError() {
    setOpenError(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setOpenError(false), OPEN_ERROR_MS);
  }

  function openInEditor(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    let result: void | Promise<unknown>;
    try {
      result = onOpen?.();
    } catch {
      showOpenError();
      return;
    }
    Promise.resolve(result).then(
      (ok) => {
        if (ok === false) showOpenError();
      },
      () => showOpenError(),
    );
  }

  return (
    <details className="diff">
      <summary className="diff-head">
        <span className="diff-path">{path}</span>
        <span className="diff-stat">
          <span className="diff-add">+{adds}</span>
          <span className="diff-del">-{dels}</span>
        </span>
        {onToggleReviewed ? (
          <button
            type="button"
            className={`diff-reviewed${reviewed ? " on" : ""}`}
            aria-pressed={Boolean(reviewed)}
            aria-label="Reviewed"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onToggleReviewed();
            }}
          >
            Reviewed
          </button>
        ) : null}
        {onOpen ? (
          <button
            type="button"
            className="diff-action"
            aria-label="Open in editor"
            onClick={openInEditor}
          >
            Open
          </button>
        ) : null}
        {openError ? (
          <span className="diff-open-error">Could not open file</span>
        ) : null}
        <button
          type="button"
          className="diff-action"
          aria-label="Copy diff"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            void navigator.clipboard?.writeText(diff);
          }}
        >
          Copy
        </button>
      </summary>
      <pre className="diff-body">
        {diff.split("\n").map((line, i) => {
          const cls =
            line.startsWith("+") && !line.startsWith("+++")
              ? "diff-line diff-add-line"
              : line.startsWith("-") && !line.startsWith("---")
                ? "diff-line diff-del-line"
                : line.startsWith("@@")
                  ? "diff-line diff-hunk"
                  : "diff-line";
          return (
            <div key={i} className={cls}>
              {line}
            </div>
          );
        })}
      </pre>
    </details>
  );
}
