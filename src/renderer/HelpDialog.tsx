import { createPortal } from "react-dom";
import { formatKeys } from "./keys.ts";
import { IconX } from "./icons";

export type ShortcutHint = { label: string; keys: string };

export function HelpDialog({
  shortcuts,
  mod,
  onClose,
}: {
  shortcuts: ShortcutHint[];
  mod: string;
  onClose: () => void;
}) {
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
          <button
            type="button"
            className="icon-btn"
            aria-label="Close shortcuts"
            onMouseDown={(e) => e.preventDefault()}
            onClick={onClose}
          >
            <IconX />
          </button>
        </div>
        <div className="help-list">
          {shortcuts.map((shortcut) => (
            <div className="help-row" key={`${shortcut.label}-${shortcut.keys}`}>
              <span className="help-label">{shortcut.label}</span>
              <span className="kbd-badge">{formatKeys(shortcut.keys, mod)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}
