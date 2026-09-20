import { useEffect, useState } from "react";

type Props = {
  cwd: string;
  onOpenFile: (path: string) => void;
};

export function PanelFiles({ cwd, onOpenFile }: Props) {
  const [query, setQuery] = useState("");
  const [files, setFiles] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!cwd) {
      setFiles([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const timer = window.setTimeout(() => {
      void window.relay
        .listFiles(cwd, query.trim())
        .then((result) => {
          if (!cancelled) setFiles(result);
        })
        .catch(() => {
          if (!cancelled) setFiles([]);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, query ? 120 : 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [cwd, query]);

  return (
    <div className="panel-files">
      <div className="panel-row">
        <input
          className="panel-input"
          aria-label="Filter files"
          placeholder="Filter files"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      {files.length === 0 ? (
        <p className="panel-note">{loading ? "Loading…" : "No files"}</p>
      ) : (
        <div className="panel-files-list">
          {files.map((file) => (
            <button
              key={file}
              type="button"
              className="panel-file-row"
              onClick={() => onOpenFile(file)}
            >
              <span className="panel-file-path">{file}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
