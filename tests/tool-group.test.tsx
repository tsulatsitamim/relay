// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { TranscriptEvent } from "../src/shared/types.ts";
import { ToolGroup } from "../src/renderer/ToolGroup.tsx";
import { toolGroupMeta, toolGroupSummary } from "../src/renderer/tool-group.ts";

afterEach(cleanup);

function call(
  id: string,
  kind: string,
  status = "completed",
  extra: Record<string, unknown> = {},
): TranscriptEvent {
  return {
    id,
    kind: "tool_call",
    payload: { title: `Run ${id}`, kind, status, ...extra },
  };
}

describe("toolGroupSummary", () => {
  it("summarizes edited files and executed commands", () => {
    expect(
      toolGroupSummary([call("1", "edit"), call("2", "edit"), call("3", "execute")]),
    ).toBe("Edited 2 files, ran 1 command");
  });

  it("returns an empty string with no events", () => {
    expect(toolGroupSummary([])).toBe("");
  });
});

describe("toolGroupMeta", () => {
  it("prioritizes error over running, pending and done", () => {
    expect(toolGroupMeta(["completed", "failed", "in_progress"])).toEqual({
      tone: "error",
      label: "Failed",
    });
  });

  it("reports running when any tool is in progress", () => {
    expect(toolGroupMeta(["completed", "in_progress"])).toEqual({
      tone: "running",
      label: "Running",
    });
  });

  it("reports pending when nothing has finished or failed", () => {
    expect(toolGroupMeta(["pending", "completed"])).toEqual({
      tone: "pending",
      label: "Pending",
    });
  });

  it("reports done when every tool completed", () => {
    expect(toolGroupMeta(["completed", "completed"])).toEqual({
      tone: "done",
      label: "Done",
    });
  });
});

describe("ToolGroup", () => {
  it("shows the count and hint with the cards collapsed", () => {
    render(<ToolGroup events={[call("1", "edit"), call("2", "edit"), call("3", "execute")]} />);
    expect(screen.getByText("3 tool calls")).toBeTruthy();
    expect(screen.getByText("Edited 2 files, ran 1 command")).toBeTruthy();
    expect(screen.queryByText("Run 1")).toBeNull();
  });

  it("expands to reveal one card per grouped event", async () => {
    const { container } = render(
      <ToolGroup events={[call("1", "edit"), call("2", "edit")]} />,
    );
    await userEvent.click(screen.getByRole("button", { name: /2 tool calls/i }));
    expect(container.querySelectorAll(".toolgroup-body .tool")).toHaveLength(2);
    expect(screen.getByText("Run 1")).toBeTruthy();
    expect(screen.getByText("Run 2")).toBeTruthy();
  });

  it("auto-opens while a grouped tool is running", () => {
    render(
      <ToolGroup
        events={[call("1", "edit", "in_progress", { rawInput: { a: 1 } }), call("2", "edit")]}
      />,
    );
    expect(screen.getAllByText("Running").length).toBeGreaterThan(0);
    expect(screen.getByText("Input")).toBeTruthy();
  });

  it("shows the first member's mapped icon in the summary row", () => {
    const { container } = render(<ToolGroup events={[call("1", "read"), call("2", "edit")]} />);
    expect(
      container.querySelector(".toolgroup-head .tool-icon .lucide-file-text"),
    ).toBeTruthy();
  });

  it("collapses the body when the run finishes", () => {
    const { container, rerender } = render(
      <ToolGroup
        events={[call("1", "edit", "in_progress", { rawInput: { a: 1 } }), call("2", "edit")]}
      />,
    );
    expect(container.querySelector(".toolgroup-body")).toBeTruthy();
    rerender(
      <ToolGroup
        events={[call("1", "edit", "completed", { rawInput: { a: 1 } }), call("2", "edit")]}
      />,
    );
    expect(container.querySelector(".toolgroup-body")).toBeNull();
  });
});
