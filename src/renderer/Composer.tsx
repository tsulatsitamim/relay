import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { IconCirclePlus, IconMic, IconSend, IconStop } from "./icons";

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
};

export function Composer({
  disabled,
  working,
  onSend,
  onCancel,
  queued = [],
  onQueue,
  onRemoveQueued,
}: Props) {
  const [text, setText] = useState("");
  const field = useRef<HTMLTextAreaElement>(null);
  const canSubmit = Boolean(text.trim()) && !disabled;

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
