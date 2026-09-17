import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Session, TranscriptEvent } from "../shared/types.ts";
import { paletteSessionEntries, rankEntries, type PaletteEntry } from "./palette.ts";
import { formatKeys } from "./keys.ts";
import { IconSearch } from "./icons";

export type PaletteCommand = {
  id: string;
  label: string;
  hint?: string;
  shortcut?: string;
  run: () => void;
};

type Option = {
  key: string;
  label: string;
  hint?: string;
  shortcut?: string;
  run: () => void;
};

type Section = { title: string; items: Option[] };

type Props = {
  commands: PaletteCommand[];
  sessions: Session[];
  transcripts: Record<string, TranscriptEvent[]>;
  folders: string[];
  mod: string;
  onSelectSession: (id: string) => void;
  onSelectFolder: (path: string) => void;
  onClose: () => void;
};

function folderLabel(path: string): string {
  const parts = path.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] ?? path;
}

export function CommandPalette({
  commands,
  sessions,
  transcripts,
  folders,
  mod,
  onSelectSession,
  onSelectFolder,
  onClose,
}: Props) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const activeRef = useRef<HTMLButtonElement>(null);

  const sections = useMemo<Section[]>(() => {
    const commandEntries = rankEntries(
      query,
      commands.map((command) => ({ ...command, group: "Commands" })),
    );
    const sessionEntries = paletteSessionEntries(query, sessions, transcripts);
    const folderEntries = rankEntries(
      query,
      folders.map((path) => ({
        id: path,
        group: "Folders",
        label: folderLabel(path),
        hint: path,
      })),
    );
    return [
      {
        title: "Commands",
        items: commandEntries.map((command) => ({
          key: `command:${command.id}`,
          label: command.label,
          hint: command.hint,
          shortcut: command.shortcut,
          run: command.run,
        })),
      },
      {
        title: "Sessions",
        items: sessionEntries.map((entry: PaletteEntry) => ({
          key: `session:${entry.id}`,
          label: entry.label,
          hint: entry.hint,
          run: () => onSelectSession(entry.id),
        })),
      },
      {
        title: "Recent folders",
        items: folderEntries.map((entry) => ({
          key: `folder:${entry.id}`,
          label: entry.label,
          hint: entry.hint,
          run: () => onSelectFolder(entry.id),
        })),
      },
    ];
  }, [query, commands, sessions, transcripts, folders, onSelectSession, onSelectFolder]);

  const visibleSections = sections.filter((section) => section.items.length > 0);
  const flat = visibleSections.flatMap((section) => section.items);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  useEffect(() => {
    if (activeIndex >= flat.length) setActiveIndex(0);
  }, [activeIndex, flat.length]);

  useEffect(() => {
    activeRef.current?.scrollIntoView?.({ block: "nearest" });
  }, [activeIndex]);

  function runActive() {
    const option = flat[activeIndex];
    if (!option) return;
    option.run();
    onClose();
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => (flat.length ? (index + 1) % flat.length : 0));
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) =>
        flat.length ? (index - 1 + flat.length) % flat.length : 0,
      );
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      runActive();
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key === "Tab") {
      event.preventDefault();
      return;
    }
  }

  let optionIndex = -1;

  return createPortal(
    <div
      className="overlay"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="overlay-card palette-card" role="dialog" aria-modal="true" aria-label="Command palette">
        <div className="palette-search">
          <IconSearch />
          <input
            autoFocus
            value={query}
            placeholder="Search commands and chats"
            aria-label="Command palette query"
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onKeyDown}
          />
        </div>
        <div className="palette-list" role="listbox" aria-label="Command palette results">
          {flat.length === 0 ? (
            <div className="palette-empty">No results</div>
          ) : (
            visibleSections.map((section) => (
              <div className="palette-group" key={section.title}>
                <div className="palette-group-title" role="presentation">
                  {section.title}
                </div>
                {section.items.map((option) => {
                  optionIndex += 1;
                  const index = optionIndex;
                  const active = index === activeIndex;
                  return (
                    <button
                      key={option.key}
                      ref={active ? activeRef : undefined}
                      type="button"
                      role="option"
                      aria-selected={active}
                      className={`palette-item${active ? " active" : ""}`}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => {
                        option.run();
                        onClose();
                      }}
                    >
                      <span className="palette-item-label">{option.label}</span>
                      {option.hint ? (
                        <span className="palette-item-hint">{option.hint}</span>
                      ) : null}
                      {option.shortcut ? (
                        <span className="kbd-badge palette-item-keys">
                          {formatKeys(option.shortcut, mod)}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
