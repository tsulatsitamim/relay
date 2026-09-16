import { diffStat, unifiedDiff } from "../shared/diff.ts";

type Props = {
  path: string;
  oldText: string | null;
  newText: string;
  reviewed?: boolean;
  onToggleReviewed?: () => void;
  onOpen?: () => void;
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
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onOpen();
            }}
          >
            Open
          </button>
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
