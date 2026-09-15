// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { HomeComposer } from "../src/renderer/HomeComposer";
import type { AgentConfig, Repo } from "../src/shared/types";

afterEach(cleanup);
const agents: AgentConfig[] = [{ id: "fake", name: "Fake" }];
const repos: Repo[] = [{ path: "/tmp/repo", name: "repo", branch: "main" }];

function setup(recents: string[] = []) {
  const onSubmit = vi.fn().mockResolvedValue(undefined);
  render(
    <HomeComposer
      agents={agents}
      repos={repos}
      recents={recents}
      agentId="fake"
      repoPath="/tmp/repo"
      busy={false}
      error={null}
      onAgentId={vi.fn()}
      onRepoPath={vi.fn()}
      onSubmit={onSubmit}
    />,
  );
  return { onSubmit, field: screen.getByRole("textbox") as HTMLTextAreaElement };
}

describe("HomeComposer", () => {
  it("submits on Enter", () => {
    const { onSubmit, field } = setup();
    fireEvent.change(field, { target: { value: "hello" } });
    fireEvent.keyDown(field, { key: "Enter" });
    expect(onSubmit).toHaveBeenCalledWith("hello");
  });

  it("inserts a newline on Shift+Enter", () => {
    const { onSubmit, field } = setup();
    fireEvent.change(field, { target: { value: "hello" } });
    fireEvent.keyDown(field, { key: "Enter", shiftKey: true });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("offers recent folders that are not already in the sidebar", () => {
    setup(["/tmp/old", "/tmp/repo"]);
    expect(screen.getAllByRole("option", { name: "/tmp/old" })).toHaveLength(1);
    expect(screen.queryAllByRole("option", { name: "/tmp/repo" })).toHaveLength(0);
  });
});
