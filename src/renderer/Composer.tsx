import { useState, type KeyboardEvent } from "react";
import { IconCirclePlus, IconMic, IconSend } from "./icons";

type Props = {
  disabled: boolean;
  onSend: (text: string) => Promise<void>;
};

export function Composer({ disabled, onSend }: Props) {
  const [text, setText] = useState("");
  const canSend = Boolean(text.trim()) && !disabled;

  async function submit() {
    const value = text.trim();
    if (!value || disabled) return;
    setText("");
    await onSend(value);
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      void submit();
    }
  }

  return (
    <div className="dock">
      <div className="composer-card">
        <textarea
          value={text}
          disabled={disabled}
          placeholder={disabled ? "Agent is working…" : "Plan, Build, / for skills, @ for context"}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          rows={2}
        />
        <div className="composer-bar">
          <div className="left">
            <span className="plus" aria-hidden>
              <IconCirclePlus />
            </span>
          </div>
          <button
            className={`send-orb ${canSend ? "send" : "mic"}`}
            disabled={!canSend}
            onClick={() => void submit()}
            aria-label={canSend ? "Send" : "Voice"}
          >
            {canSend ? <IconSend /> : <IconMic />}
          </button>
        </div>
      </div>
    </div>
  );
}
