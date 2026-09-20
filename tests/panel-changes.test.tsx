// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { PanelChanges } from "../src/renderer/right-panel/PanelChanges.tsx";
import type { RelayBridge } from "../src/renderer/env.d.ts";

afterEach(() => {
  cleanup();
  delete (window as { relay?: unknown }).relay;
});

function bridge(overrides: Partial<RelayBridge> = {}): RelayBridge {
  return {
    gitChanges: vi.fn(async () => ({
      branch: "main",
      files: [
        { path: "src/a.ts", status: "modified", insertions: 4, deletions: 2 },
        { path: "src/b.ts", status: "untracked" },
      ],
    })),
    gitFileDiff: vi.fn(async (_cwd: string, path: string) => ({
      path,
      oldText: "a\n",
      newText: "b\n",
      truncated: false,
      binary: false,
    })),
    ...overrides,
  } as unknown as RelayBridge;
}

describe("PanelChanges", () => {
  it("lists changed files with their line counts", () => {
    render(
      <PanelChanges
        cwd="/repo"
        changes={{
          branch: "main",
          files: [{ path: "src/a.ts", status: "modified", insertions: 4, deletions: 2 }],
        }}
        loading={false}
        error={null}
        onRefresh={() => {}}
        onOpenInEditor={() => {}}
      />,
    );
    expect(screen.getByText("src/a.ts")).toBeTruthy();
    expect(screen.getByText("+4")).toBeTruthy();
    expect(screen.getByText("-2")).toBeTruthy();
    expect(screen.getByText("main")).toBeTruthy();
  });

  it("loads the diff of the selected file", async () => {
    window.relay = bridge();
    render(
      <PanelChanges
        cwd="/repo"
        changes={{
          branch: "main",
          files: [{ path: "src/a.ts", status: "modified", insertions: 4, deletions: 2 }],
        }}
        loading={false}
        error={null}
        onRefresh={() => {}}
        onOpenInEditor={() => {}}
      />,
    );
    fireEvent.click(screen.getByText("src/a.ts"));
    await waitFor(() =>
      expect(window.relay.gitFileDiff).toHaveBeenCalledWith("/repo", "src/a.ts"),
    );
  });

  it("shows an empty state outside a repository and a retry when it errors", () => {
    const { rerender } = render(
      <PanelChanges
        cwd="/plain"
        changes={null}
        loading={false}
        error={null}
        onRefresh={() => {}}
        onOpenInEditor={() => {}}
      />,
    );
    expect(screen.getByText("No repository in this folder")).toBeTruthy();

    const refresh = vi.fn();
    rerender(
      <PanelChanges
        cwd="/repo"
        changes={null}
        loading={false}
        error="git failed"
        onRefresh={refresh}
        onOpenInEditor={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(refresh).toHaveBeenCalled();
  });
});
