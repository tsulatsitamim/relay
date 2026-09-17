// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { App } from "../src/renderer/App";
import type { RelayState } from "../src/shared/ipc";
import type { AgentConfig, Session } from "../src/shared/types";

afterEach(() => {
  cleanup();
  delete (window as any).relay;
});

const agentOne: AgentConfig = {
  id: "a1",
  name: "Agent One",
  command: "one",
  args: ["acp"],
};
const agentTwo: AgentConfig = {
  id: "a2",
  name: "Agent Two",
  command: "two",
  args: [],
};

function makeSession(id: string, title: string): Session {
  return {
    id,
    title,
    agentConfigId: "a1",
    agentName: "Agent One",
    workingDirectory: "/tmp/repo",
    status: "idle",
    createdAt: 0,
    updatedAt: 0,
  };
}

function makeState(overrides: Partial<RelayState> = {}): RelayState {
  return {
    sessions: [],
    agents: [],
    recents: [],
    repos: [],
    transcripts: {},
    permissions: [],
    homeDir: "/tmp",
    autoApprove: [],
    agentDefaults: {},
    settings: {},
    about: { version: "1.2.3", dataPath: "/tmp/relay.db" },
    ...overrides,
  };
}

function mount(initial: RelayState) {
  let current = initial;
  const saveAgent = vi.fn(async (agent: AgentConfig) => {
    const saved = agent.id
      ? agent
      : { ...agent, id: `generated-${current.agents.length + 1}` };
    const exists = current.agents.some((item) => item.id === saved.id);
    current = {
      ...current,
      agents: exists
        ? current.agents.map((item) => (item.id === saved.id ? saved : item))
        : [...current.agents, saved],
    };
    return saved;
  });
  const deleteAgent = vi.fn(async (id: string) => {
    current = {
      ...current,
      agents: current.agents.filter((item) => item.id !== id),
    };
  });
  const setSetting = vi.fn(async (key: string, value: string) => {
    current = { ...current, settings: { ...current.settings, [key]: value } };
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
    pickImages: vi.fn().mockResolvedValue([]),
    addRepo: vi.fn().mockResolvedValue([]),
    removeRepo: vi.fn().mockResolvedValue([]),
    saveAgent,
    deleteAgent,
    setSetting,
    setPinned: vi.fn().mockResolvedValue(undefined),
    setArchived: vi.fn().mockResolvedValue(undefined),
    rename: vi.fn().mockResolvedValue(undefined),
    copyDebug: vi.fn().mockResolvedValue(undefined),
    windowControl: vi.fn().mockResolvedValue(undefined),
    openPath: vi.fn().mockResolvedValue(true),
  };
  (window as any).relay = bridge;
  render(<App />);
  return { bridge, saveAgent, deleteAgent, setSetting };
}

async function openSettings(): Promise<void> {
  fireEvent.click(await screen.findByRole("button", { name: "Settings" }));
  await screen.findByRole("button", { name: "Providers" });
}

async function openProviders(): Promise<void> {
  await openSettings();
  fireEvent.click(screen.getByRole("button", { name: "Providers" }));
  await screen.findByRole("button", { name: "Add provider" });
}

function displayName(): HTMLInputElement {
  return screen.getByLabelText("Display name") as HTMLInputElement;
}

describe("App settings entry", () => {
  it("opens settings from the gear and returns to chat with Escape", async () => {
    mount(makeState());
    expect(screen.getByText("New Chat")).toBeTruthy();

    await openSettings();
    expect(screen.getByText("Default provider")).toBeTruthy();
    expect(screen.queryByText("New Chat")).toBeNull();

    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(screen.getByText("New Chat")).toBeTruthy());
    expect(screen.queryByText("Default provider")).toBeNull();
  });

  it("returns to chat when the gear is clicked again", async () => {
    mount(makeState());
    await openSettings();
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    await waitFor(() => expect(screen.getByText("New Chat")).toBeTruthy());
    expect(screen.queryByText("Default provider")).toBeNull();
  });

  it("shows the settings sections in the sidebar instead of the chat list", async () => {
    mount(makeState({ sessions: [makeSession("s1", "Session one")] }));
    await screen.findByText("Session one");

    await openSettings();
    expect(screen.getByRole("button", { name: "General" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Providers" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "About" })).toBeTruthy();
    expect(screen.queryByText("Session one")).toBeNull();
  });

  it("renders the selected section", async () => {
    mount(makeState());
    await openSettings();
    expect(screen.getByText("Default provider")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Providers" }));
    expect(await screen.findByRole("button", { name: "Add provider" })).toBeTruthy();
    expect(screen.queryByText("Default provider")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "About" }));
    expect(await screen.findByText("1.2.3")).toBeTruthy();
  });
});

describe("Providers settings", () => {
  it("lists providers with their command and opens the selected editor", async () => {
    mount(makeState({ agents: [agentOne, agentTwo] }));
    await openProviders();

    expect(screen.getByText("Agent One")).toBeTruthy();
    expect(screen.getByText("one")).toBeTruthy();
    expect(screen.getByText("Agent Two")).toBeTruthy();
    expect(displayName().value).toBe("Agent One");

    fireEvent.click(screen.getByText("Agent Two"));
    await waitFor(() => expect(displayName().value).toBe("Agent Two"));
    expect(screen.getByLabelText("Command")).toHaveProperty("value", "two");
  });

  it("persists an edited provider through the bridge", async () => {
    const { saveAgent } = mount(makeState({ agents: [agentOne, agentTwo] }));
    await openProviders();

    fireEvent.change(displayName(), { target: { value: "Renamed" } });
    fireEvent.change(screen.getByLabelText("Command"), {
      target: { value: "renamed-cmd" },
    });
    fireEvent.change(screen.getByLabelText("Args"), {
      target: { value: "acp\n--verbose" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(saveAgent).toHaveBeenCalled());
    expect(saveAgent.mock.calls[0]?.[0]).toMatchObject({
      id: "a1",
      name: "Renamed",
      command: "renamed-cmd",
      args: ["acp", "--verbose"],
    });
  });

  it("appends a provider added from the toolbar", async () => {
    mount(makeState({ agents: [agentOne] }));
    await openProviders();
    expect(screen.queryByText("New provider")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Add provider" }));
    expect(await screen.findByText("New provider")).toBeTruthy();
  });

  it("asks for inline confirmation before deleting when the setting is on", async () => {
    const { deleteAgent } = mount(
      makeState({
        agents: [agentOne, agentTwo],
        settings: { confirmDeleteProvider: "true" },
      }),
    );
    await openProviders();

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(await screen.findByText("Delete provider?")).toBeTruthy();
    expect(deleteAgent).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(deleteAgent).toHaveBeenCalledWith("a1"));
  });

  it("deletes immediately when the confirmation setting is off", async () => {
    const { deleteAgent } = mount(
      makeState({
        agents: [agentOne, agentTwo],
        settings: { confirmDeleteProvider: "false" },
      }),
    );
    await openProviders();

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(deleteAgent).toHaveBeenCalledWith("a1"));
    expect(screen.queryByText("Delete provider?")).toBeNull();
  });

  it("does not allow deleting the last provider", async () => {
    mount(
      makeState({
        agents: [agentOne],
        settings: { confirmDeleteProvider: "true" },
      }),
    );
    await openProviders();

    expect(screen.queryByRole("button", { name: "Delete" })).toBeNull();
    expect(
      screen.getByText(/cannot be deleted/i),
    ).toBeTruthy();
  });

  it("edits environment rows and drops blank keys on save", async () => {
    const { saveAgent } = mount(makeState({ agents: [agentOne, agentTwo] }));
    await openProviders();

    fireEvent.click(screen.getByRole("button", { name: "Add variable" }));
    fireEvent.change(screen.getByLabelText("Environment key 1"), {
      target: { value: "API_KEY" },
    });
    fireEvent.change(screen.getByLabelText("Environment value 1"), {
      target: { value: "secret" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add variable" }));
    fireEvent.change(screen.getByLabelText("Environment key 2"), {
      target: { value: "  " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(saveAgent).toHaveBeenCalled());
    expect(saveAgent.mock.calls[0]?.[0]).toMatchObject({
      env: { API_KEY: "secret" },
    });
  });

  it("hides a disabled provider from the home composer", async () => {
    const { saveAgent } = mount(makeState({ agents: [agentOne, agentTwo] }));
    await openProviders();

    fireEvent.click(screen.getByRole("switch", { name: "Agent Two enabled" }));
    await waitFor(() =>
      expect(saveAgent).toHaveBeenCalledWith(
        expect.objectContaining({ id: "a2", enabled: false }),
      ),
    );

    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    await waitFor(() => {
      const select = document.querySelector(
        ".composer-bar select",
      ) as HTMLSelectElement;
      expect(Array.from(select.options).map((option) => option.textContent)).toEqual([
        "Pilih agent",
        "Agent One",
      ]);
    });
  });
});

describe("General settings", () => {
  it("persists the default provider and uses it on the home composer", async () => {
    const { setSetting } = mount(makeState({ agents: [agentOne, agentTwo] }));
    await openSettings();

    const select = screen.getByLabelText("Default provider") as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "a2" } });
    await waitFor(() =>
      expect(setSetting).toHaveBeenCalledWith("defaultAgentId", "a2"),
    );
    expect(select.value).toBe("a2");

    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    await waitFor(() => {
      const composer = document.querySelector(
        ".composer-bar select",
      ) as HTMLSelectElement;
      expect(composer.value).toBe("a2");
    });
  });

  it("persists the delete confirmation toggle", async () => {
    const { setSetting } = mount(makeState({ agents: [agentOne] }));
    await openSettings();

    fireEvent.click(
      screen.getByRole("switch", { name: "Confirm before deleting a provider" }),
    );
    await waitFor(() =>
      expect(setSetting).toHaveBeenCalledWith("confirmDeleteProvider", "false"),
    );
  });
});

describe("About settings", () => {
  it("reports the version, data path, and counts from state", async () => {
    mount(
      makeState({
        agents: [agentOne, agentTwo],
        sessions: [
          makeSession("s1", "One"),
          makeSession("s2", "Two"),
          makeSession("s3", "Three"),
        ],
        about: { version: "4.5.6", dataPath: "/tmp/relay.db" },
      }),
    );
    await openSettings();
    fireEvent.click(screen.getByRole("button", { name: "About" }));

    expect(await screen.findByText("4.5.6")).toBeTruthy();
    expect(screen.getByText("/tmp/relay.db")).toBeTruthy();
    expect(screen.getByText("2")).toBeTruthy();
    expect(screen.getByText("3")).toBeTruthy();
    expect(screen.getByRole("link", { name: /github\.com/ })).toBeTruthy();
  });
});
