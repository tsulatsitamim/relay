// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { SessionRow } from "../src/renderer/SessionRow.tsx";
import type { Session } from "../src/shared/types.ts";

afterEach(cleanup);

function session(over: Partial<Session> = {}): Session {
  return {
    id: "s1",
    title: "Fix auth",
    agentConfigId: "a",
    agentName: "Fake",
    workingDirectory: "/tmp/repo",
    status: "idle",
    createdAt: 1,
    updatedAt: 1,
    ...over,
  };
}

const noop = () => {};

describe("SessionRow", () => {
  it("selects the session when clicked", () => {
    const onSelect = vi.fn();
    render(
      <SessionRow
        session={session()}
        active={false}
        renaming={false}
        onSelect={onSelect}
        onContextMenu={noop}
        onRename={noop}
        onCancelRename={noop}
      />,
    );
    fireEvent.click(screen.getByText("Fix auth"));
    expect(onSelect).toHaveBeenCalledWith("s1");
  });

  it("opens the context menu on right click", () => {
    const onContextMenu = vi.fn();
    const s = session();
    render(
      <SessionRow
        session={s}
        active={false}
        renaming={false}
        onSelect={noop}
        onContextMenu={onContextMenu}
        onRename={noop}
        onCancelRename={noop}
      />,
    );
    fireEvent.contextMenu(screen.getByText("Fix auth"));
    expect(onContextMenu).toHaveBeenCalledWith(s, expect.anything());
  });

  it("commits a rename on Enter", () => {
    const onRename = vi.fn();
    render(
      <SessionRow
        session={session()}
        active={false}
        renaming
        onSelect={noop}
        onContextMenu={noop}
        onRename={onRename}
        onCancelRename={noop}
      />,
    );
    const input = screen.getByRole("textbox") as HTMLInputElement;
    expect(input.value).toBe("Fix auth");
    fireEvent.change(input, { target: { value: "Fix login" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onRename).toHaveBeenCalledWith("s1", "Fix login");
  });

  it("cancels a rename on Escape", () => {
    const onCancelRename = vi.fn();
    render(
      <SessionRow
        session={session()}
        active={false}
        renaming
        onSelect={noop}
        onContextMenu={noop}
        onRename={noop}
        onCancelRename={onCancelRename}
      />,
    );
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Escape" });
    expect(onCancelRename).toHaveBeenCalled();
  });

  it("does not commit an empty rename", () => {
    const onRename = vi.fn();
    render(
      <SessionRow
        session={session()}
        active={false}
        renaming
        onSelect={noop}
        onContextMenu={noop}
        onRename={onRename}
        onCancelRename={noop}
      />,
    );
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onRename).not.toHaveBeenCalled();
  });

  it("marks the status dot when a permission is pending", () => {
    const { container } = render(
      <SessionRow
        session={session()}
        active={false}
        renaming={false}
        permission
        onSelect={noop}
        onContextMenu={noop}
        onRename={noop}
        onCancelRename={noop}
      />,
    );
    const dot = container.querySelector(".dot.permission");
    expect(dot).toBeTruthy();
    expect(dot?.getAttribute("title")).toBe("Permission required");
  });

  it("does not mark the status dot without a pending permission", () => {
    const { container } = render(
      <SessionRow
        session={session()}
        active={false}
        renaming={false}
        onSelect={noop}
        onContextMenu={noop}
        onRename={noop}
        onCancelRename={noop}
      />,
    );
    expect(container.querySelector(".dot.permission")).toBeNull();
  });
});
