import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import type { AvailableCommandLike } from "../shared/types.ts";
import { IconCirclePlus, IconMic, IconSend, IconStop } from "./icons";
import { SuggestionMenu } from "./SuggestionMenu";

const lineHeight = 24;
const maxComposerHeight = 176;

type Props = {
  disabled: boolean;
  working: boolean;
  onSend: (text: string) => Promise<void>;
  onCancel: () => void;
  queued?: string[];
  onQueue?: (text: string) => void;
  onRemoveQueued?: (index: number) => void;
  commands?: AvailableCommandLike[];
};

export function Composer({
  disabled,
  working,
  onSend,
  onCancel,
  queued = [],
  onQueue,
  onRemoveQueued,
  commands = [],
}: Props) {
  const [text, setText] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const field = useRef<HTMLTextAreaElement>(null);
  const canSubmit = Boolean(text.trim()) && !disabled;
  const slashMatch = /^\/([^\s\n]*)$/.exec(text);
  const slashItems = slashMatch
    ? commands
        .filter((c) => c.name.toLowerCase().includes(slashMatch[1].toLowerCase()))
        .map((c) => ({ id: c.name, label: `/${c.name}`, detail: c.description }))
    : [];
  const menuOpen = slashItems.length > 0;

  useEffect(() => {
    const el = field.current;
    if (!el) return;
    el.style.height = `${lineHeight}px`;
    const next = el.scrollHeight;
    if (next > lineHeight) {
      el.style.height = `${Math.min(next, maxComposerHeight)}px`;
    }
  }, [text]);

  useEffect(() => {
    setActiveIndex(0);
  }, [text]);

  function pickSlash(index: number) {
    const item = slashItems[index];
    if (!item) return;
    setText(`/${item.id} `);
  }

  async function submit() {
    const value = text.trim();
    if (!value || disabled) return;
    if (working) {
      onQueue?.(value);
      setText("");
      return;
    }
    setText("");
    void onSend(value);
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (menuOpen) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => (i + 1) % slashItems.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => (i - 1 + slashItems.length) % slashItems.length);
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        pickSlash(activeIndex);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setText("");
        return;
      }
    }
    if (e.key !== "Enter" || e.shiftKey) return;
    e.preventDefault();
    void submit();
  }

  return (
    <div className="dock">
      {queued.length > 0 ? (
        <div className="composer-queued">
          {queued.map((item, index) => (
            <span className="queued-chip" key={`${index}-${item}`}>
              <span className="queued-text">{item}</span>
              <button
                className="queued-remove"
                aria-label="Remove queued message"
                onClick={() => onRemoveQueued?.(index)}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      ) : null}
      {menuOpen ? (
        <SuggestionMenu items={slashItems} activeIndex={activeIndex} onPick={pickSlash} />
      ) : null}
      <div className="composer-card dock-composer">
        <span className="plus" aria-hidden>
          <IconCirclePlus size={16} />
        </span>
        <div className="dock-field">
          {text === "" && (
            <span className="dock-placeholder">
              {disabled ? "Agent is working…" : "Plan, Build, / for skills, @ for context"}
            </span>
          )}
          <textarea
            ref={field}
            value={text}
            disabled={disabled}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKeyDown}
            rows={1}
          />
        </div>
        {working ? (
          <button
            className="send-orb stop"
            onClick={onCancel}
            aria-label="Stop"
            title="Stop"
          >
            <IconStop />
          </button>
        ) : (
          <button
            className={`send-orb ${canSubmit ? "send" : "mic"}`}
            disabled={!canSubmit}
            onClick={() => void submit()}
            aria-label={canSubmit ? "Send" : "Voice"}
          >
            {canSubmit ? <IconSend /> : <IconMic />}
          </button>
        )}
      </div>
    </div>
  );
}
