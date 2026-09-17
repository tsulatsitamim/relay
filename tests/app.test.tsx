// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { App } from "../src/renderer/App";
import type { RelayState } from "../src/shared/ipc";
import type { AgentConfig, PromptAttachment, Repo, Session } from "../src/shared/types";

afterEach(() => {
  cleanup();
  delete (window as any).relay;
});

const repo = { path: "/tmp/repo", name: "repo", addedAt: 0 };
const otherRepo = { path: "/tmp/other", name: "other", addedAt: 0 };
const blankRepo = { path: "/tmp/blank", name: "blank", addedAt: 0 };
const agents: AgentConfig[] = [
  { id: "a1", name: "Agent One", command: "one", args: [] },
  { id: "a2", name: "Agent Two", command: "two", args: [] },
];

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: "s1",
    title: "Session one",
    agentConfigId: "a1",
    agentName: "Fake",
    workingDirectory: "/tmp/repo",
    status: "idle",
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

function stateWith(
  sessions: Session[],
  transcripts: RelayState["transcripts"] = {},
  autoApprove: string[] = [],
  agentDefaults: Record<string, string> = {},
  repos: Repo[] = [repo],
): RelayState {
  return {
    sessions,
    agents,
    recents: [],
    repos,
    transcripts,
    permissions: [],
    homeDir: "/tmp",
    autoApprove,
    agentDefaults,
    settings: {},
    about: { version: "0.0.0", dataPath: "/tmp/relay.db" },
  };
}

function mount(
  sessions: Session[],
  transcripts: RelayState["transcripts"] = {},
  skills: string[] = [],
  autoApprove: string[] = [],
  agentDefaults: Record<string, string> = {},
  repos: Repo[] = [repo],
) {
  let listener: ((event: unknown) => void) | null = null;
  const send = vi.fn().mockResolvedValue(undefined);
  const truncate = vi.fn().mockResolvedValue([]);
  const bridge = {
    getState: vi
      .fn()
      .mockResolvedValue(stateWith(sessions, transcripts, autoApprove, agentDefaults, repos)),
    subscribe: vi.fn((fn: (event: unknown) => void) => {
      listener = fn;
      return () => {
        listener = null;
      };
    }),
    create: vi.fn().mockResolvedValue(makeSession()),
    send,
    truncate,
    cancel: vi.fn().mockResolvedValue(undefined),
    permission: vi.fn().mockResolvedValue(undefined),
    setAutoApprove: vi.fn().mockResolvedValue(undefined),
    restart: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    pickDirectory: vi.fn().mockResolvedValue(null),
    listFiles: vi.fn().mockResolvedValue([]),
    listSkills: vi.fn().mockResolvedValue(skills),
    branchInfo: vi.fn().mockResolvedValue(null),
    pickImages: vi.fn().mockResolvedValue([]),
    addRepo: vi.fn().mockResolvedValue([]),
    removeRepo: vi.fn().mockResolvedValue([]),
    setPinned: vi.fn().mockResolvedValue(undefined),
    setArchived: vi.fn().mockResolvedValue(undefined),
    rename: vi.fn().mockResolvedValue(undefined),
    copyDebug: vi.fn().mockResolvedValue(undefined),
    windowControl: vi.fn().mockResolvedValue(undefined),
    openPath: vi.fn().mockResolvedValue(true),
  };
  (window as any).relay = bridge;
  render(<App />);
  return {
    bridge,
    send,
    truncate,
    emit: (event: unknown) => listener?.(event),
  };
}

async function openSession(title: string): Promise<HTMLTextAreaElement> {
  const row = await screen.findByText(title);
  fireEvent.click(row);
  return (await screen.findByRole("textbox")) as HTMLTextAreaElement;
}

describe("App queue drain", () => {
  it("drains more than one queued prompt after the agent goes idle", async () => {
    const { send, emit } = mount([makeSession({ status: "working" })]);
    const box = await openSession("Session one");

    fireEvent.change(box, { target: { value: "first" } });
    fireEvent.keyDown(box, { key: "Enter" });
    fireEvent.change(box, { target: { value: "second" } });
    fireEvent.keyDown(box, { key: "Enter" });

    await act(async () => {
      emit({ type: "sessions", sessions: [makeSession({ status: "idle" })] });
    });

    await waitFor(() => {
      expect(send.mock.calls.length).toBe(2);
    });
    expect(send.mock.calls.map((call) => call[1])).toEqual(["first", "second"]);
  });
});

describe("App conversation find", () => {
  const events = [
    { id: "e1", kind: "user", payload: { text: "alpha beta" } },
    { id: "e2", kind: "agent_message", payload: { text: "gamma alpha" } },
  ] as RelayState["transcripts"][string];

  it("opens the find bar with Cmd+F and closes it with Escape", async () => {
    mount([makeSession()], { s1: events });
    await openSession("Session one");

    fireEvent.keyDown(window, { key: "f", metaKey: true });
    expect(await screen.findByLabelText("Find in conversation")).toBeTruthy();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByLabelText("Find in conversation")).toBeNull();
  });

  it("counts matches and cycles the active match with Next", async () => {
    mount([makeSession()], { s1: events });
    await openSession("Session one");
    fireEvent.keyDown(window, { key: "f", metaKey: true });
    fireEvent.change(screen.getByLabelText("Find in conversation"), {
      target: { value: "alpha" },
    });

    expect(screen.getByText("1 of 2")).toBeTruthy();
    expect(
      document.querySelector('[data-event-id="e1"]')?.classList.contains("find-active"),
    ).toBe(true);

    fireEvent.click(screen.getByLabelText("Next match"));
    expect(screen.getByText("2 of 2")).toBeTruthy();
    expect(
      document.querySelector('[data-event-id="e2"]')?.classList.contains("find-active"),
    ).toBe(true);
    expect(
      document.querySelector('[data-event-id="e1"]')?.classList.contains("find-active"),
    ).toBe(false);
  });

  it("shows 0 of 0 when nothing matches", async () => {
    mount([makeSession()], { s1: events });
    await openSession("Session one");
    fireEvent.keyDown(window, { key: "f", metaKey: true });
    expect(screen.getByText("0 of 0")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Find in conversation"), {
      target: { value: "zzz" },
    });
    expect(screen.getByText("0 of 0")).toBeTruthy();
  });
});

describe("App clearing the queue", () => {
  it("empties the rendered chips for the selected session", async () => {
    mount([makeSession({ status: "working" })]);
    const box = await openSession("Session one");

    fireEvent.change(box, { target: { value: "first" } });
    fireEvent.keyDown(box, { key: "Enter" });
    fireEvent.change(box, { target: { value: "second" } });
    fireEvent.keyDown(box, { key: "Enter" });
    expect(document.querySelectorAll(".queued-chip")).toHaveLength(2);

    fireEvent.click(screen.getByLabelText("Clear queued messages"));
    expect(document.querySelectorAll(".queued-chip")).toHaveLength(0);
  });
});

describe("App queued message actions", () => {
  async function enqueueTwo(box: HTMLTextAreaElement) {
    fireEvent.change(box, { target: { value: "first" } });
    fireEvent.keyDown(box, { key: "Enter" });
    fireEvent.change(box, { target: { value: "second" } });
    fireEvent.keyDown(box, { key: "Enter" });
  }

  it("moves an edited queued message into the composer and removes its chip", async () => {
    mount([makeSession({ status: "working" })]);
    const box = await openSession("Session one");
    await enqueueTwo(box);
    expect(document.querySelectorAll(".queued-chip")).toHaveLength(2);

    fireEvent.click(screen.getAllByLabelText("Edit queued message")[0]);

    await waitFor(() => expect(box.value).toBe("first"));
    expect(document.querySelectorAll(".queued-chip")).toHaveLength(1);
    expect(document.activeElement).toBe(box);
  });

  it("sends the promoted message first once the session is idle", async () => {
    const { send, emit } = mount([makeSession({ status: "working" })]);
    const box = await openSession("Session one");
    await enqueueTwo(box);

    fireEvent.click(screen.getAllByLabelText("Send queued message next")[1]);
    const chips = Array.from(
      document.querySelectorAll(".queued-chip .queued-text"),
    ).map((node) => node.textContent);
    expect(chips).toEqual(["second", "first"]);

    await act(async () => {
      emit({ type: "sessions", sessions: [makeSession({ status: "idle" })] });
    });
    await waitFor(() => expect(send.mock.calls.length).toBeGreaterThan(0));
    expect(send.mock.calls[0]?.slice(0, 2)).toEqual(["s1", "second"]);
  });
});

describe("App multi-command turns", () => {
  it("sends each leading command as its own turn", async () => {
    const { send } = mount([makeSession()], {
      s1: [
        {
          id: "e1",
          kind: "commands",
          payload: {
            commands: [
              { name: "init", description: "guided setup" },
              { name: "review", description: "review changes" },
            ],
          },
        },
      ],
    });
    const box = await openSession("Session one");
    fireEvent.change(box, { target: { value: "/init /review hello" } });
    fireEvent.keyDown(box, { key: "Enter" });

    await waitFor(() => {
      expect(send.mock.calls.map((call) => call[1])).toEqual([
        "/init",
        "/review hello",
      ]);
    });
  });

  it("keeps skills in one turn", async () => {
    const { send } = mount(
      [makeSession()],
      {
        s1: [
          {
            id: "e1",
            kind: "commands",
            payload: {
              commands: [
                { name: "brainstorming", description: "explore" },
                { name: "grill-me", description: "grill" },
              ],
            },
          },
        ],
      },
      ["brainstorming", "grill-me"],
    );
    const box = await openSession("Session one");
    await waitFor(() => expect(box).toBeTruthy());
    fireEvent.change(box, {
      target: { value: "/brainstorming /grill-me plan A" },
    });
    fireEvent.keyDown(box, { key: "Enter" });

    await waitFor(() => {
      expect(send.mock.calls.map((call) => call[1])).toEqual([
        "/brainstorming /grill-me plan A",
      ]);
    });
  });
});

describe("App composer session isolation", () => {
  it("clears the draft when switching sessions", async () => {
    const { bridge } = mount([
      makeSession({ id: "s1", title: "Session one" }),
      makeSession({ id: "s2", title: "Session two" }),
    ]);
    await screen.findByText("Session one");
    const box = await openSession("Session one");
    fireEvent.change(box, { target: { value: "draft one" } });
    expect(box.value).toBe("draft one");

    fireEvent.click(screen.getByText("Session two"));
    const next = (await screen.findByRole("textbox")) as HTMLTextAreaElement;
    expect(next.value).toBe("");
    expect(bridge.send).not.toHaveBeenCalled();
  });
});

describe("App edit-resend isolation", () => {
  it("does not leak an edited draft into another session's composer", async () => {
    const { bridge } = mount(
      [
        makeSession({ id: "s1", title: "Session one", status: "working" }),
        makeSession({ id: "s2", title: "Session two" }),
      ],
      {
        s1: [{ id: "e1", kind: "user", payload: { text: "hello there" } }],
      },
    );
    await screen.findByText("Session one");
    const box = await openSession("Session one");

    await screen.findByText("hello there");
    fireEvent.click(document.querySelector(".msg.user")!);
    const edit = (await screen.findByRole("textbox", {
      name: "Edit message text",
    })) as HTMLTextAreaElement;
    fireEvent.change(edit, { target: { value: "hello there edited" } });
    fireEvent.click(screen.getByRole("button", { name: "Save edit" }));
    await waitFor(() => expect(box.value).toBe("hello there edited"));

    fireEvent.click(screen.getByText("Session two"));
    const next = (await screen.findByRole("textbox")) as HTMLTextAreaElement;
    expect(next.value).toBe("");
    expect(bridge.send).not.toHaveBeenCalled();
  });
});

describe("App regenerate removal", () => {
  it("no longer offers a regenerate action for the last agent message", async () => {
    mount([makeSession()], {
      s1: [
        { id: "u1", kind: "user", payload: { text: "first question" } },
        { id: "a1", kind: "agent_message", payload: { text: "first answer" } },
      ],
    });
    await openSession("Session one");
    expect(
      screen.queryByRole("button", { name: "Regenerate answer" }),
    ).toBeNull();
  });
});

describe("App edit resend", () => {
  it("truncates and resends immediately when an inline edit is saved on an idle session", async () => {
    const { send, truncate } = mount([makeSession()], {
      s1: [
        { id: "u1", kind: "user", payload: { text: "original" } },
        { id: "a1", kind: "agent_message", payload: { text: "answer" } },
      ],
    });
    const box = await openSession("Session one");
    await screen.findByText("original");
    fireEvent.click(document.querySelector(".msg.user")!);
    const edit = (await screen.findByRole("textbox", {
      name: "Edit message text",
    })) as HTMLTextAreaElement;
    fireEvent.change(edit, { target: { value: "edited" } });
    fireEvent.keyDown(edit, { key: "Enter" });

    await waitFor(() => expect(send).toHaveBeenCalled());
    expect(truncate).toHaveBeenCalledWith("s1", "u1");
    expect(send.mock.calls[0]?.slice(0, 2)).toEqual(["s1", "edited"]);
    await waitFor(() => expect(box.value).toBe(""));
  });

  it("holds an inline edit in the composer without sending when the session is working", async () => {
    const { send, truncate } = mount([makeSession({ status: "working" })], {
      s1: [{ id: "u1", kind: "user", payload: { text: "original" } }],
    });
    const box = await openSession("Session one");
    fireEvent.click(document.querySelector(".msg.user")!);
    const edit = (await screen.findByRole("textbox", {
      name: "Edit message text",
    })) as HTMLTextAreaElement;
    fireEvent.change(edit, { target: { value: "edited later" } });
    fireEvent.click(screen.getByRole("button", { name: "Save edit" }));

    await waitFor(() => expect(box.value).toBe("edited later"));
    expect(truncate).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it("does not truncate a plain send", async () => {
    const { send, truncate } = mount([makeSession()], {
      s1: [{ id: "u1", kind: "user", payload: { text: "original" } }],
    });
    const box = await openSession("Session one");
    fireEvent.change(box, { target: { value: "plain" } });
    fireEvent.keyDown(box, { key: "Enter" });

    await waitFor(() => expect(send).toHaveBeenCalled());
    expect(truncate).not.toHaveBeenCalled();
  });
});

describe("App sidebar markup", () => {
  it("does not nest buttons inside other buttons", async () => {
    mount([makeSession({ id: "s1", title: "Session one" })]);
    await screen.findByText("Session one");
    const buttons = Array.from(document.querySelectorAll("button"));
    const nested = buttons.filter((button) => button.querySelector("button"));
    expect(nested).toEqual([]);
  });
});

describe("App retry", () => {
  it("resends the original attachments when retrying a failed prompt", async () => {
    const attachment: PromptAttachment = {
      name: "shot.png",
      mimeType: "image/png",
      data: "AAAA",
    };
    const { send, bridge } = mount([makeSession({ id: "s1", title: "Session one" })]);
    send.mockRejectedValueOnce(new Error("boom")).mockResolvedValue(undefined);
    bridge.pickImages.mockResolvedValue([attachment]);

    const box = await openSession("Session one");
    fireEvent.click(screen.getByLabelText("Attach image"));
    expect(await screen.findByText("shot.png")).toBeTruthy();
    fireEvent.change(box, { target: { value: "look" } });
    fireEvent.keyDown(box, { key: "Enter" });

    const retry = await screen.findByRole("button", { name: "Retry" });
    fireEvent.click(retry);

    await waitFor(() => {
      expect(send.mock.calls.length).toBe(2);
    });
    expect(send.mock.calls[1]?.slice(0, 3)).toEqual(["s1", "look", [attachment]]);
  });
});

describe("App working indicator", () => {
  it("shows a working row as soon as a prompt is sent", async () => {
    const { send } = mount([makeSession()]);
    send.mockImplementation(
      () =>
        new Promise<void>(() => {
          /* stays pending so the optimistic indicator is observable */
        }),
    );
    const box = await openSession("Session one");
    fireEvent.change(box, { target: { value: "hello" } });
    fireEvent.keyDown(box, { key: "Enter" });

    await waitFor(() => {
      expect(document.querySelector(".working-row")).toBeTruthy();
    });
  });

  it("hides the working row when the session goes idle", async () => {
    const { emit } = mount([makeSession()]);
    await openSession("Session one");
    act(() => {
      emit({
        type: "sessions",
        sessions: [makeSession({ status: "working", lastPromptAt: Date.now() })],
      });
    });
    await waitFor(() => {
      expect(document.querySelector(".working-row")).toBeTruthy();
    });

    act(() => {
      emit({ type: "sessions", sessions: [makeSession()] });
    });
    await waitFor(() => {
      expect(document.querySelector(".working-row")).toBeNull();
    });
  });
});

describe("App unread indicator", () => {
  it("marks a non-selected session unread and clears it when selected", async () => {
    const { emit } = mount([
      makeSession({ id: "s1", title: "Session one" }),
      makeSession({ id: "s2", title: "Session two" }),
    ]);
    await openSession("Session one");

    act(() => {
      emit({
        type: "transcript",
        sessionId: "s2",
        events: [
          { id: "e1", kind: "agent_message", payload: { text: "hello" } },
        ],
      });
    });

    const row = (await screen.findByText("Session two")).closest(
      ".row-item",
    ) as HTMLElement;
    await waitFor(() => expect(row.querySelector(".unread-badge")).toBeTruthy());

    fireEvent.click(row);
    await waitFor(() => expect(row.querySelector(".unread-badge")).toBeNull());
  });

  it("does not mark the selected session unread", async () => {
    const { emit } = mount([makeSession({ id: "s1", title: "Session one" })]);
    await openSession("Session one");

    act(() => {
      emit({
        type: "transcript",
        sessionId: "s1",
        events: [
          { id: "e1", kind: "agent_message", payload: { text: "hello" } },
        ],
      });
    });

    const row = Array.from(
      document.querySelectorAll(".sidebar .row-item"),
    ).find(
      (item) => item.querySelector(".cell-content")?.textContent === "Session one",
    ) as HTMLElement;
    expect(row.querySelector(".unread-badge")).toBeNull();
  });
});

describe("App diff review", () => {
  const diffEvents = [
    {
      id: "d1",
      kind: "diff",
      payload: { path: "src/a.ts", oldText: "a\n", newText: "b\n" },
    },
  ] as RelayState["transcripts"][string];

  it("keeps a reviewed diff marked across a re-render", async () => {
    const { emit } = mount([makeSession({ id: "s1", title: "Session one" })], {
      s1: diffEvents,
    });
    await openSession("Session one");
    const button = await screen.findByRole("button", { name: "Reviewed" });
    expect(button.getAttribute("aria-pressed")).toBe("false");

    fireEvent.click(button);
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Reviewed" }).getAttribute("aria-pressed"),
      ).toBe("true"),
    );

    act(() => {
      emit({ type: "sessions", sessions: [makeSession({ id: "s1", title: "Session one" })] });
    });
    expect(
      screen.getByRole("button", { name: "Reviewed" }).getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("opens a diff file through the bridge with the session cwd", async () => {
    const { bridge } = mount([makeSession({ id: "s1", title: "Session one" })], {
      s1: diffEvents,
    });
    await openSession("Session one");
    fireEvent.click(await screen.findByRole("button", { name: "Open in editor" }));
    expect(bridge.openPath).toHaveBeenCalledWith("/tmp/repo", "src/a.ts");
  });
});

describe("App plan badge", () => {
  it("threads the latest plan event into the composer badge", async () => {
    mount([makeSession({ id: "s1", title: "Session one" })], {
      s1: [
        {
          id: "p1",
          kind: "plan",
          payload: {
            entries: [
              { content: "Old step", status: "pending" },
              { content: "Old step two", status: "pending" },
              { content: "Old step three", status: "pending" },
            ],
          },
        },
        {
          id: "p2",
          kind: "plan",
          payload: {
            entries: [
              { content: "First step", status: "completed" },
              { content: "Second step", status: "pending" },
            ],
          },
        },
      ],
    });
    await openSession("Session one");
    expect(await screen.findByText("1/2 tasks")).toBeTruthy();
  });

  it("hides the badge without a plan", async () => {
    mount([makeSession({ id: "s1", title: "Session one" })]);
    await openSession("Session one");
    expect(document.querySelector(".plan-badge")).toBeNull();
  });
});

describe("App context meter", () => {
  it("shows the ring from the latest usage event", async () => {
    mount([makeSession({ id: "s1", title: "Session one" })], {
      s1: [
        { id: "u1", kind: "usage", payload: { used: 1000, size: 10000 } },
        { id: "u2", kind: "usage", payload: { used: 5000, size: 10000 } },
      ],
    });
    await openSession("Session one");
    expect(await screen.findByText("50%")).toBeTruthy();
  });
});

describe("App permission navigation", () => {
  function request(id: string) {
    return {
      id,
      sessionId: "s1",
      title: `Request ${id}`,
      kind: "edit",
      options: [
        { optionId: `${id}-allow`, name: "Allow once", kind: "allow_once" },
        { optionId: `${id}-reject`, name: "Reject", kind: "reject_once" },
      ],
    };
  }

  it("answers the active card after stepping with ArrowRight", async () => {
    const { bridge, emit } = mount([makeSession({ id: "s1", title: "Session one" })]);
    await openSession("Session one");

    act(() => {
      emit({ type: "permission", sessionId: "s1", request: request("p1") });
    });
    act(() => {
      emit({ type: "permission", sessionId: "s1", request: request("p2") });
    });
    expect(await screen.findAllByRole("alertdialog")).toHaveLength(2);

    fireEvent.keyDown(window, { key: "ArrowRight" });
    fireEvent.keyDown(window, { key: "1" });

    expect(bridge.permission).toHaveBeenCalledTimes(1);
    expect(bridge.permission).toHaveBeenCalledWith("p2", "p2-allow");
  });

  it("answers the first card with its first option by digit", async () => {
    const { bridge, emit } = mount([makeSession({ id: "s1", title: "Session one" })]);
    await openSession("Session one");
    act(() => {
      emit({ type: "permission", sessionId: "s1", request: request("p1") });
    });
    await screen.findByRole("alertdialog");

    fireEvent.keyDown(window, { key: "2" });
    expect(bridge.permission).toHaveBeenCalledWith("p1", "p1-reject");
  });
});

describe("App auto-approve", () => {  it("shows the indicator after allowing all and dismisses it when turned off", async () => {
    const { bridge, emit } = mount([
      makeSession({ id: "s1", title: "Session one" }),
    ]);
    await openSession("Session one");

    act(() => {
      emit({
        type: "permission",
        sessionId: "s1",
        request: {
          id: "p1",
          sessionId: "s1",
          title: "Edit README.md",
          kind: "edit",
          options: [
            { optionId: "allow", name: "Allow once", kind: "allow_once" },
            { optionId: "reject", name: "Reject", kind: "reject_once" },
          ],
        },
      });
    });

    fireEvent.click(
      await screen.findByRole("button", { name: "Allow all for this session" }),
    );
    expect(bridge.permission).toHaveBeenCalledWith("p1", "allow");
    expect(bridge.setAutoApprove).toHaveBeenCalledWith("s1", true);
    expect(await screen.findByText("Auto-approve on")).toBeTruthy();

    fireEvent.click(screen.getByLabelText("Turn off auto-approve"));
    expect(bridge.setAutoApprove).toHaveBeenLastCalledWith("s1", false);
    await waitFor(() =>
      expect(screen.queryByText("Auto-approve on")).toBeNull(),
    );
  });

  it("rehydrates the indicator from getState after a reload", async () => {
    mount([makeSession({ id: "s1", title: "Session one" })], {}, [], ["s1"]);
    await openSession("Session one");
    expect(await screen.findByText("Auto-approve on")).toBeTruthy();
  });
});

describe("App home agent default", () => {
  function agentSelect(): HTMLSelectElement {
    return document.querySelector(".composer-bar select") as HTMLSelectElement;
  }
  function repoSelect(): HTMLSelectElement {
    return document.querySelector(".context select") as HTMLSelectElement;
  }

  it("shows the stored default agent for the selected project", async () => {
    mount([], {}, [], [], { "/tmp/repo": "a2" });
    await waitFor(() => expect(agentSelect()?.value).toBe("a2"));
  });

  it("leaves the agent empty and blocks sending when the project has no default", async () => {
    const { bridge } = mount([], {}, [], [], {});
    await waitFor(() => expect(agentSelect()).toBeTruthy());
    expect(agentSelect().value).toBe("");
    expect(screen.getByRole("option", { name: "Select agent" })).toBeTruthy();

    const box = (await screen.findByRole("textbox")) as HTMLTextAreaElement;
    fireEvent.change(box, { target: { value: "hello" } });
    fireEvent.keyDown(box, { key: "Enter" });

    expect(await screen.findByText("Choose an agent.")).toBeTruthy();
    expect(bridge.create).not.toHaveBeenCalled();
  });

  it("switches to another project's default and to empty when it has none", async () => {
    mount(
      [],
      {},
      [],
      [],
      { "/tmp/repo": "a2", "/tmp/other": "a1" },
      [repo, otherRepo, blankRepo],
    );
    await waitFor(() => expect(agentSelect()?.value).toBe("a2"));

    fireEvent.change(repoSelect(), { target: { value: "/tmp/other" } });
    await waitFor(() => expect(agentSelect().value).toBe("a1"));

    fireEvent.change(repoSelect(), { target: { value: "/tmp/blank" } });
    await waitFor(() => expect(agentSelect().value).toBe(""));
  });
});
