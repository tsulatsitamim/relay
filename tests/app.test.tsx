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
import type { PromptAttachment, Session } from "../src/shared/types";

afterEach(() => {
  cleanup();
  delete (window as any).relay;
});

const repo = { path: "/tmp/repo", name: "repo", addedAt: 0 };

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
): RelayState {
  return {
    sessions,
    agents: [],
    recents: [],
    repos: [repo],
    transcripts,
    permissions: [],
    homeDir: "/tmp",
  };
}

function mount(
  sessions: Session[],
  transcripts: RelayState["transcripts"] = {},
  skills: string[] = [],
) {
  let listener: ((event: unknown) => void) | null = null;
  const send = vi.fn().mockResolvedValue(undefined);
  const truncate = vi.fn().mockResolvedValue([]);
  const bridge = {
    getState: vi.fn().mockResolvedValue(stateWith(sessions, transcripts)),
    subscribe: vi.fn((fn: (event: unknown) => void) => {
      listener = fn;
      return () => {
        listener = null;
      };
    }),
    send,
    truncate,
    cancel: vi.fn().mockResolvedValue(undefined),
    permission: vi.fn().mockResolvedValue(undefined),
    restart: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    pickDirectory: vi.fn().mockResolvedValue(null),
    listFiles: vi.fn().mockResolvedValue([]),
    listSkills: vi.fn().mockResolvedValue(skills),
    pickImages: vi.fn().mockResolvedValue([]),
    addRepo: vi.fn().mockResolvedValue([]),
    removeRepo: vi.fn().mockResolvedValue([]),
    setPinned: vi.fn().mockResolvedValue(undefined),
    setArchived: vi.fn().mockResolvedValue(undefined),
    rename: vi.fn().mockResolvedValue(undefined),
    copyDebug: vi.fn().mockResolvedValue(undefined),
    windowControl: vi.fn().mockResolvedValue(undefined),
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
        makeSession({ id: "s1", title: "Session one" }),
        makeSession({ id: "s2", title: "Session two" }),
      ],
      {
        s1: [{ id: "e1", kind: "user", payload: { text: "hello there" } }],
      },
    );
    await screen.findByText("Session one");
    const box = await openSession("Session one");

    fireEvent.click(await screen.findByRole("button", { name: "Edit message" }));
    await waitFor(() => expect(box.value).toBe("hello there"));

    fireEvent.click(screen.getByText("Session two"));
    const next = (await screen.findByRole("textbox")) as HTMLTextAreaElement;
    expect(next.value).toBe("");
    expect(bridge.send).not.toHaveBeenCalled();
  });
});

describe("App regenerate", () => {
  it("truncates the last agent message then resends the last user text", async () => {
    const { send, truncate } = mount([makeSession()], {
      s1: [
        { id: "u1", kind: "user", payload: { text: "first question" } },
        { id: "a1", kind: "agent_message", payload: { text: "first answer" } },
        { id: "u2", kind: "user", payload: { text: "second question" } },
        { id: "a2", kind: "agent_message", payload: { text: "second answer" } },
      ],
    });
    await openSession("Session one");
    fireEvent.click(screen.getByRole("button", { name: "Regenerate answer" }));

    await waitFor(() => expect(send).toHaveBeenCalled());
    expect(truncate).toHaveBeenCalledWith("s1", "a2");
    expect(send.mock.calls[0]?.slice(0, 2)).toEqual(["s1", "second question"]);
    expect(truncate.mock.invocationCallOrder[0]).toBeLessThan(
      send.mock.invocationCallOrder[0]!,
    );
  });
});

describe("App edit resend", () => {
  it("truncates from the edited user event before resending", async () => {
    const { send, truncate } = mount([makeSession()], {
      s1: [
        { id: "u1", kind: "user", payload: { text: "original" } },
        { id: "a1", kind: "agent_message", payload: { text: "answer" } },
      ],
    });
    const box = await openSession("Session one");
    fireEvent.click(screen.getByRole("button", { name: "Edit message" }));
    await waitFor(() => expect(box.value).toBe("original"));
    fireEvent.change(box, { target: { value: "edited" } });
    fireEvent.keyDown(box, { key: "Enter" });

    await waitFor(() => expect(send).toHaveBeenCalled());
    expect(truncate).toHaveBeenCalledWith("s1", "u1");
    expect(send.mock.calls[0]?.slice(0, 2)).toEqual(["s1", "edited"]);
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
