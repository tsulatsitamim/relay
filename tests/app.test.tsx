// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { App } from "../src/renderer/App";
import type { RelayState } from "../src/shared/ipc";
import type { AgentConfig, PromptAttachment, Repo, Session } from "../src/shared/types";

afterEach(() => {
  cleanup();
  delete (window as any).relay;
  delete (document as any).startViewTransition;
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
  diffComments: RelayState["diffComments"] = {},
): RelayState {
  return {
    sessions,
    agents,
    recents: [],
    repos,
    transcripts,
    diffComments,
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
  diffComments: RelayState["diffComments"] = {},
) {
  let listener: ((event: unknown) => void) | null = null;
  const send = vi.fn().mockResolvedValue(undefined);
  const truncate = vi.fn().mockResolvedValue([]);
  const bridge = {
    getState: vi
      .fn()
      .mockResolvedValue(
        stateWith(sessions, transcripts, autoApprove, agentDefaults, repos, diffComments),
      ),
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
    addDiffComment: vi.fn(
      async (sessionId: string, input: Record<string, unknown>) => ({
        id: "nc1",
        sessionId,
        ...input,
        createdAt: 0,
      }),
    ),
    deleteDiffComment: vi.fn().mockResolvedValue(undefined),
    markDiffCommentsSent: vi.fn().mockResolvedValue(undefined),
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

describe("App home to dock transition", () => {
  it("navigates into the new session and runs the view transition", async () => {
    const startViewTransition = vi.fn((callback: () => void) => {
      callback();
      return undefined;
    });
    Object.defineProperty(document, "startViewTransition", {
      value: startViewTransition,
      configurable: true,
      writable: true,
    });
    const { bridge } = mount([], {}, [], [], { "/tmp/repo": "a2" });
    bridge.getState.mockResolvedValue(stateWith([makeSession()], { s1: [] }));

    const box = (await screen.findByRole("textbox")) as HTMLTextAreaElement;
    fireEvent.change(box, { target: { value: "hello" } });
    fireEvent.keyDown(box, { key: "Enter" });

    await waitFor(() => expect(bridge.create).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(document.querySelector(".dock-composer")).toBeTruthy());
    expect(startViewTransition).toHaveBeenCalledTimes(1);
  });
});

describe("App resting dock composer", () => {
  function setMetrics(
    el: HTMLElement,
    metrics: { scrollTop: number; scrollHeight: number; clientHeight: number },
  ) {
    Object.defineProperty(el, "scrollHeight", {
      value: metrics.scrollHeight,
      configurable: true,
    });
    Object.defineProperty(el, "clientHeight", {
      value: metrics.clientHeight,
      configurable: true,
    });
    Object.defineProperty(el, "scrollTop", {
      value: metrics.scrollTop,
      writable: true,
      configurable: true,
    });
  }

  it("rests the dock composer when scrolled away and restores at the bottom", async () => {
    mount([makeSession()], {
      s1: [
        { id: "e1", kind: "user", payload: { text: "hi" } },
      ] as RelayState["transcripts"][string],
    });
    await openSession("Session one");
    const scroller = document.querySelector(".transcript") as HTMLElement;
    const card = document.querySelector(".dock-composer") as HTMLElement;

    expect(card.getAttribute("data-resting")).toBeNull();

    setMetrics(scroller, { scrollTop: 100, scrollHeight: 1000, clientHeight: 200 });
    fireEvent.scroll(scroller);
    await waitFor(() => expect(card.getAttribute("data-resting")).toBe("true"));

    setMetrics(scroller, { scrollTop: 795, scrollHeight: 1000, clientHeight: 200 });
    fireEvent.scroll(scroller);
    await waitFor(() => expect(card.getAttribute("data-resting")).toBeNull());
  });
});

describe("App command palette", () => {
  it("opens with Cmd+K and closes with Escape", async () => {
    mount([makeSession()]);
    await openSession("Session one");
    fireEvent.keyDown(window, { key: "k", metaKey: true });
    expect(await screen.findByRole("dialog", { name: "Command palette" })).toBeTruthy();

    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Command palette" })).toBeNull(),
    );
  });

  it("runs a command through the existing bridge handler", async () => {
    const { bridge } = mount([makeSession()]);
    await openSession("Session one");
    fireEvent.keyDown(window, { key: "k", metaKey: true });
    const input = await screen.findByLabelText("Command palette query");
    fireEvent.change(input, { target: { value: "debug" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(bridge.copyDebug).toHaveBeenCalledWith("s1"));
  });

  it("selects a session from the palette", async () => {
    mount([
      makeSession({ id: "s1", title: "Session one" }),
      makeSession({ id: "s2", title: "Session two" }),
    ]);
    await screen.findByText("Session two");
    fireEvent.keyDown(window, { key: "k", metaKey: true });
    const dialog = await screen.findByRole("dialog", { name: "Command palette" });
    fireEvent.change(within(dialog).getByLabelText("Command palette query"), {
      target: { value: "two" },
    });
    fireEvent.click(within(dialog).getByText("Session two"));
    await waitFor(() =>
      expect(document.querySelector(".thread-name")?.textContent).toBe("Session two"),
    );
  });
});

describe("App keybinding registry", () => {
  it("starts a new chat with Cmd+N", async () => {
    mount([makeSession()]);
    await openSession("Session one");
    fireEvent.keyDown(window, { key: "n", metaKey: true });
    await waitFor(() => expect(document.querySelector(".home")).toBeTruthy());
  });

  it("opens the help dialog with ? and closes it with Escape", async () => {
    mount([makeSession()]);
    await openSession("Session one");
    fireEvent.keyDown(window, { key: "?" });
    expect(
      await screen.findByRole("dialog", { name: "Keyboard shortcuts" }),
    ).toBeTruthy();
    expect(screen.getByText("Command palette")).toBeTruthy();
    expect(screen.getByText("Stash / restore draft")).toBeTruthy();

    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Keyboard shortcuts" })).toBeNull(),
    );
  });

  it("does not open help while typing in the composer", async () => {
    mount([makeSession()]);
    const box = await openSession("Session one");
    fireEvent.keyDown(box, { key: "?" });
    expect(screen.queryByRole("dialog", { name: "Keyboard shortcuts" })).toBeNull();
  });
});

describe("App queue steering", () => {
  async function enqueue(box: HTMLTextAreaElement, values: string[]) {
    for (const value of values) {
      fireEvent.change(box, { target: { value } });
      fireEvent.keyDown(box, { key: "Enter" });
    }
  }

  function chips(): string[] {
    return Array.from(document.querySelectorAll(".queued-chip .queued-text")).map(
      (node) => node.textContent ?? "",
    );
  }

  it("cancels a running turn and sends the steered item once the session settles", async () => {
    const { send, bridge, emit } = mount([makeSession({ status: "working" })]);
    const box = await openSession("Session one");
    await enqueue(box, ["first", "second"]);

    fireEvent.click(screen.getAllByLabelText("Send queued message now")[1]);
    expect(bridge.cancel).toHaveBeenCalledWith("s1");
    expect(chips()).toEqual(["second", "first"]);

    await act(async () => {
      emit({ type: "sessions", sessions: [makeSession({ status: "idle" })] });
    });
    await waitFor(() => expect(send).toHaveBeenCalled());
    expect(send.mock.calls[0]?.slice(0, 2)).toEqual(["s1", "second"]);
  });

  it("sends the steered item immediately when the session is not running", async () => {
    const { send, emit } = mount([makeSession({ status: "working" })]);
    const box = await openSession("Session one");
    await enqueue(box, ["first", "second", "third"]);
    send.mockImplementation(() => new Promise<void>(() => {}));

    await act(async () => {
      emit({ type: "sessions", sessions: [makeSession({ status: "idle" })] });
    });
    await waitFor(() => expect(send.mock.calls.length).toBe(1));
    expect(send.mock.calls[0]?.slice(0, 2)).toEqual(["s1", "first"]);

    fireEvent.click(screen.getAllByLabelText("Send queued message now")[1]);
    expect(send.mock.calls[1]?.slice(0, 2)).toEqual(["s1", "third"]);
    expect(chips()).toEqual(["second"]);
  });

  it("keeps the item queued and surfaces the error when cancel fails", async () => {
    const { bridge } = mount([makeSession({ status: "working" })]);
    const box = await openSession("Session one");
    await enqueue(box, ["first", "second"]);
    bridge.cancel.mockRejectedValueOnce(new Error("cannot cancel"));

    fireEvent.click(screen.getAllByLabelText("Send queued message now")[1]);
    await waitFor(() => expect(screen.getByText("cannot cancel")).toBeTruthy());
    expect(chips()).toEqual(["second", "first"]);
  });
});

describe("App prompt history", () => {
  it("recalls the latest user prompt from the transcript", async () => {
    mount([makeSession()], {
      s1: [
        { id: "u1", kind: "user", payload: { text: "first prompt" } },
        { id: "a1", kind: "agent_message", payload: { text: "answer" } },
        { id: "u2", kind: "user", payload: { text: "second prompt" } },
      ],
    });
    const box = await openSession("Session one");
    box.setSelectionRange(0, 0);
    fireEvent.keyDown(box, { key: "ArrowUp" });
    expect(box.value).toBe("second prompt");
    fireEvent.keyDown(box, { key: "ArrowUp" });
    expect(box.value).toBe("first prompt");
  });
});

describe("App draft stash", () => {
  it("stashes and restores the draft per session", async () => {
    mount([
      makeSession({ id: "s1", title: "Session one" }),
      makeSession({ id: "s2", title: "Session two" }),
    ]);
    const box = await openSession("Session one");
    fireEvent.change(box, { target: { value: "draft one" } });
    fireEvent.keyDown(box, { key: "s", metaKey: true });
    expect(box.value).toBe("");
    expect(screen.getByText("Draft stashed")).toBeTruthy();

    fireEvent.click(screen.getByText("Session two"));
    await screen.findByRole("textbox");
    expect(screen.queryByText("Draft stashed")).toBeNull();

    fireEvent.click(screen.getByText("Session one"));
    const back = (await screen.findByRole("textbox")) as HTMLTextAreaElement;
    expect(screen.getByText("Draft stashed")).toBeTruthy();
    fireEvent.keyDown(back, { key: "s", metaKey: true });
    expect(back.value).toBe("draft one");
  });

  it("does not stash while typing in another field", async () => {
    mount([makeSession()]);
    const box = await openSession("Session one");
    fireEvent.change(box, { target: { value: "draft" } });

    fireEvent.keyDown(window, { key: "f", metaKey: true });
    const find = await screen.findByLabelText("Find in conversation");
    fireEvent.keyDown(find, { key: "s", metaKey: true });

    expect(box.value).toBe("draft");
    expect(screen.queryByText("Draft stashed")).toBeNull();
  });
});

describe("App rewind and fork", () => {
  function homeBox(): HTMLTextAreaElement {
    return document.querySelector(".home textarea") as HTMLTextAreaElement;
  }
  function homeRepo(): HTMLSelectElement {
    return document.querySelector(".context select") as HTMLSelectElement;
  }
  function homeAgent(): HTMLSelectElement {
    return document.querySelector(".composer-bar select") as HTMLSelectElement;
  }

  it("rewinds to a user message and seeds the composer without sending", async () => {
    const { send, truncate } = mount([makeSession()], {
      s1: [
        { id: "u1", kind: "user", payload: { text: "original" } },
        { id: "a1", kind: "agent_message", payload: { text: "answer" } },
      ],
    });
    const box = await openSession("Session one");
    await screen.findByText("original");
    fireEvent.click(screen.getByRole("button", { name: "Rewind to this message" }));

    await waitFor(() => expect(truncate).toHaveBeenCalledWith("s1", "u1"));
    await waitFor(() => expect(box.value).toBe("original"));
    expect(send).not.toHaveBeenCalled();
  });

  it("ignores rewind while the session is working", async () => {
    const { send, truncate } = mount([makeSession({ status: "working" })], {
      s1: [{ id: "u1", kind: "user", payload: { text: "original" } }],
    });
    await openSession("Session one");
    fireEvent.click(screen.getByRole("button", { name: "Rewind to this message" }));

    expect(truncate).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it("forks the prompt back to the home composer with the repo and agent prefilled", async () => {
    const { bridge } = mount(
      [makeSession()],
      { s1: [{ id: "u1", kind: "user", payload: { text: "do the thing" } }] },
      [],
      [],
      { "/tmp/repo": "a1" },
    );
    await openSession("Session one");
    fireEvent.click(screen.getByRole("button", { name: "Fork as new chat" }));

    await waitFor(() => expect(document.querySelector(".home")).toBeTruthy());
    await waitFor(() => expect(homeBox().value).toBe("do the thing"));
    expect(homeRepo().value).toBe("/tmp/repo");
    expect(homeAgent().value).toBe("a1");
    expect(bridge.create).not.toHaveBeenCalled();
  });
});

describe("App diff comments", () => {
  const diffEvents = [
    {
      id: "d1",
      kind: "diff",
      payload: { path: "src/a.ts", oldText: "a\nb\nc\n", newText: "a\nB\nc\nd\n" },
    },
  ] as RelayState["transcripts"][string];

  const seeded = [
    {
      id: "c1",
      sessionId: "s1",
      eventId: "d1",
      path: "src/a.ts",
      startLine: 2,
      endLine: 4,
      body: "rename this",
      createdAt: 0,
    },
  ] as RelayState["diffComments"][string];

  it("persists a new comment through the bridge and renders it", async () => {
    const { bridge } = mount([makeSession()], { s1: diffEvents });
    await openSession("Session one");
    fireEvent.click(await screen.findByRole("button", { name: "Comment on line 1" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Comment body" }), {
      target: { value: "needs a test" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add comment" }));

    await waitFor(() =>
      expect(bridge.addDiffComment).toHaveBeenCalledWith("s1", {
        eventId: "d1",
        path: "src/a.ts",
        startLine: 1,
        endLine: 1,
        body: "needs a test",
      }),
    );
    expect(await screen.findByText("needs a test")).toBeTruthy();
  });

  it("deletes a comment through the bridge and drops it from the diff", async () => {
    const { bridge } = mount([makeSession()], { s1: diffEvents }, [], [], {}, [repo], {
      s1: seeded,
    });
    await openSession("Session one");
    fireEvent.click(await screen.findByRole("button", { name: "Delete comment" }));

    await waitFor(() => expect(bridge.deleteDiffComment).toHaveBeenCalledWith("c1"));
    await waitFor(() => expect(screen.queryByText("rename this")).toBeNull());
  });

  it("seeds the composer with the review draft without sending", async () => {
    const { send, bridge } = mount([makeSession()], { s1: diffEvents }, [], [], {}, [repo], {
      s1: seeded,
    });
    const box = await openSession("Session one");
    fireEvent.click(await screen.findByRole("button", { name: "Send review" }));

    await waitFor(() =>
      expect(box.value).toBe("> src/a.ts:2-4\nrename this"),
    );
    expect(send).not.toHaveBeenCalled();
    expect(bridge.markDiffCommentsSent).not.toHaveBeenCalled();
  });

  it("marks the comments sent only after the review is sent", async () => {
    const { send, bridge } = mount([makeSession()], { s1: diffEvents }, [], [], {}, [repo], {
      s1: seeded,
    });
    const box = await openSession("Session one");
    fireEvent.click(await screen.findByRole("button", { name: "Send review" }));
    await waitFor(() => expect(box.value).toBe("> src/a.ts:2-4\nrename this"));

    fireEvent.keyDown(box, { key: "Enter" });
    await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(bridge.markDiffCommentsSent).toHaveBeenCalledWith("s1", ["c1"]),
    );
    await waitFor(() =>
      expect(document.querySelector(".diff-comment.sent")).toBeTruthy(),
    );
  });

  it("keeps the pending review when the send fails and marks it on retry", async () => {
    const { send, bridge } = mount([makeSession()], { s1: diffEvents }, [], [], {}, [repo], {
      s1: seeded,
    });
    send.mockRejectedValueOnce(new Error("boom"));
    const box = await openSession("Session one");
    fireEvent.click(await screen.findByRole("button", { name: "Send review" }));
    await waitFor(() => expect(box.value).toBe("> src/a.ts:2-4\nrename this"));

    fireEvent.keyDown(box, { key: "Enter" });
    const retry = await screen.findByRole("button", { name: "Retry" });
    expect(bridge.markDiffCommentsSent).not.toHaveBeenCalled();

    fireEvent.click(retry);
    await waitFor(() => expect(send).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(bridge.markDiffCommentsSent).toHaveBeenCalledWith("s1", ["c1"]),
    );
  });

  it("drops the pending review when switching sessions", async () => {
    const { send, bridge } = mount(
      [makeSession({ id: "s1" }), makeSession({ id: "s2", title: "Session two" })],
      { s1: diffEvents, s2: [] },
      [],
      [],
      {},
      [repo],
      { s1: seeded },
    );
    const box = await openSession("Session one");
    fireEvent.click(await screen.findByRole("button", { name: "Send review" }));
    await waitFor(() => expect(box.value).toBe("> src/a.ts:2-4\nrename this"));

    fireEvent.click(screen.getByText("Session two"));
    const nextBox = await screen.findByRole("textbox");
    expect(nextBox.value).toBe("");
    fireEvent.change(nextBox, { target: { value: "other topic" } });
    fireEvent.keyDown(nextBox, { key: "Enter" });

    await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    expect(send.mock.calls[0]).toEqual(["s2", "other topic", undefined]);
    expect(bridge.markDiffCommentsSent).not.toHaveBeenCalled();
  });
});

describe("App plan follow-up actions", () => {
  const planEvents = [
    {
      id: "p1",
      kind: "plan",
      payload: { entries: [{ content: "Ship it", status: "pending" }] },
    },
  ] as RelayState["transcripts"][string];

  it("sends the implement prompt to the selected idle session", async () => {
    const { send } = mount([makeSession()], { s1: planEvents });
    await openSession("Session one");

    fireEvent.click(await screen.findByRole("button", { name: "Implement" }));

    await waitFor(() =>
      expect(send).toHaveBeenCalledWith("s1", "Implement the plan above.", undefined),
    );
  });

  it("prefills a new chat without sending when implementing in a new chat", async () => {
    const { send } = mount([makeSession()], { s1: planEvents });
    await openSession("Session one");

    fireEvent.click(
      await screen.findByRole("button", { name: "Implement in new chat" }),
    );

    await waitFor(() => {
      const box = screen.getByRole("textbox") as HTMLTextAreaElement;
      expect(box.value).toBe("Implement the plan above.");
    });
    expect(send).not.toHaveBeenCalled();
  });

  it("hides the plan actions while the session is working", async () => {
    mount([makeSession({ status: "working" })], { s1: planEvents });
    await openSession("Session one");

    expect(screen.queryByRole("button", { name: "Implement" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Implement in new chat" })).toBeNull();
  });
});
