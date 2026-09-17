import { useState, type ReactNode } from "react";
import type {
  AgentConfig,
  ClaudeAdapterInfo,
  ClaudeInstallResult,
} from "../shared/types.ts";
import {
  IconArrowDown,
  IconArrowLeft,
  IconCheck,
  IconInfo,
  IconPlug,
  IconPlus,
  IconSliders,
  IconSpinner,
  IconTrash,
  IconX,
} from "./icons";

export type SettingsSection = "general" | "providers" | "about";

const SECTIONS: { id: SettingsSection; label: string; icon: ReactNode }[] = [
  { id: "general", label: "General", icon: <IconSliders /> },
  { id: "providers", label: "Providers", icon: <IconPlug /> },
  { id: "about", label: "About", icon: <IconInfo /> },
];

const REPO_URL = "https://github.com/tsulatsitamim/relay";

export function SettingsNav({
  section,
  onSelect,
  onClose,
}: {
  section: SettingsSection;
  onSelect: (section: SettingsSection) => void;
  onClose: () => void;
}) {
  return (
    <div className="nav settings-nav">
      <button
        type="button"
        className="nav-item settings-back"
        aria-label="Close settings"
        title="Back to chat (Esc)"
        onClick={onClose}
      >
        <span className="cell-icon">
          <IconArrowLeft />
        </span>
        <span className="cell-content">Back</span>
      </button>
      <div className="settings-nav-title">Settings</div>
      {SECTIONS.map(({ id, label, icon }) => (
        <button
          key={id}
          type="button"
          className={`nav-item ${section === id ? "active" : ""}`}
          data-active={section === id ? true : undefined}
          aria-current={section === id ? "page" : undefined}
          onClick={() => onSelect(id)}
        >
          <span className="cell-icon">{icon}</span>
          <span className="cell-content">{label}</span>
        </button>
      ))}
    </div>
  );
}

export function SettingRow({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div className="setting-row">
      <div className="setting-row-text">
        <div className="setting-row-label">{label}</div>
        {description ? (
          <div className="setting-row-desc">{description}</div>
        ) : null}
      </div>
      <div className="setting-row-control">{children}</div>
    </div>
  );
}

export function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={`switch${checked ? " on" : ""}`}
      onClick={() => onChange(!checked)}
    >
      <span className="switch-knob" />
    </button>
  );
}

function GeneralSection({
  agents,
  settings,
  onSetSetting,
}: {
  agents: AgentConfig[];
  settings: Record<string, string>;
  onSetSetting: (key: string, value: string) => void;
}) {
  const defaultAgentId = settings.defaultAgentId ?? "";
  const confirmDelete = settings.confirmDeleteProvider !== "false";
  return (
    <section className="settings-section">
      <h2 className="settings-heading">General</h2>
      <SettingRow
        label="Default provider"
        description="Used when a project has no last-used provider."
      >
        <select
          className="setting-select"
          aria-label="Default provider"
          value={defaultAgentId}
          onChange={(event) => onSetSetting("defaultAgentId", event.target.value)}
        >
          <option value="">None</option>
          {agents.map((agent) => (
            <option key={agent.id} value={agent.id}>
              {agent.name}
            </option>
          ))}
        </select>
      </SettingRow>
      <SettingRow
        label="Confirm before deleting a provider"
        description="Ask inline before removing a provider."
      >
        <Switch
          label="Confirm before deleting a provider"
          checked={confirmDelete}
          onChange={(value) =>
            onSetSetting("confirmDeleteProvider", value ? "true" : "false")
          }
        />
      </SettingRow>
    </section>
  );
}

type EnvRow = { key: string; value: string };

function envToRows(env?: Record<string, string>): EnvRow[] {
  return Object.entries(env ?? {}).map(([key, value]) => ({ key, value }));
}

function rowsToEnv(rows: EnvRow[]): Record<string, string> | undefined {
  const env: Record<string, string> = {};
  for (const row of rows) {
    const key = row.key.trim();
    if (!key) continue;
    env[key] = row.value;
  }
  return Object.keys(env).length > 0 ? env : undefined;
}

type InstallPhase =
  | { phase: "idle" }
  | { phase: "installing"; line?: string }
  | { phase: "done" }
  | { phase: "error"; error: string };

function ProvidersSection({
  agents,
  confirmDelete,
  claudeAdapter,
  onSaveAgent,
  onDeleteAgent,
  onInstallClaudeAdapter,
}: {
  agents: AgentConfig[];
  confirmDelete: boolean;
  claudeAdapter?: ClaudeAdapterInfo;
  onSaveAgent: (agent: AgentConfig) => Promise<AgentConfig>;
  onDeleteAgent: (id: string) => Promise<void>;
  onInstallClaudeAdapter: (
    onOutput?: (line: string) => void,
  ) => Promise<ClaudeInstallResult>;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(
    agents[0]?.id ?? null,
  );
  const [draft, setDraft] = useState<AgentConfig | null>(agents[0] ?? null);
  const [envRows, setEnvRows] = useState<EnvRow[]>(() => envToRows(agents[0]?.env));
  const [argsText, setArgsText] = useState(() => (agents[0]?.args ?? []).join("\n"));
  const [confirming, setConfirming] = useState(false);
  const [install, setInstall] = useState<InstallPhase>({ phase: "idle" });

  const select = (agent: AgentConfig) => {
    setSelectedId(agent.id);
    setDraft({ ...agent });
    setEnvRows(envToRows(agent.env));
    setArgsText(agent.args.join("\n"));
    setConfirming(false);
    setInstall({ phase: "idle" });
  };

  const runInstall = async () => {
    setInstall({ phase: "installing" });
    const result = await onInstallClaudeAdapter((line) =>
      setInstall({ phase: "installing", line }),
    );
    if (!result.ok) {
      setInstall({ phase: "error", error: result.error });
      return;
    }
    setInstall({ phase: "done" });
    setDraft((prev) =>
      prev && prev.id === "claude-code"
        ? { ...prev, command: result.binaryPath, args: [], enabled: true }
        : prev,
    );
    setArgsText("");
  };

  const save = async () => {
    if (!draft) return;
    const args = argsText
      .split("\n")
      .filter((arg) => arg.trim() !== "");
    const saved = await onSaveAgent({
      ...draft,
      name: draft.name.trim() || "Untitled provider",
      command: draft.command.trim(),
      args,
      env: rowsToEnv(envRows),
    });
    select(saved);
  };

  const add = async () => {
    const saved = await onSaveAgent({
      id: "",
      name: "New provider",
      command: "",
      args: [],
    });
    select(saved);
  };

  const remove = async () => {
    if (!draft) return;
    const id = draft.id;
    await onDeleteAgent(id);
    const remaining = agents.filter((agent) => agent.id !== id);
    if (remaining[0]) select(remaining[0]);
    else {
      setSelectedId(null);
      setDraft(null);
      setEnvRows([]);
      setArgsText("");
    }
    setConfirming(false);
  };

  const isLast = agents.length <= 1;

  return (
    <section className="settings-section">
      <div className="providers-toolbar">
        <h2 className="settings-heading">Providers</h2>
        <button type="button" className="btn" onClick={() => void add()}>
          <IconPlus />
          Add provider
        </button>
      </div>
      <div className="providers-card">
        <div className="providers-list" role="listbox" aria-label="Providers">
          {agents.map((agent) => (
            <div
              key={agent.id}
              role="option"
              tabIndex={0}
              aria-selected={agent.id === selectedId}
              className={`provider-row${agent.id === selectedId ? " active" : ""}`}
              onClick={() => select(agent)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  select(agent);
                }
              }}
            >
              <span className="provider-row-text">
                <span className="provider-row-name">{agent.name}</span>
                <span className="provider-row-command">{agent.command}</span>
              </span>
              <span
                className="provider-row-switch"
                onClick={(event) => event.stopPropagation()}
              >
                <Switch
                  label={`${agent.name} enabled`}
                  checked={agent.enabled !== false}
                  onChange={(value) => void onSaveAgent({ ...agent, enabled: value })}
                />
              </span>
            </div>
          ))}
        </div>
        <div className="providers-editor">
          {draft ? (
            <>
              <label className="field">
                <span className="field-label">Display name</span>
                <input
                  className="field-input"
                  aria-label="Display name"
                  value={draft.name}
                  onChange={(event) =>
                    setDraft({ ...draft, name: event.target.value })
                  }
                />
              </label>
              <label className="field">
                <span className="field-label">Command</span>
                <input
                  className="field-input"
                  aria-label="Command"
                  value={draft.command}
                  onChange={(event) =>
                    setDraft({ ...draft, command: event.target.value })
                  }
                />
              </label>
              <label className="field">
                <span className="field-label">Args</span>
                <textarea
                  className="field-input field-textarea"
                  aria-label="Args"
                  rows={3}
                  placeholder="One argument per line"
                  value={argsText}
                  onChange={(event) => setArgsText(event.target.value)}
                />
              </label>
              <div className="field">
                <span className="field-label env-label">
                  Environment
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label="Add variable"
                    title="Add variable"
                    onClick={() =>
                      setEnvRows((rows) => [...rows, { key: "", value: "" }])
                    }
                  >
                    <IconPlus />
                  </button>
                </span>
                {envRows.map((row, index) => (
                  <div className="env-row" key={index}>
                    <input
                      className="field-input"
                      aria-label={`Environment key ${index + 1}`}
                      placeholder="KEY"
                      value={row.key}
                      onChange={(event) =>
                        setEnvRows((rows) =>
                          rows.map((item, i) =>
                            i === index ? { ...item, key: event.target.value } : item,
                          ),
                        )
                      }
                    />
                    <input
                      className="field-input"
                      aria-label={`Environment value ${index + 1}`}
                      placeholder="value"
                      value={row.value}
                      onChange={(event) =>
                        setEnvRows((rows) =>
                          rows.map((item, i) =>
                            i === index
                              ? { ...item, value: event.target.value }
                              : item,
                          ),
                        )
                      }
                    />
                    <button
                      type="button"
                      className="icon-btn"
                      aria-label={`Remove variable ${index + 1}`}
                      title="Remove variable"
                      onClick={() =>
                        setEnvRows((rows) => rows.filter((_, i) => i !== index))
                      }
                    >
                      <IconX />
                    </button>
                  </div>
                ))}
              </div>
              {draft.id === "claude-code" && claudeAdapter ? (
                claudeAdapter.available ? (
                  <div className="provider-install">
                    <span className="provider-install-label">claude-code-acp</span>
                    <span className="provider-install-path">{claudeAdapter.path}</span>
                  </div>
                ) : (
                  <div className="provider-install">
                    <button
                      type="button"
                      className="btn"
                      disabled={install.phase === "installing"}
                      onClick={() => void runInstall()}
                    >
                      {install.phase === "installing" ? <IconSpinner /> : <IconArrowDown />}
                      Install claude-code-acp (lokal)
                    </button>
                    <span className="provider-install-note">
                      Installs the adapter into Relay without touching your global
                      npm setup.
                    </span>
                    {install.phase === "installing" ? (
                      <span className="provider-install-status" role="status">
                        <IconSpinner />
                        {install.line ?? "Installing…"}
                      </span>
                    ) : install.phase === "done" ? (
                      <span className="provider-install-status ok" role="status">
                        <IconCheck />
                        Installed
                      </span>
                    ) : install.phase === "error" ? (
                      <span className="provider-install-status err" role="status">
                        {install.error}
                      </span>
                    ) : null}
                  </div>
                )
              ) : null}
              <SettingRow label="Enabled">
                <Switch
                  label="Enabled"
                  checked={draft.enabled !== false}
                  onChange={(value) => setDraft({ ...draft, enabled: value })}
                />
              </SettingRow>
              <div className="providers-actions">
                <button type="button" className="btn primary" onClick={() => void save()}>
                  Save
                </button>
                {isLast ? (
                  <span className="provider-delete-note">
                    At least one provider is required, so this one cannot be deleted.
                  </span>
                ) : confirming ? (
                  <span className="provider-confirm">
                    <span className="provider-confirm-text">Delete provider?</span>
                    <button
                      type="button"
                      className="btn danger"
                      onClick={() => void remove()}
                    >
                      Delete
                    </button>
                    <button
                      type="button"
                      className="btn"
                      onClick={() => setConfirming(false)}
                    >
                      Cancel
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    className="btn danger"
                    onClick={() => {
                      if (confirmDelete) setConfirming(true);
                      else void remove();
                    }}
                  >
                    <IconTrash />
                    Delete
                  </button>
                )}
              </div>
            </>
          ) : (
            <div className="providers-empty">No provider selected.</div>
          )}
        </div>
      </div>
    </section>
  );
}

function AboutSection({
  about,
  providerCount,
  sessionCount,
}: {
  about: { version: string; dataPath: string };
  providerCount: number;
  sessionCount: number;
}) {
  return (
    <section className="settings-section">
      <h2 className="settings-heading">About</h2>
      <SettingRow label="Version">
        <span className="about-value">{about.version}</span>
      </SettingRow>
      <SettingRow label="Data location">
        <span className="about-value mono">{about.dataPath}</span>
      </SettingRow>
      <SettingRow label="Providers">
        <span className="about-value">{providerCount}</span>
      </SettingRow>
      <SettingRow label="Sessions">
        <span className="about-value">{sessionCount}</span>
      </SettingRow>
      <SettingRow label="Repository">
        <a className="about-link" href={REPO_URL} target="_blank" rel="noreferrer">
          github.com/tsulatsitamim/relay
        </a>
      </SettingRow>
    </section>
  );
}

export function SettingsPage({
  section,
  agents,
  settings,
  about,
  sessionCount,
  claudeAdapter,
  onSaveAgent,
  onDeleteAgent,
  onSetSetting,
  onInstallClaudeAdapter,
}: {
  section: SettingsSection;
  agents: AgentConfig[];
  settings: Record<string, string>;
  about: { version: string; dataPath: string };
  sessionCount: number;
  claudeAdapter?: ClaudeAdapterInfo;
  onSaveAgent: (agent: AgentConfig) => Promise<AgentConfig>;
  onDeleteAgent: (id: string) => Promise<void>;
  onSetSetting: (key: string, value: string) => void;
  onInstallClaudeAdapter: (
    onOutput?: (line: string) => void,
  ) => Promise<ClaudeInstallResult>;
}) {
  return (
    <div className="settings">
      <div className="settings-container">
        {section === "general" ? (
          <GeneralSection
            agents={agents}
            settings={settings}
            onSetSetting={onSetSetting}
          />
        ) : section === "providers" ? (
          <ProvidersSection
            agents={agents}
            confirmDelete={settings.confirmDeleteProvider !== "false"}
            claudeAdapter={claudeAdapter}
            onSaveAgent={onSaveAgent}
            onDeleteAgent={onDeleteAgent}
            onInstallClaudeAdapter={onInstallClaudeAdapter}
          />
        ) : (
          <AboutSection
            about={about}
            providerCount={agents.length}
            sessionCount={sessionCount}
          />
        )}
      </div>
    </div>
  );
}
