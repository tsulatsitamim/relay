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
    <div className="composer">
      <textarea
        value={text}
        disabled={disabled}
        placeholder={disabled ? "Agent is working…" : "Send a follow-up…"}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKeyDown}
      />
      <button className="send" disabled={disabled || !text.trim()} onClick={() => void submit()}>
        Send
      </button>
    </div>
  );
}
