import { useRef } from "react";
import type {
  AvailableCommandLike,
  PlanEntry,
  PromptAttachment,
} from "../shared/types.ts";
import { ComposerMirror } from "./ComposerMirror";
import { ContextMeter, type UsageInfo } from "./ContextMeter";
import { PlanBadge } from "./PlanBadge";
import { IconCirclePlus, IconMic, IconSend, IconStop } from "./icons";
import { SuggestionMenu } from "./SuggestionMenu";
import { withThumbs } from "./thumbs";
import { useComposerInput } from "./useComposerInput";

type Props = {
  disabled: boolean;
  working: boolean;
  onSend: (text: string, attachments?: PromptAttachment[]) => void | Promise<void>;
  onCancel: () => void;
  queued?: string[];
  onQueue?: (text: string) => void;
  onRemoveQueued?: (index: number) => void;
  onClearQueued?: () => void;
  onEditQueued?: (index: number) => void;
  onSendQueued?: (index: number) => void;
  commands?: AvailableCommandLike[];
  cwd?: string;
  inject?: { text: string; nonce: number; fromEventId?: string };
  plan?: PlanEntry[];
  usage?: UsageInfo;
};

export function Composer({
  disabled,
  working,
  onSend,
  onCancel,
  queued = [],
  onQueue,
  onRemoveQueued,
  onClearQueued,
  onEditQueued,
  onSendQueued,
  commands = [],
  cwd,
  inject,
  plan,
  usage,
}: Props) {
  const {
    field,
    text,
    setText,
    attachments,
    setAttachments,
    menu,
    activeIndex,
    pick,
    onKeyDown,
    onPaste,
    onDragOver,
    onDrop,
    buildPrompt,
    reset,
    hasContent,
    submitting,
  } = useComposerInput({
    commands,
    cwd,
    inject,
    onEnter: () => void submit(),
  });
  const canSubmit = hasContent && !disabled;
  const mirror = useRef<HTMLDivElement>(null);

  async function submit() {
    if (submitting.current) return;
    const value = buildPrompt();
    if (disabled) return;
    if (!value && attachments.length === 0) return;
    if (working) {
      if (attachments.length > 0 || !value) return;
      onQueue?.(value);
      reset();
      return;
    }
    submitting.current = true;
    try {
      if (attachments.length === 0) {
        reset();
        void onSend(value);
        return;
      }
      const outgoing = await withThumbs(attachments);
      reset();
      setAttachments([]);
      void onSend(value, outgoing);
    } finally {
      submitting.current = false;
    }
  }

  return (
    <div className="dock">
      {queued.length > 0 ? (
        <div className="composer-queued">
          {queued.map((item, index) => (
            <span className="queued-chip" key={`${index}-${item}`}>
              <span className="queued-text">{item}</span>
              {onEditQueued ? (
                <button
                  type="button"
                  className="queued-action"
                  aria-label="Edit queued message"
                  onClick={() => onEditQueued(index)}
                >
                  Edit
                </button>
              ) : null}
              {onSendQueued ? (
                <button
                  type="button"
                  className="queued-action"
                  aria-label="Send queued message next"
                  onClick={() => onSendQueued(index)}
                >
                  Send next
                </button>
              ) : null}
              <button
                className="queued-remove"
                aria-label="Remove queued message"
                onClick={() => onRemoveQueued?.(index)}
              >
                ×
              </button>
            </span>
          ))}
          {queued.length > 1 ? (
            <button
              type="button"
              className="queued-clear"
              aria-label="Clear queued messages"
              onClick={() => onClearQueued?.()}
            >
              Clear
            </button>
          ) : null}
        </div>
      ) : null}
      {attachments.length > 0 ? (
        <div className="composer-queued">
          {attachments.map((attachment, index) => (
            <span className="queued-chip" key={`${index}-${attachment.name}`}>
              <img
                className="attach-thumb"
                src={`data:${attachment.mimeType};base64,${attachment.data}`}
                alt={attachment.name}
              />
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
      {menu ? (
        <SuggestionMenu items={menu.items} activeIndex={activeIndex} onPick={pick} />
      ) : null}
      <div className="composer-card dock-composer" onDragOver={onDragOver} onDrop={onDrop}>
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
              {disabled ? "Agent is working…" : "/ untuk skill, @ untuk konteks"}
            </span>
          )}
          <ComposerMirror text={text} commands={commands} mirrorRef={mirror} />
          <textarea
            ref={field}
            value={text}
            disabled={disabled}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKeyDown}
            onPaste={onPaste}
            onScroll={(e) => {
              const node = mirror.current;
              if (node) node.scrollTop = e.currentTarget.scrollTop;
            }}
            rows={1}
          />
        </div>
        <PlanBadge entries={plan} />
        <ContextMeter usage={usage} />
        {working ? (
          <button className="send-orb stop" onClick={onCancel} aria-label="Stop" title="Stop">
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
