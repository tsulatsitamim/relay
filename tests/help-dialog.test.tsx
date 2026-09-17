// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { HelpDialog } from "../src/renderer/HelpDialog.tsx";

afterEach(cleanup);

describe("HelpDialog", () => {
  const shortcuts = [
    { label: "New chat", keys: "mod+n" },
    { label: "Command palette", keys: "mod+k" },
    { label: "Find in conversation", keys: "mod+f" },
    { label: "Keyboard shortcuts", keys: "?" },
  ];

  it("lists every shortcut with its formatted keys", () => {
    render(<HelpDialog shortcuts={shortcuts} mod="⌘" onClose={() => {}} />);
    expect(screen.getByRole("dialog", { name: "Keyboard shortcuts" })).toBeTruthy();
    expect(screen.getByText("New chat")).toBeTruthy();
    expect(screen.getByText("⌘N")).toBeTruthy();
    expect(screen.getByText("Command palette")).toBeTruthy();
    expect(screen.getByText("⌘K")).toBeTruthy();
    expect(screen.getByText("?")).toBeTruthy();
  });

  it("closes from the close button", () => {
    const onClose = vi.fn();
    render(<HelpDialog shortcuts={shortcuts} mod="⌘" onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "Close shortcuts" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
