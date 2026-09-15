import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { IconCirclePlus, IconMic, IconSend, IconStop } from "./icons";

const lineHeight = 24;
const maxComposerHeight = 176;

type Props = {
  disabled: boolean;
  working: boolean;
  onSend: (text: string) => Promise<void>;
  onCancel: () => void;
};

export function Composer({ disabled, working, onSend, onCancel }: Props) {
  const [text, setText] = useState("");
  const field = useRef<HTMLTextAreaElement>(null);
  const canSend = Boolean(text.trim()) && !disabled && !working;

  useEffect(() => {
    const el = field.current;
    if (!el) return;
    el.style.height = `${lineHeight}px`;
    const next = el.scrollHeight;
    if (next > lineHeight) {
      el.style.height = `${Math.min(next, maxComposerHeight)}px`;
    }
  }, [text]);

  async function submit() {
    const value = text.trim();
    if (!value || disabled || working) return;
    setText("");
    await onSend(value);
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key !== "Enter" || e.shiftKey) return;
    e.preventDefault();
    void submit();
  }

  return (
    <div className="dock">
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
            className={`send-orb ${canSend ? "send" : "mic"}`}
            disabled={!canSend}
            onClick={() => void submit()}
            aria-label={canSend ? "Send" : "Voice"}
          >
            {canSend ? <IconSend /> : <IconMic />}
          </button>
        )}
      </div>
    </div>
  );
}
