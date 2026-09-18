// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { App } from "../src/renderer/App";
import type { RelayState } from "../src/shared/ipc";
import {
  mcpServersFrom,
  type McpServerConfig,
} from "../src/shared/mcp";

afterEach(() => {
  cleanup();
  delete (window as any).relay;
});

const stdioFs: McpServerConfig = {
  kind: "stdio",
  name: "fs",
  command: "npx",
  args: ["-y", "server-fs"],
  env: [{ name: "ROOT", value: "/tmp" }],
};

const httpRemote: McpServerConfig = {
  kind: "http",
  name: "remote",
  url: "https://example.com/mcp",
  headers: [{ name: "Authorization", value: "Bearer x" }],
};

function makeState(overrides: Partial<RelayState> = {}): RelayState {
  return {
    sessions: [],
    agents: [],
    recents: [],
    repos: [],
    transcripts: {},
    diffComments: {},
    permissions: [],
    homeDir: "/tmp",
    autoApprove: [],
    agentDefaults: {},
    settings: {},
    mcpServers: [],
    about: { version: "1.2.3", dataPath: "/tmp/relay.db" },
    ...overrides,
  };
}

function mount(initial: RelayState) {
  let current = initial;
  const setMcpServers = vi.fn(async (servers: McpServerConfig[]) => {
    const sanitized = mcpServersFrom(servers);
    current = { ...current, mcpServers: sanitized };
    return sanitized;
  });
  const bridge = {
    getState: vi.fn(async () => current),
    subscribe: vi.fn(() => () => {}),
    create: vi.fn(),
    send: vi.fn().mockResolvedValue(undefined),
    truncate: vi.fn().mockResolvedValue([]),
    cancel: vi.fn().mockResolvedValue(undefined),
    permission: vi.fn().mockResolvedValue(undefined),
    setAutoApprove: vi.fn().mockResolvedValue(undefined),
    restart: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    pickDirectory: vi.fn().mockResolvedValue(null),
    listFiles: vi.fn().mockResolvedValue([]),
    listSkills: vi.fn().mockResolvedValue([]),
    branchInfo: vi.fn().mockResolvedValue(null),
    pickImages: vi.fn().mockResolvedValue([]),
    addRepo: vi.fn().mockResolvedValue([]),
    removeRepo: vi.fn().mockResolvedValue([]),
    saveAgent: vi.fn(),
    deleteAgent: vi.fn(),
    setSetting: vi.fn().mockResolvedValue(undefined),
    setMcpServers,
    installClaudeAdapter: vi.fn(),
    setPinned: vi.fn().mockResolvedValue(undefined),
    setArchived: vi.fn().mockResolvedValue(undefined),
    rename: vi.fn().mockResolvedValue(undefined),
    copyDebug: vi.fn().mockResolvedValue(undefined),
    windowControl: vi.fn().mockResolvedValue(undefined),
    openPath: vi.fn().mockResolvedValue(true),
  };
  (window as any).relay = bridge;
  render(<App />);
  return { bridge, setMcpServers };
}

async function openMcp(): Promise<void> {
  fireEvent.click(await screen.findByRole("button", { name: "Settings" }));
  fireEvent.click(await screen.findByRole("button", { name: "MCP servers" }));
  await screen.findByRole("button", { name: /Add server/ });
}

function textbox(label: string): HTMLInputElement {
  return screen.getByLabelText(label) as HTMLInputElement;
}

describe("MCP servers settings", () => {
  it("lists the configured servers and opens the first in the editor", async () => {
    mount(makeState({ mcpServers: [stdioFs, httpRemote] }));
    await openMcp();

    const list = screen.getByRole("listbox", {
      name: "Configured MCP servers",
    });
    expect(within(list).getAllByRole("option")).toHaveLength(2);
    expect(within(list).getByRole("option", { name: "fs stdio" })).toBeTruthy();
    expect(
      within(list).getByRole("option", { name: "remote http" }),
    ).toBeTruthy();
    expect(textbox("Name").value).toBe("fs");
    expect(textbox("Command").value).toBe("npx");
  });

  it("swaps the conditional fields when the transport changes", async () => {
    mount(makeState({ mcpServers: [stdioFs] }));
    await openMcp();

    expect(screen.queryByLabelText("Command")).toBeTruthy();
    expect(screen.queryByLabelText("URL")).toBeNull();

    fireEvent.change(screen.getByLabelText("Transport"), {
      target: { value: "http" },
    });

    expect(await screen.findByLabelText("URL")).toBeTruthy();
    expect(screen.queryByLabelText("Command")).toBeNull();
    expect(screen.queryByLabelText("Headers")).toBeTruthy();
  });

  it("saves the sanitized list through the bridge", async () => {
    const { setMcpServers } = mount(makeState({ mcpServers: [stdioFs] }));
    await openMcp();

    fireEvent.change(textbox("Name"), { target: { value: "  filesystem  " } });
    fireEvent.change(textbox("Command"), { target: { value: "  npx  " } });
    fireEvent.click(screen.getByRole("button", { name: "Add environment variable" }));
    fireEvent.change(textbox("Environment name 2"), {
      target: { value: "  " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(setMcpServers).toHaveBeenCalledTimes(1));
    expect(setMcpServers.mock.calls[0]?.[0]).toEqual([
      {
        kind: "stdio",
        name: "filesystem",
        command: "npx",
        args: ["-y", "server-fs"],
        env: [{ name: "ROOT", value: "/tmp" }],
      },
    ]);
  });

  it("asks for inline confirmation before deleting when the setting is on", async () => {
    const { setMcpServers } = mount(
      makeState({
        mcpServers: [stdioFs, httpRemote],
        settings: { confirmDeleteProvider: "true" },
      }),
    );
    await openMcp();

    fireEvent.click(screen.getByRole("button", { name: "Delete fs" }));
    expect(await screen.findByText("Delete server?")).toBeTruthy();
    expect(setMcpServers).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(setMcpServers).toHaveBeenCalledTimes(1));
    expect(setMcpServers.mock.calls[0]?.[0]).toEqual([httpRemote]);
  });

  it("deletes immediately when the confirmation setting is off", async () => {
    const { setMcpServers } = mount(
      makeState({
        mcpServers: [stdioFs, httpRemote],
        settings: { confirmDeleteProvider: "false" },
      }),
    );
    await openMcp();

    fireEvent.click(screen.getByRole("button", { name: "Delete fs" }));
    await waitFor(() => expect(setMcpServers).toHaveBeenCalledTimes(1));
    expect(screen.queryByText("Delete server?")).toBeNull();
    expect(setMcpServers.mock.calls[0]?.[0]).toEqual([httpRemote]);
  });
});
