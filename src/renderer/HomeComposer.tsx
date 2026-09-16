import type { FormEvent, ReactNode } from "react";
import type {
  AgentConfig,
  AvailableCommandLike,
  PromptAttachment,
  Repo,
} from "../shared/types.ts";
import { IconChevron, IconCirclePlus, IconMic, IconMonitor, IconSend } from "./icons";
import { SuggestionMenu } from "./SuggestionMenu";
import { withThumbs } from "./thumbs";
import { useComposerInput } from "./useComposerInput";

type Props = {
  agents: AgentConfig[];
  repos: Repo[];
  recents: string[];
  agentId: string;
  repoPath: string;
  busy: boolean;
  error: string | null;
  commands?: AvailableCommandLike[];
  onAgentId: (id: string) => void;
  onRepoPath: (path: string) => void;
  onSubmit: (prompt: string, attachments?: PromptAttachment[]) => Promise<void>;
};

function Chip({
  value,
  onChange,
  children,
  icon,
}: {
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <label className="chip">
      {icon}
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {children}
      </select>
      <IconChevron />
    </label>
  );
}

export function HomeComposer({
  agents,
  repos,
  recents,
  agentId,
  repoPath,
  busy,
  error,
  commands = [],
  onAgentId,
  onRepoPath,
  onSubmit,
}: Props) {
  const selected = repos.find((r) => r.path === repoPath);
  const recentFolders = recents.filter(
    (path) => !repos.some((repo) => repo.path === path),
  );
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
    buildPrompt,
    reset,
    hasContent,
    submitting,
  } = useComposerInput({
    commands,
    cwd: repoPath || undefined,
    onEnter: () => void submit(),
  });
  const canSend = hasContent && !busy;

  async function submit() {
    if (submitting.current || busy) return;
    const value = buildPrompt();
    if (!value && attachments.length === 0) return;
    submitting.current = true;
    try {
      if (attachments.length === 0) {
        reset();
        await onSubmit(value);
        return;
      }
      const outgoing = await withThumbs(attachments);
      reset();
      setAttachments([]);
      await onSubmit(value, outgoing);
    } finally {
      submitting.current = false;
    }
  }

  return (
    <div className="home">
      <div className="context">
        <Chip value={repoPath} onChange={onRepoPath}>
          <option value="">No repository</option>
          {repos.map((repo) => (
            <option key={repo.path} value={repo.path}>
              {repo.name}
            </option>
          ))}
          {recentFolders.length > 0 ? (
            <optgroup label="Recent">
              {recentFolders.map((path) => (
                <option key={path} value={path}>
                  {path}
                </option>
              ))}
            </optgroup>
          ) : null}
        </Chip>
        {selected?.branch ? (
          <>
            <span className="sep">/</span>
            <span className="chip static">
              {selected.branch}
              <IconChevron />
            </span>
          </>
        ) : null}
        <span className="sep">/</span>
        <span className="chip static">
          <IconMonitor />
          This Mac
          <IconChevron />
        </span>
      </div>

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

      <form
        className="composer-card"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          void submit();
        }}
        onDragOver={onDragOver}
        onDrop={onDrop}
      >
        {commandBadge !== null ? (
          <div className="composer-badges">
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
          </div>
        ) : null}
        <textarea
          ref={field}
          value={text}
          disabled={busy}
          placeholder="Plan, Build, / for skills, @ for context"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          rows={2}
        />
        <div className="composer-bar">
          <div className="left">
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
              <IconCirclePlus />
            </button>
            <Chip value={agentId} onChange={onAgentId}>
              {agents.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.name}
                </option>
              ))}
            </Chip>
          </div>
          <button
            className={`send-orb ${canSend ? "send" : "mic"}`}
            disabled={!canSend}
            type="submit"
            aria-label={canSend ? "Send" : "Voice"}
          >
            {canSend ? <IconSend /> : <IconMic />}
          </button>
        </div>
      </form>
      <div className="pills">
        <button type="button" className="pill" tabIndex={-1}>
          Plan New Idea
          <kbd>Tab</kbd>
        </button>
        <button type="button" className="pill" tabIndex={-1}>
          Multitask
        </button>
      </div>
      {error && <div className="err">{error}</div>}
      <div className="hint">Ask Relay to find a prior conversation, or summarize across conversations</div>
    </div>
  );
}
