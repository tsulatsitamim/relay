import { useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import type { AgentConfig, Repo } from "../shared/types.ts";
import { IconChevron, IconCirclePlus, IconMic, IconMonitor, IconSend } from "./icons";

type Props = {
  agents: AgentConfig[];
  repos: Repo[];
  recents: string[];
  agentId: string;
  repoPath: string;
  busy: boolean;
  error: string | null;
  onAgentId: (id: string) => void;
  onRepoPath: (path: string) => void;
  onSubmit: (prompt: string) => Promise<void>;
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
  onAgentId,
  onRepoPath,
  onSubmit,
}: Props) {
  const [text, setText] = useState("");
  const selected = repos.find((r) => r.path === repoPath);
  const recentFolders = recents.filter(
    (path) => !repos.some((repo) => repo.path === path),
  );
  const canSend = Boolean(text.trim()) && !busy;

  async function submit() {
    const value = text.trim();
    if (!value || busy) return;
    setText("");
    await onSubmit(value);
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key !== "Enter" || e.shiftKey) return;
    e.preventDefault();
    void submit();
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

      <form
        className="composer-card"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          void submit();
        }}
      >
        <textarea
          value={text}
          disabled={busy}
          placeholder="Plan, Build, / for skills, @ for context"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          rows={2}
        />
        <div className="composer-bar">
          <div className="left">
            <span className="plus" aria-hidden>
              <IconCirclePlus />
            </span>
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
