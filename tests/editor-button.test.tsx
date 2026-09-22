// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { EditorButton } from "../src/renderer/right-panel/EditorButton.tsx";
import type { RelayBridge } from "../src/renderer/env.d.ts";

afterEach(() => {
  cleanup();
  delete (window as { relay?: unknown }).relay;
});

function bridge(overrides: Partial<RelayBridge> = {}): RelayBridge {
  return {
    availableEditors: async () => [
      { id: "vscode", label: "VS Code", command: "code" },
      { id: "zed", label: "Zed", command: "zed" },
    ],
    openInEditor: async () => ({ ok: true }),
    revealInFinder: async () => true,
    ...overrides,
  } as unknown as RelayBridge;
}

describe("EditorButton", () => {
  it("opens the preferred editor and remembers a new choice", async () => {
    const openInEditor = vi.fn(async () => ({ ok: true }));
    const onPreferred = vi.fn();
    window.relay = bridge({ openInEditor });
    render(
      <EditorButton
        cwd="/repo"
        preferred={null}
        onPreferred={onPreferred}
        disabled={false}
      />,
    );
    await waitFor(() => expect(screen.getByText("Open in VS Code")).toBeTruthy());
    fireEvent.click(screen.getByText("Open in VS Code"));
    expect(openInEditor).toHaveBeenCalledWith("/repo", "vscode", undefined, undefined);

    fireEvent.click(screen.getByRole("button", { name: "Choose editor" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Zed" }));
    expect(onPreferred).toHaveBeenCalledWith("zed");
  });

  it("offers Reveal in Finder and reports failures", async () => {
    const revealInFinder = vi.fn(async () => true);
    window.relay = bridge({ revealInFinder });
    render(
      <EditorButton cwd="/repo" preferred="vscode" onPreferred={() => {}} disabled={false} />,
    );
    await waitFor(() => expect(screen.getByRole("button", { name: "Choose editor" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Choose editor" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Reveal in Finder" }));
    expect(revealInFinder).toHaveBeenCalledWith("/repo", ".");

    cleanup();
    window.relay = bridge({
      openInEditor: async () => ({ ok: false, message: "VS Code is not installed" }),
    });
    render(
      <EditorButton cwd="/repo" preferred="vscode" onPreferred={() => {}} disabled={false} />,
    );
    await waitFor(() => expect(screen.getByText("Open in VS Code")).toBeTruthy());
    fireEvent.click(screen.getByText("Open in VS Code"));
    await waitFor(() => expect(screen.getByText("VS Code is not installed")).toBeTruthy());
  });

  it("falls back to Reveal in Finder when no editor is installed", async () => {
    window.relay = bridge({ availableEditors: async () => [] });
    render(
      <EditorButton cwd="/repo" preferred={null} onPreferred={() => {}} disabled={false} />,
    );
    await waitFor(() => expect(screen.getByText("Reveal in Finder")).toBeTruthy());
  });

  it("closes the editor menu on Escape and on an outside press", async () => {
    window.relay = bridge();
    const { container } = render(
      <EditorButton cwd="/repo" preferred={null} onPreferred={() => {}} disabled={false} />,
    );
    await waitFor(() => expect(screen.getByText("Open in VS Code")).toBeTruthy());
    const toggle = screen.getByRole("button", { name: "Choose editor" });

    fireEvent.click(toggle);
    expect(screen.getByRole("menuitem", { name: "Zed" })).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menuitem", { name: "Zed" })).toBeNull();

    fireEvent.click(toggle);
    expect(screen.getByRole("menuitem", { name: "Zed" })).toBeTruthy();
    fireEvent.pointerDown(container.querySelector(".editor-button")!);
    expect(screen.queryByRole("menuitem", { name: "Zed" })).toBeNull();
  });
});
