import { useState } from "react";
import type { AgentConfig } from "../shared/types.ts";
import type { CreatePayload } from "../shared/ipc.ts";

type Props = {
  agents: AgentConfig[];
  recents: string[];
  onClose: () => void;
  onCreate: (payload: CreatePayload) => Promise<void>;
};

export function NewAgent({ agents, recents, onClose, onCreate }: Props) {
  const [agentId, setAgentId] = useState(agents[0]?.id ?? "");
  const [cwd, setCwd] = useState(recents[0] ?? "");
  const [prompt, setPrompt] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function pickDir() {
    const dir = await window.relay.pickDirectory();
    if (dir) setCwd(dir);
  }

  async function submit() {
    if (!agentId || !cwd.trim() || !prompt.trim()) {
      setError("Choose an agent, a directory, and a task.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onCreate({ agentId, cwd: cwd.trim(), prompt: prompt.trim() });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-back" onClick={onClose}>
      <form
        className="modal"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <h2>New Agent</h2>
        <label>Agent</label>
        <select value={agentId} onChange={(e) => setAgentId(e.target.value)}>
          {agents.map((agent) => (
            <option key={agent.id} value={agent.id}>
              {agent.name}
            </option>
          ))}
        </select>
        <label>Working directory</label>
        <div className="row">
          <input
            value={cwd}
            onChange={(e) => setCwd(e.target.value)}
            placeholder="/path/to/project"
          />
          <button type="button" className="ghost" onClick={() => void pickDir()}>
            Browse
          </button>
        </div>
        {recents.length > 0 && (
          <div className="recents">
            {recents.slice(0, 5).map((path) => (
              <button type="button" key={path} onClick={() => setCwd(path)}>
                {path}
              </button>
            ))}
          </div>
        )}
        <label>Task</label>
        <textarea
          rows={5}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="What should the agent do?"
        />
        {error && <div className="msg error">{error}</div>}
        <div className="row">
          <button type="button" className="ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="send" type="submit" disabled={submitting}>
            {submitting ? "Starting…" : "Start"}
          </button>
        </div>
      </form>
    </div>
  );
}
