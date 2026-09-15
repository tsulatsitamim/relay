import { diffStat, unifiedDiff } from "../shared/diff.ts";

type Props = {
  path: string;
  oldText: string | null;
  newText: string;
};

export function DiffBlock({ path, oldText, newText }: Props) {
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
