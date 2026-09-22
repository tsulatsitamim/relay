import { useCallback, useEffect, useRef, useState } from "react";
import type { EditorInfo } from "../../shared/editors.ts";
import { IconChevron, IconOut } from "../icons";
import { useDismissable } from "./dismiss.ts";

type Props = {
  cwd: string;
  path?: string;
  line?: number;
  preferred: string | null;
  onPreferred: (id: string) => void;
  disabled: boolean;
  editors?: EditorInfo[];
};

export function EditorButton({
  cwd,
  path,
  line,
  preferred,
  onPreferred,
  disabled,
  editors: suppliedEditors,
}: Props) {
  const [fetchedEditors, setFetchedEditors] = useState<EditorInfo[]>([]);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const menuRef = useRef<HTMLSpanElement>(null);
  const closeMenu = useCallback(() => setOpen(false), []);
  useDismissable(open, menuRef, closeMenu);
  const editors = suppliedEditors ?? fetchedEditors;

  useEffect(() => {
    if (suppliedEditors) return;
    let cancelled = false;
    void window.relay
      .availableEditors()
      .then((result) => {
        if (!cancelled) setFetchedEditors(result);
      })
      .catch(() => {
        if (!cancelled) setFetchedEditors([]);
      });
    return () => {
      cancelled = true;
    };
  }, [suppliedEditors]);

  const preferredEditor =
    editors.find((editor) => editor.id === preferred) ?? editors[0] ?? null;

  function openIn(id: string) {
    setOpen(false);
    void window.relay
      .openInEditor(cwd, id, path, line)
      .then((result) => {
        setError(result.ok ? null : result.message);
      })
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : String(cause));
      });
  }

  function reveal() {
    setOpen(false);
    void window.relay
      .revealInFinder(cwd, path ?? ".")
      .then((ok) => setError(ok ? null : "Could not reveal the folder"))
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : String(cause));
      });
  }

  const label = preferredEditor ? `Open in ${preferredEditor.label}` : "Reveal in Finder";

  return (
    <span className="editor-button" ref={menuRef}>
      <button
        type="button"
        className="editor-button-main"
        disabled={disabled}
        onClick={() => {
          if (preferredEditor) openIn(preferredEditor.id);
          else reveal();
        }}
      >
        {label}
        <IconOut />
      </button>
      <button
        type="button"
        className="editor-button-menu icon-btn"
        aria-label="Choose editor"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((value) => !value)}
      >
        <IconChevron />
      </button>
      {open ? (
        <div className="right-panel-menu" role="menu">
          {editors.map((editor) => (
            <button
              key={editor.id}
              type="button"
              role="menuitem"
              onClick={() => {
                onPreferred(editor.id);
                openIn(editor.id);
              }}
            >
              {editor.label}
            </button>
          ))}
          <button type="button" role="menuitem" onClick={reveal}>
            Reveal in Finder
          </button>
        </div>
      ) : null}
      {error ? <span className="editor-button-error">{error}</span> : null}
    </span>
  );
}
