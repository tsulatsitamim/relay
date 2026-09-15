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

function mount(sessions: Session[], transcripts: RelayState["transcripts"] = {}) {
  let listener: ((event: unknown) => void) | null = null;
  const send = vi.fn().mockResolvedValue(undefined);
  const bridge = {
    getState: vi.fn().mockResolvedValue(stateWith(sessions, transcripts)),
    subscribe: vi.fn((fn: (event: unknown) => void) => {
      listener = fn;
      return () => {
        listener = null;
      };
    }),
    send,
    cancel: vi.fn().mockResolvedValue(undefined),
    permission: vi.fn().mockResolvedValue(undefined),
    restart: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    pickDirectory: vi.fn().mockResolvedValue(null),
    listFiles: vi.fn().mockResolvedValue([]),
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
