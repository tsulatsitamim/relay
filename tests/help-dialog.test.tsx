// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { HelpDialog, type ShortcutHint } from "../src/renderer/HelpDialog.tsx";

afterEach(cleanup);

const shortcuts: ShortcutHint[] = [
  { id: "new-chat", label: "New chat", keys: "mod+n", editable: true },
  { id: "palette", label: "Command palette", keys: "mod+k", editable: true },
  { id: "find", label: "Find in conversation", keys: "mod+f", editable: true },
  { id: "help", label: "Keyboard shortcuts", keys: "?", editable: true },
  { id: "escape", label: "Close overlay", keys: "Escape", editable: false },
];

type DialogProps = {
  shortcuts?: ShortcutHint[];
  overrides?: Record<string, string>;
  conflicts?: Set<string>;
  lockedIds?: string[];
  onChange?: (id: string, keys: string | null) => void;
  onReset?: () => void;
  onClose?: () => void;
};

function renderDialog(props: DialogProps = {}) {
  return render(
    <HelpDialog
      shortcuts={props.shortcuts ?? shortcuts}
      mod="⌘"
      overrides={props.overrides ?? {}}
      conflicts={props.conflicts ?? new Set<string>()}
      lockedIds={props.lockedIds ?? []}
      onChange={props.onChange ?? (() => {})}
      onReset={props.onReset ?? (() => {})}
      onClose={props.onClose ?? (() => {})}
    />,
  );
}

function rowFor(label: string): HTMLElement {
  const row = screen.getByText(label).closest(".help-row");
  if (!(row instanceof HTMLElement)) throw new Error(`No row for ${label}`);
  return row;
}

describe("HelpDialog", () => {
  it("lists every shortcut with its formatted keys", () => {
    renderDialog();
    expect(screen.getByRole("dialog", { name: "Keyboard shortcuts" })).toBeTruthy();
    expect(screen.getByText("New chat")).toBeTruthy();
    expect(screen.getByText("⌘N")).toBeTruthy();
    expect(screen.getByText("Command palette")).toBeTruthy();
    expect(screen.getByText("⌘K")).toBeTruthy();
    expect(screen.getByText("?")).toBeTruthy();
  });

  it("closes from the close button", () => {
    const onClose = vi.fn();
    renderDialog({ onClose });
    fireEvent.click(screen.getByRole("button", { name: "Close shortcuts" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("shows the effective keys passed for each row", () => {
    renderDialog({
      shortcuts: [
        { id: "new-chat", label: "New chat", keys: "mod+j", editable: true },
      ],
    });
    expect(screen.getByText("⌘J")).toBeTruthy();
    expect(screen.queryByText("⌘N")).toBeNull();
  });

  it("enters capture mode and shows the capture prompt", () => {
    renderDialog();
    fireEvent.click(screen.getByRole("button", { name: "Change shortcut for New chat" }));
    expect(screen.getByText("Press keys…")).toBeTruthy();
  });

  it("reports the captured chord through onChange", () => {
    const onChange = vi.fn();
    renderDialog({ onChange });
    fireEvent.click(screen.getByRole("button", { name: "Change shortcut for New chat" }));
    fireEvent.keyDown(window, { key: "J", metaKey: true });
    expect(onChange).toHaveBeenCalledWith("new-chat", "mod+j");
  });

  it("cancels capture on Escape without closing the dialog", () => {
    const onChange = vi.fn();
    const onClose = vi.fn();
    renderDialog({ onChange, onClose });
    fireEvent.click(screen.getByRole("button", { name: "Change shortcut for New chat" }));
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onChange).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.queryByText("Press keys…")).toBeNull();
  });

  it("resets a row to default on Backspace", () => {
    const onChange = vi.fn();
    renderDialog({ onChange });
    fireEvent.click(screen.getByRole("button", { name: "Change shortcut for New chat" }));
    fireEvent.keyDown(window, { key: "Backspace" });
    expect(onChange).toHaveBeenCalledWith("new-chat", null);
  });

  it("resets a row to default on Delete", () => {
    const onChange = vi.fn();
    renderDialog({ onChange });
    fireEvent.click(screen.getByRole("button", { name: "Change shortcut for New chat" }));
    fireEvent.keyDown(window, { key: "Delete" });
    expect(onChange).toHaveBeenCalledWith("new-chat", null);
  });

  it("shows a warning icon on a conflicting row", () => {
    renderDialog({ conflicts: new Set(["palette"]) });
    const warning = rowFor("Command palette").querySelector(
      '[title="Used by another shortcut"]',
    );
    expect(warning).toBeTruthy();
    expect(rowFor("New chat").querySelector('[title="Used by another shortcut"]')).toBeNull();
  });

  it("omits the change button on locked and non-editable rows", () => {
    renderDialog({ lockedIds: ["find"] });
    expect(
      screen.queryByRole("button", { name: "Change shortcut for Find in conversation" }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Change shortcut for Close overlay" }),
    ).toBeNull();
    expect(
      screen.getByRole("button", { name: "Change shortcut for New chat" }),
    ).toBeTruthy();
  });

  it("calls onReset from the Reset all button", () => {
    const onReset = vi.fn();
    renderDialog({ onReset });
    fireEvent.click(screen.getByRole("button", { name: "Reset all" }));
    expect(onReset).toHaveBeenCalledTimes(1);
  });
});