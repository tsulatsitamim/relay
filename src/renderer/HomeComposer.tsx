import { useState, type FormEvent, type KeyboardEvent } from "react";
import type { AgentConfig, Repo } from "../shared/types.ts";

type Props = {
  agents: AgentConfig[];
  repos: Repo[];
  agentId: string;
  repoPath: string;
  busy: boolean;
  error: string | null;
  onAgentId: (id: string) => void;
  onRepoPath: (path: string) => void;
  onSubmit: (prompt: string) => Promise<void>;
};

export function HomeComposer({
  agents,
  repos,
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

  async function submit() {
    const value = text.trim();
    if (!value || busy) return;
    setText("");
    await onSubmit(value);
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      void submit();
    }
  }

  return (
    <div className="home">
      <div className="context">
        <select value={repoPath} onChange={(e) => onRepoPath(e.target.value)}>
          <option value="">No repository</option>
          {repos.map((repo) => (
            <option key={repo.path} value={repo.path}>
              {repo.name}
            </option>
          ))}
        </select>
        {selected?.branch ? (
          <>
            <span className="sep">/</span>
            <span>{selected.branch}</span>
          </>
        ) : null}
        <span className="sep">/</span>
        <span>This Mac</span>
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
          rows={3}
        />
        <div className="composer-bar">
          <div className="left">
            <span className="plus" aria-hidden>
              +
            </span>
            <select
              className="agent-select"
              value={agentId}
              onChange={(e) => onAgentId(e.target.value)}
            >
              {agents.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.name}
                </option>
              ))}
            </select>
          </div>
          <button className="send-orb" disabled={busy || !text.trim()} type="submit">
            ↑
          </button>
        </div>
      </form>
      {error && <div className="err">{error}</div>}
      <div className="hint">Ask Relay to find a prior conversation, or summarize across conversations</div>
    </div>
  );
}
