import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { captureKeys, type KeyOverrides } from "./keymap.ts";
import { formatKeys } from "./keys.ts";
import { IconPencil, IconWarning, IconX } from "./icons";

export type ShortcutHint = {
  id: string;
  label: string;
  keys: string;
  editable: boolean;
};

export function HelpDialog({
  shortcuts,
  mod,
  overrides,
  conflicts,
  lockedIds,
  onChange,
  onReset,
  onClose,
}: {
  shortcuts: ShortcutHint[];
  mod: string;
  overrides: KeyOverrides;
  conflicts: Set<string>;
  lockedIds: string[];
  onChange: (id: string, keys: string | null) => void;
  onReset: () => void;
  onClose: () => void;
}) {
  const [capturing, setCapturing] = useState<string | null>(null);
  const capturingRef = useRef<string | null>(null);
  capturingRef.current = capturing;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const id = capturingRef.current;
      if (id === null) return;
      event.preventDefault();
      event.stopPropagation();
      if (event.key === "Escape") {
        setCapturing(null);
        return;
      }
      if (event.key === "Backspace" || event.key === "Delete") {
        onChangeRef.current(id, null);
        setCapturing(null);
        return;
      }
      const captured = captureKeys(event);
      if (captured === null) return;
      onChangeRef.current(id, captured);
      setCapturing(null);
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, []);

  return createPortal(
    <div
      className="overlay"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="overlay-card help-card"
        role="dialog"
        aria-modal="true"
        aria-label="Keyboard shortcuts"
      >
        <div className="overlay-head">
          <span className="overlay-title">Keyboard shortcuts</span>
          <span className="row-end">
            <button
              type="button"
              className="help-reset"
              onMouseDown={(e) => e.preventDefault()}
              onClick={onReset}
            >
              Reset all
            </button>
            <button
              type="button"
              className="icon-btn"
              aria-label="Close shortcuts"
              onMouseDown={(e) => e.preventDefault()}
              onClick={onClose}
            >
              <IconX />
            </button>
          </span>
        </div>
        <div className="help-list">
          {shortcuts.map((shortcut) => {
            const isCapturing = capturing === shortcut.id;
            const editable = shortcut.editable && !lockedIds.includes(shortcut.id);
            return (
              <div
                className="help-row"
                key={shortcut.id}
                data-customized={overrides[shortcut.id] ? "" : undefined}
              >
                <span className="help-label">{shortcut.label}</span>
                <span className="row-end">
                  {conflicts.has(shortcut.id) ? (
                    <span className="help-warn" title="Used by another shortcut">
                      <IconWarning />
                    </span>
                  ) : null}
                  <span className="kbd-badge">
                    {isCapturing ? "Press keys…" : formatKeys(shortcut.keys, mod)}
                  </span>
                  {editable ? (
                    <button
                      type="button"
                      className="icon-btn"
                      aria-label={`Change shortcut for ${shortcut.label}`}
                      title="Change"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => setCapturing(shortcut.id)}
                    >
                      <IconPencil />
                    </button>
                  ) : null}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>,
    document.body,
  );
}