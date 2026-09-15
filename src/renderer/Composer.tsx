import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import type { AvailableCommandLike, PromptAttachment } from "../shared/types.ts";
import { IconCirclePlus, IconMic, IconSend, IconStop } from "./icons";
import { SuggestionMenu } from "./SuggestionMenu";

const lineHeight = 24;
const maxComposerHeight = 176;

type Props = {
  disabled: boolean;
  working: boolean;
  onSend: (text: string, attachments?: PromptAttachment[]) => void | Promise<void>;
  onCancel: () => void;
  queued?: string[];
  onQueue?: (text: string) => void;
  onRemoveQueued?: (index: number) => void;
  commands?: AvailableCommandLike[];
  cwd?: string;
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
  cwd,
}: Props) {
  const [text, setText] = useState("");
  const [files, setFiles] = useState<string[]>([]);
  const [attachments, setAttachments] = useState<PromptAttachment[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const field = useRef<HTMLTextAreaElement>(null);
  const canSubmit = (Boolean(text.trim()) || attachments.length > 0) && !disabled;
  const slashMatch = /^\/([^\s\n]*)$/.exec(text);
  const slashItems = slashMatch
    ? commands
        .filter((c) => c.name.toLowerCase().includes(slashMatch[1].toLowerCase()))
        .map((c) => ({ id: c.name, label: `/${c.name}`, detail: c.description }))
    : [];
  const mentionMatch = /(?:^|\s)@([^\s@]*)$/.exec(text);
  const mentionQuery = mentionMatch ? mentionMatch[1] : null;
  const mentionItems = files.map((file) => ({ id: file, label: file }));
  const slashMenuOpen = slashItems.length > 0;
  const mentionMenuOpen = !slashMenuOpen && mentionItems.length > 0;

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
    if (mentionQuery === null || !cwd) {
      setFiles([]);
      return;
    }
    const handle = setTimeout(() => {
      void window.relay
        .listFiles(cwd)
        .then((all) =>
          setFiles(
            all
              .filter((file) =>
                file.toLowerCase().includes(mentionQuery.toLowerCase()),
              )
              .slice(0, 8),
          ),
        )
        .catch(() => setFiles([]));
    }, 120);
    return () => clearTimeout(handle);
  }, [mentionQuery, cwd]);

  useEffect(() => {
    setActiveIndex(0);
  }, [text]);

  function pickSlash(index: number) {
    const item = slashItems[index];
    if (!item) return;
    setText(`/${item.id} `);
  }

  function pickMention(index: number) {
    const item = mentionItems[index];
    if (!item) return;
    setText((prev) => prev.replace(/@([^\s@]*)$/, `@${item.id} `));
  }

  async function submit() {
    const value = text.trim();
    if (disabled) return;
    if (!value && attachments.length === 0) return;
    if (working) {
      if (attachments.length > 0 || !value) return;
      onQueue?.(value);
      setText("");
      return;
    }
    const outgoing = attachments;
    setText("");
    setAttachments([]);
    if (outgoing.length === 0) {
      void onSend(value);
    } else {
      void onSend(value, outgoing);
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (slashMenuOpen) {
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
    if (mentionMenuOpen) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => (i + 1) % mentionItems.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => (i - 1 + mentionItems.length) % mentionItems.length);
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        pickMention(activeIndex);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setFiles([]);
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
      {attachments.length > 0 ? (
        <div className="composer-queued">
          {attachments.map((attachment, index) => (
            <span className="queued-chip" key={`${index}-${attachment.name}`}>
              <span className="queued-text">{attachment.name}</span>
              <button
                className="queued-remove"
                aria-label="Remove attachment"
                onClick={() =>
                  setAttachments((prev) => prev.filter((_, i) => i !== index))
                }
              >
                ×
              </button>
            </span>
          ))}
        </div>
      ) : null}
      {slashMenuOpen ? (
        <SuggestionMenu items={slashItems} activeIndex={activeIndex} onPick={pickSlash} />
      ) : mentionMenuOpen ? (
        <SuggestionMenu
          items={mentionItems}
          activeIndex={activeIndex}
          onPick={pickMention}
        />
      ) : null}
      <div className="composer-card dock-composer">
        <button
          type="button"
          className="plus"
          aria-label="Attach image"
          onClick={() => {
            void window.relay.pickImages().then((picked) => {
              if (picked.length > 0) setAttachments((prev) => [...prev, ...picked]);
            });
          }}
        >
          <IconCirclePlus size={16} />
        </button>
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
