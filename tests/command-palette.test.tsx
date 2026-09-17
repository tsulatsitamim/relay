// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import {
  CommandPalette,
  type PaletteCommand,
} from "../src/renderer/CommandPalette.tsx";
import type { Session, TranscriptEvent } from "../src/shared/types.ts";

afterEach(cleanup);

function session(overrides: Partial<Session> = {}): Session {
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

function setup(overrides: Partial<React.ComponentProps<typeof CommandPalette>> = {}) {
  const onClose = vi.fn();
  const onSelectSession = vi.fn();
  const onSelectFolder = vi.fn();
  const commands: PaletteCommand[] = [
    { id: "new", label: "New chat", hint: "Start fresh", shortcut: "mod+n", run: vi.fn() },
    { id: "settings", label: "Open settings", run: vi.fn() },
  ];
  render(
    <CommandPalette
      commands={commands}
      sessions={[session()]}
      transcripts={{}}
      folders={["/tmp/repo"]}
      mod="⌘"
      onSelectSession={onSelectSession}
      onSelectFolder={onSelectFolder}
      onClose={onClose}
      {...overrides}
    />,
  );
  return {
    commands,
    onClose,
    onSelectSession,
    onSelectFolder,
    input: screen.getByRole("textbox") as HTMLInputElement,
  };
}

describe("CommandPalette", () => {
  it("renders the command, session and folder groups", () => {
    setup();
    expect(screen.getByText("New chat")).toBeTruthy();
    expect(screen.getByText("Open settings")).toBeTruthy();
    expect(screen.getByText("Session one")).toBeTruthy();
    expect(screen.getByText("repo")).toBeTruthy();
    expect(screen.getByText("⌘N")).toBeTruthy();
  });

  it("runs the active command on Enter and closes", () => {
    const { commands, onClose } = setup();
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" });
    expect((commands[0]!.run as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("moves the active option with the arrow keys", () => {
    setup();
    const options = screen.getAllByRole("option");
    expect(options[0]!.getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "ArrowDown" });
    expect(screen.getAllByRole("option")[1]!.getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "ArrowUp" });
    expect(screen.getAllByRole("option")[0]!.getAttribute("aria-selected")).toBe("true");
  });

  it("selects a session when it is activated", () => {
    const { onSelectSession, onClose } = setup();
    const options = screen.getAllByRole("option");
    const sessionOption = options.find(
      (option) => option.textContent?.includes("Session one"),
    )!;
    fireEvent.click(sessionOption);
    expect(onSelectSession).toHaveBeenCalledWith("s1");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes on Escape", () => {
    const { onClose } = setup();
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("filters commands as the query changes", () => {
    setup();
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "chat" } });
    expect(screen.getByText("New chat")).toBeTruthy();
    expect(screen.queryByText("Open settings")).toBeNull();
  });

  it("matches a session on transcript content", () => {
    const events: TranscriptEvent[] = [
      { id: "e1", kind: "agent_message", payload: { text: "token refresh" } },
    ];
    setup({ transcripts: { s1: events } });
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "refresh" } });
    expect(screen.getByText("Session one")).toBeTruthy();
  });

  it("ignores Tab without moving the active option", () => {
    setup();
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Tab" });
    expect(screen.getAllByRole("option")[0]!.getAttribute("aria-selected")).toBe("true");
  });
});
