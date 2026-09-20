// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { useGitChanges } from "../src/renderer/right-panel/useGitChanges.ts";
import type { RelayBridge } from "../src/renderer/env.d.ts";

afterEach(() => {
  cleanup();
  delete (window as { relay?: unknown }).relay;
});

function mockGitChanges() {
  const gitChanges = vi.fn().mockResolvedValue({ branch: "main", files: [] });
  window.relay = { gitChanges } as unknown as RelayBridge;
  return gitChanges;
}

describe("useGitChanges", () => {
  it("fetches on mount and when the cwd changes", async () => {
    const gitChanges = mockGitChanges();
    const { rerender } = renderHook(
      ({ cwd }: { cwd: string }) => useGitChanges(cwd),
      { initialProps: { cwd: "/repo" } },
    );
    await waitFor(() => expect(gitChanges).toHaveBeenCalledTimes(1));
    expect(gitChanges).toHaveBeenLastCalledWith("/repo");
    rerender({ cwd: "/other" });
    await waitFor(() => expect(gitChanges).toHaveBeenCalledTimes(2));
    expect(gitChanges).toHaveBeenLastCalledWith("/other");
  });

  it("refreshes when the window regains focus", async () => {
    const gitChanges = mockGitChanges();
    renderHook(() => useGitChanges("/repo"));
    await waitFor(() => expect(gitChanges).toHaveBeenCalledTimes(1));
    act(() => {
      window.dispatchEvent(new Event("focus"));
    });
    await waitFor(() => expect(gitChanges).toHaveBeenCalledTimes(2));
  });

  it("refreshes when the refresh revision changes, but not when it repeats", async () => {
    const gitChanges = mockGitChanges();
    const { rerender } = renderHook(
      ({ key }: { key: number }) => useGitChanges("/repo", key),
      { initialProps: { key: 0 } },
    );
    await waitFor(() => expect(gitChanges).toHaveBeenCalledTimes(1));
    rerender({ key: 1 });
    await waitFor(() => expect(gitChanges).toHaveBeenCalledTimes(2));
    rerender({ key: 1 });
    expect(gitChanges).toHaveBeenCalledTimes(2);
  });

  it("does not fetch without a cwd and clears the result", async () => {
    const gitChanges = mockGitChanges();
    const { result } = renderHook(() => useGitChanges(null));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(gitChanges).not.toHaveBeenCalled();
    expect(result.current.changes).toBeNull();
  });
});
