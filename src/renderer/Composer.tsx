import type {
  AvailableCommandLike,
  PromptAttachment,
  SessionModeLike,
} from "../shared/types.ts";
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
  commands?: AvailableCommandLike[];
  cwd?: string;
  inject?: { text: string; nonce: number };
  modes?: SessionModeLike[];
  currentModeId?: string;
  onSetMode?: (modeId: string) => void;
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
  inject,
  modes = [],
  currentModeId,
  onSetMode,
}: Props) {
  const {
    field,
    text,
    setText,
    attachments,
    setAttachments,
    commandBadge,
    setCommandBadge,
    menu,
    activeIndex,
    pick,
    onKeyDown,
    onPaste,
    onDragOver,
    onDrop,
    modeMenuOpen,
    toggleModeMenu,
    currentMode,
    buildPrompt,
    reset,
    hasContent,
    submitting,
  } = useComposerInput({
    commands,
    cwd,
    modes,
    currentModeId,
    onSetMode,
    inject,
    onEnter: () => void submit(),
  });
  const canSubmit = hasContent && !disabled;

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
        {modes.length > 1 || commandBadge !== null ? (
          <div className="composer-badges">
            {modes.length > 1 ? (
              <button
                type="button"
                className="mode-badge"
                disabled={disabled || working}
                aria-expanded={modeMenuOpen}
                onClick={toggleModeMenu}
              >
                {currentMode?.name ?? currentModeId ?? "mode"}
              </button>
            ) : null}
            {commandBadge !== null ? (
              <span className="command-badge">
                <span className="badge-text">/{commandBadge}</span>
                <button
                  type="button"
                  className="badge-remove"
                  aria-label={`Remove /${commandBadge}`}
                  onClick={() => setCommandBadge(null)}
                >
                  ×
                </button>
              </span>
            ) : null}
          </div>
        ) : null}
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
            onPaste={onPaste}
            rows={1}
          />
        </div>
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
