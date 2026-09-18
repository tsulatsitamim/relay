import { useEffect, useState } from "react";
import {
  mcpServersFrom,
  type McpServerConfig,
} from "../shared/mcp.ts";
import { IconPlus, IconTrash, IconX } from "./icons";

type DraftServer = McpServerConfig;

function cloneServers(servers: McpServerConfig[]): McpServerConfig[] {
  return servers.map((server) =>
    server.kind === "stdio"
      ? {
          ...server,
          args: [...server.args],
          env: server.env.map((entry) => ({ ...entry })),
        }
      : {
          ...server,
          headers: server.headers.map((entry) => ({ ...entry })),
        },
  );
}

function blankServer(): McpServerConfig {
  return { kind: "stdio", name: "New server", command: "", args: [], env: [] };
}

export function McpServers({
  servers,
  confirmDelete,
  onSave,
}: {
  servers: McpServerConfig[];
  confirmDelete: boolean;
  onSave: (servers: McpServerConfig[]) => Promise<McpServerConfig[]>;
}) {
  const [drafts, setDrafts] = useState<DraftServer[]>(() =>
    cloneServers(servers),
  );
  const [selected, setSelected] = useState<number | null>(
    servers.length ? 0 : null,
  );
  const [confirming, setConfirming] = useState<number | null>(null);

  useEffect(() => {
    setDrafts(cloneServers(servers));
    setSelected((current) => {
      if (servers.length === 0) return null;
      if (current === null || current >= servers.length) return 0;
      return current;
    });
    setConfirming(null);
  }, [servers]);

  const draft = selected === null ? null : (drafts[selected] ?? null);

  const updateDraft = (next: DraftServer) => {
    setDrafts((list) => list.map((item, i) => (i === selected ? next : item)));
  };

  const changeKind = (kind: McpServerConfig["kind"]) => {
    if (!draft) return;
    if (kind === "stdio") {
      updateDraft({ kind, name: draft.name, command: "", args: [], env: [] });
    } else {
      updateDraft({ kind, name: draft.name, url: "", headers: [] });
    }
  };

  const persist = async (next: McpServerConfig[]) => {
    const saved = await onSave(mcpServersFrom(next));
    setDrafts(cloneServers(saved));
    setSelected(saved.length ? Math.min(selected ?? 0, saved.length - 1) : null);
    setConfirming(null);
  };

  const save = () => void persist(drafts);

  const add = () => {
    setDrafts((list) => [...list, blankServer()]);
    setSelected(drafts.length);
    setConfirming(null);
  };

  const remove = (index: number) => persist(drafts.filter((_, i) => i !== index));

  return (
    <section className="settings-section">
      <div className="providers-toolbar">
        <h2 className="settings-heading">MCP servers</h2>
        <button type="button" className="btn" onClick={add}>
          <IconPlus />
          Add server
        </button>
      </div>
      <div className="providers-card">
        <div
          className="providers-list"
          role="listbox"
          aria-label="Configured MCP servers"
        >
          {drafts.length === 0 ? (
            <div className="providers-empty">No MCP servers configured.</div>
          ) : null}
          {drafts.map((server, index) => (
            <div
              key={index}
              role="option"
              tabIndex={0}
              aria-selected={index === selected}
              aria-label={`${server.name} ${server.kind}`}
              className={`provider-row${index === selected ? " active" : ""}`}
              onClick={() => {
                setSelected(index);
                setConfirming(null);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  setSelected(index);
                  setConfirming(null);
                }
              }}
            >
              <span className="provider-row-text">
                <span className="provider-row-name">{server.name}</span>
                <span className="mcp-badge">{server.kind}</span>
              </span>
              <span
                className="provider-row-switch"
                onClick={(event) => event.stopPropagation()}
              >
                {confirming === index ? (
                  <span className="provider-confirm">
                    <span className="provider-confirm-text">Delete server?</span>
                    <button
                      type="button"
                      className="btn danger"
                      onClick={() => void remove(index)}
                    >
                      Delete
                    </button>
                    <button
                      type="button"
                      className="btn"
                      onClick={() => setConfirming(null)}
                    >
                      Cancel
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    className="btn danger"
                    aria-label={`Delete ${server.name}`}
                    onClick={() => {
                      if (confirmDelete) setConfirming(index);
                      else void remove(index);
                    }}
                  >
                    <IconTrash />
                  </button>
                )}
              </span>
            </div>
          ))}
        </div>
        <div className="providers-editor">
          {draft ? (
            <>
              <label className="field">
                <span className="field-label">Name</span>
                <input
                  className="field-input"
                  aria-label="Name"
                  value={draft.name}
                  onChange={(event) =>
                    updateDraft({ ...draft, name: event.target.value })
                  }
                />
              </label>
              <label className="field">
                <span className="field-label">Transport</span>
                <select
                  className="field-input"
                  aria-label="Transport"
                  value={draft.kind}
                  onChange={(event) =>
                    changeKind(event.target.value as McpServerConfig["kind"])
                  }
                >
                  <option value="stdio">stdio</option>
                  <option value="http">http</option>
                  <option value="sse">sse</option>
                </select>
              </label>
              {draft.kind === "stdio" ? (
                <>
                  <label className="field">
                    <span className="field-label">Command</span>
                    <input
                      className="field-input"
                      aria-label="Command"
                      value={draft.command}
                      onChange={(event) =>
                        updateDraft({ ...draft, command: event.target.value })
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
                      value={draft.args.join("\n")}
                      onChange={(event) =>
                        updateDraft({
                          ...draft,
                          args: event.target.value.split("\n"),
                        })
                      }
                    />
                  </label>
                  <div className="field">
                    <span className="field-label env-label">
                      Environment
                      <button
                        type="button"
                        className="icon-btn"
                        aria-label="Add environment variable"
                        title="Add variable"
                        onClick={() =>
                          updateDraft({
                            ...draft,
                            env: [...draft.env, { name: "", value: "" }],
                          })
                        }
                      >
                        <IconPlus />
                      </button>
                    </span>
                    <div className="mcp-rows" role="group" aria-label="Environment">
                      {draft.env.map((row, index) => (
                        <div className="env-row" key={index}>
                          <input
                            className="field-input"
                            aria-label={`Environment name ${index + 1}`}
                            placeholder="NAME"
                            value={row.name}
                            onChange={(event) =>
                              updateDraft({
                                ...draft,
                                env: draft.env.map((item, i) =>
                                  i === index
                                    ? { ...item, name: event.target.value }
                                    : item,
                                ),
                              })
                            }
                          />
                          <input
                            className="field-input"
                            aria-label={`Environment value ${index + 1}`}
                            placeholder="value"
                            value={row.value}
                            onChange={(event) =>
                              updateDraft({
                                ...draft,
                                env: draft.env.map((item, i) =>
                                  i === index
                                    ? { ...item, value: event.target.value }
                                    : item,
                                ),
                              })
                            }
                          />
                          <button
                            type="button"
                            className="icon-btn"
                            aria-label={`Remove environment variable ${index + 1}`}
                            title="Remove variable"
                            onClick={() =>
                              updateDraft({
                                ...draft,
                                env: draft.env.filter((_, i) => i !== index),
                              })
                            }
                          >
                            <IconX />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <label className="field">
                    <span className="field-label">URL</span>
                    <input
                      className="field-input"
                      aria-label="URL"
                      value={draft.url}
                      onChange={(event) =>
                        updateDraft({ ...draft, url: event.target.value })
                      }
                    />
                  </label>
                  <div className="field">
                    <span className="field-label env-label">
                      Headers
                      <button
                        type="button"
                        className="icon-btn"
                        aria-label="Add header"
                        title="Add header"
                        onClick={() =>
                          updateDraft({
                            ...draft,
                            headers: [...draft.headers, { name: "", value: "" }],
                          })
                        }
                      >
                        <IconPlus />
                      </button>
                    </span>
                    <div className="mcp-rows" role="group" aria-label="Headers">
                      {draft.headers.map((row, index) => (
                        <div className="env-row" key={index}>
                          <input
                            className="field-input"
                            aria-label={`Header name ${index + 1}`}
                            placeholder="NAME"
                            value={row.name}
                            onChange={(event) =>
                              updateDraft({
                                ...draft,
                                headers: draft.headers.map((item, i) =>
                                  i === index
                                    ? { ...item, name: event.target.value }
                                    : item,
                                ),
                              })
                            }
                          />
                          <input
                            className="field-input"
                            aria-label={`Header value ${index + 1}`}
                            placeholder="value"
                            value={row.value}
                            onChange={(event) =>
                              updateDraft({
                                ...draft,
                                headers: draft.headers.map((item, i) =>
                                  i === index
                                    ? { ...item, value: event.target.value }
                                    : item,
                                ),
                              })
                            }
                          />
                          <button
                            type="button"
                            className="icon-btn"
                            aria-label={`Remove header ${index + 1}`}
                            title="Remove header"
                            onClick={() =>
                              updateDraft({
                                ...draft,
                                headers: draft.headers.filter(
                                  (_, i) => i !== index,
                                ),
                              })
                            }
                          >
                            <IconX />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
              <div className="providers-actions">
                <button
                  type="button"
                  className="btn primary"
                  onClick={save}
                >
                  Save
                </button>
              </div>
            </>
          ) : (
            <div className="providers-empty">No server selected.</div>
          )}
        </div>
      </div>
    </section>
  );
}
