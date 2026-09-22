import { useEffect, useRef, useState } from "react";
import type { ReadFileResult } from "../../shared/ipc.ts";
import { CodeBlock } from "../CodeBlock";
import { IconExternalLink } from "../icons";

const LANGUAGE_BY_EXTENSION: Record<string, string> = {
  c: "c",
  cpp: "cpp",
  css: "css",
  go: "go",
  html: "xml",
  java: "java",
  js: "javascript",
  json: "json",
  jsx: "javascript",
  md: "markdown",
  py: "python",
  rb: "ruby",
  rs: "rust",
  sh: "bash",
  toml: "ini",
  ts: "typescript",
  tsx: "typescript",
  yml: "yaml",
  yaml: "yaml",
};

export function languageForPath(path: string): string | undefined {
  const parts = path.split(".");
  if (parts.length < 2) return undefined;
  return LANGUAGE_BY_EXTENSION[parts[parts.length - 1]!.toLowerCase()];
}

type Props = {
  cwd: string;
  path: string;
  revealLine: number | null;
  revealRequestId: number;
  onOpenInEditor: (path: string, line?: number) => void;
};

export function PanelFile({
  cwd,
  path,
  revealLine,
  revealRequestId,
  onOpenInEditor,
}: Props) {
  const [file, setFile] = useState<ReadFileResult | null>(null);
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!cwd) return;
    let cancelled = false;
    setError(null);
    setMissing(false);
    void window.relay
      .readFile(cwd, path)
      .then((result) => {
        if (cancelled) return;
        setFile(result);
        setMissing(result === null);
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setFile(null);
          setMissing(false);
          setError(cause instanceof Error ? cause.message : String(cause));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [cwd, path, revealRequestId]);

  return (
    <div className="panel-file">
      <div className="panel-row">
        <span className="panel-file-path" title={path}>
          {path}
        </span>
        <button
          type="button"
          className="icon-btn"
          aria-label="Open in editor"
          onClick={() => onOpenInEditor(path, revealLine ?? undefined)}
        >
          <IconExternalLink />
        </button>
      </div>
      <div className="panel-file-body" ref={scrollerRef}>
        {error ? <p className="panel-note">{error}</p> : null}
        {missing ? <p className="panel-note">Unable to read this file</p> : null}
        {file?.binary ? <p className="panel-note">Binary file</p> : null}
        {file && !file.binary && file.truncated ? (
          <p className="panel-note">File truncated</p>
        ) : null}
        {file && !file.binary ? (
          <CodeBlock
            code={file.text}
            lang={languageForPath(path)}
            revealLine={revealLine}
          />
        ) : null}
      </div>
    </div>
  );
}
