// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { BranchPill } from "../src/renderer/BranchPill.tsx";

afterEach(() => {
  cleanup();
  delete (window as any).relay;
});

function mount(result: { branch: string; worktree: boolean } | null) {
  const branchInfo = vi.fn().mockResolvedValue(result);
  (window as any).relay = { branchInfo };
  const view = render(<BranchPill cwd="/tmp/repo" />);
  return { branchInfo, ...view };
}

describe("BranchPill", () => {
  it("shows the branch name once it has resolved", async () => {
    mount({ branch: "main", worktree: false });
    expect(await screen.findByText("main")).toBeTruthy();
  });

  it("marks a linked worktree", async () => {
    mount({ branch: "feature", worktree: true });
    expect(await screen.findByText("feature")).toBeTruthy();
    expect(screen.getByText("worktree")).toBeTruthy();
  });

  it("renders nothing when the path is not a git repository", async () => {
    const { container, branchInfo } = mount(null);
    await waitFor(() => expect(branchInfo).toHaveBeenCalledWith("/tmp/repo"));
    expect(container.querySelector(".branch-pill")).toBeNull();
  });

  it("does not call the bridge without a working directory", () => {
    const branchInfo = vi.fn().mockResolvedValue({ branch: "main", worktree: false });
    (window as any).relay = { branchInfo };
    render(<BranchPill cwd="" />);
    expect(branchInfo).not.toHaveBeenCalled();
  });
});
