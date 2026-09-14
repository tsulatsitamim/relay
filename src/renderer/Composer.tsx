import { useState, type KeyboardEvent } from "react";

type Props = {
  disabled: boolean;
  onSend: (text: string) => Promise<void>;
};

export function Composer({ disabled, onSend }: Props) {
  const [text, setText] = useState("");

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
              +
            </span>
          </div>
          <button className="send-orb" disabled={disabled || !text.trim()} onClick={() => void submit()}>
            ↑
          </button>
        </div>
      </div>
    </div>
  );
}
