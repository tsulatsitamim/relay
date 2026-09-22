// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PanelChanges } from "../src/renderer/right-panel/PanelChanges.tsx";
import { useGitChanges } from "../src/renderer/right-panel/useGitChanges.ts";
import type { RelayBridge } from "../src/renderer/env.d.ts";
import type { GitChangesResult } from "../src/shared/git.ts";

afterEach(() => {
  cleanup();
  delete (window as { relay?: unknown }).relay;
});

function bridge(overrides: Partial<RelayBridge> = {}): RelayBridge {
  return {
    gitChanges: vi.fn(async () => ({
      branch: "main",
      root: "/repo",
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

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

describe("PanelChanges", () => {
  it("lists changed files with their line counts", () => {
    render(
      <PanelChanges
        cwd="/repo"
        changes={{
          branch: "main",
          root: "/repo",
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
          root: "/repo",
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

  it("opens a file in the editor from the keyboard", async () => {
    const user = userEvent.setup();
    const onOpenInEditor = vi.fn();
    window.relay = bridge();
    render(
      <PanelChanges
        cwd="/repo"
        changes={{
          branch: "main",
          root: "/repo",
          files: [{ path: "src/a.ts", status: "modified", insertions: 4, deletions: 2 }],
        }}
        loading={false}
        error={null}
        onRefresh={() => {}}
        onOpenInEditor={onOpenInEditor}
      />,
    );
    const open = screen.getByRole("button", { name: "Open src/a.ts in editor" });
    open.focus();
    await user.keyboard("{Enter}");
    expect(onOpenInEditor).toHaveBeenCalledWith("src/a.ts", "/repo");
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

describe("useGitChanges", () => {
  it("ignores a stale in-flight result after cwd becomes null", async () => {
    const pending = deferred<GitChangesResult | null>();
    const gitChanges = vi.fn(() => pending.promise);
    window.relay = bridge({ gitChanges });
    const { result, rerender } = renderHook(
      ({ cwd }: { cwd: string | null }) => useGitChanges(cwd),
      { initialProps: { cwd: "/repo" as string | null } },
    );
    await waitFor(() => expect(gitChanges).toHaveBeenCalledWith("/repo"));

    rerender({ cwd: null });
    await act(async () => {
      pending.resolve({
        branch: "main",
        root: "/repo",
        files: [{ path: "src/a.ts", status: "modified", insertions: 4, deletions: 2 }],
      });
      await pending.promise;
    });

    expect(result.current.changes).toBeNull();
    expect(result.current.loading).toBe(false);
  });
});
