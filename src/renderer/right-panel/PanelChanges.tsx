import { useEffect, useState } from "react";
import { changeLabel, type GitChangesResult, type GitFileDiff } from "../../shared/git.ts";
import { DiffBlock } from "../DiffBlock";
import { IconExternalLink, IconRefresh } from "../icons";

type Props = {
  cwd: string;
  changes: GitChangesResult | null;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
  onOpenInEditor: (path: string) => void;
};

export function PanelChanges({
  cwd,
  changes,
  loading,
  error,
  onRefresh,
  onOpenInEditor,
}: Props) {
  const [selected, setSelected] = useState<string | null>(null);
  const [diff, setDiff] = useState<GitFileDiff | null>(null);
  const [diffError, setDiffError] = useState<string | null>(null);

  useEffect(() => {
    if (!cwd || !selected) {
      setDiff(null);
      setDiffError(null);
      return;
    }
    let cancelled = false;
    setDiff(null);
    setDiffError(null);
    void window.relay
      .gitFileDiff(cwd, selected)
      .then((result) => {
        if (!cancelled) setDiff(result);
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setDiffError(cause instanceof Error ? cause.message : String(cause));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [cwd, selected]);

  if (error) {
    return (
      <div className="panel-changes">
        <p className="panel-note">{error}</p>
        <button type="button" className="panel-action" onClick={onRefresh}>
          Retry
        </button>
      </div>
    );
  }

  if (!changes) {
    return (
      <div className="panel-changes">
        <p className="panel-note">
          {loading ? "Checking for changes…" : "No repository in this folder"}
        </p>
        {loading ? null : (
          <button type="button" className="panel-action" onClick={onRefresh}>
            Retry
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="panel-changes">
      <div className="panel-row panel-changes-head">
        <span className="panel-branch">{changes.branch || "detached"}</span>
        <span className="panel-count">{changes.files.length} changed</span>
        <button
          type="button"
          className="icon-btn"
          aria-label="Refresh changes"
          onClick={onRefresh}
        >
          <IconRefresh />
        </button>
      </div>
      {changes.files.length === 0 ? (
        <p className="panel-note">No changes in the working tree</p>
      ) : (
        <div className="panel-changes-list">
          {changes.files.map((file) => (
            <div key={file.path} className="panel-file-row-wrap">
              <button
                type="button"
                className={
                  selected === file.path ? "panel-file-row active" : "panel-file-row"
                }
                onClick={() => setSelected(file.path)}
              >
                <span className="panel-file-path">{file.path}</span>
                <span className={`panel-status panel-status-${file.status}`}>
                  {changeLabel(file.status)}
                </span>
                {file.insertions == null ? null : (
                  <span className="panel-stat add">+{file.insertions}</span>
                )}
                {file.deletions == null ? null : (
                  <span className="panel-stat del">-{file.deletions}</span>
                )}
                <span
                  className="panel-file-open"
                  role="button"
                  tabIndex={0}
                  aria-label={`Open ${file.path} in editor`}
                  onClick={(event) => {
                    event.stopPropagation();
                    onOpenInEditor(file.path);
                  }}
                >
                  <IconExternalLink />
                </span>
              </button>
            </div>
          ))}
        </div>
      )}
      {selected ? (
        <div className="panel-diff">
          {diffError ? <p className="panel-note">{diffError}</p> : null}
          {diff ? (
            <DiffView diff={diff} onOpenInEditor={onOpenInEditor} />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function DiffView({
  diff,
  onOpenInEditor,
}: {
  diff: GitFileDiff;
  onOpenInEditor: (path: string) => void;
}) {
  if (diff.binary) return <p className="panel-note">Binary file</p>;
  if (diff.truncated && !diff.oldText && !diff.newText) {
    return (
      <div className="panel-note">
        <p>File is too large to diff</p>
        <button
          type="button"
          className="panel-action"
          onClick={() => onOpenInEditor(diff.path)}
        >
          Open in editor
        </button>
      </div>
    );
  }
  return (
    <>
      {diff.truncated ? <p className="panel-note">Diff truncated</p> : null}
      <DiffBlock path={diff.path} oldText={diff.oldText} newText={diff.newText} />
    </>
  );
}
