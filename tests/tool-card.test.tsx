// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToolCallCard } from "../src/renderer/ToolCallCard.tsx";

afterEach(cleanup);

describe("ToolCallCard", () => {
  it("renders the title, kind and status label", () => {
    render(
      <ToolCallCard
        toolCall={{ title: "Edit README.md", kind: "edit", status: "completed" }}
      />,
    );
    expect(screen.getByText("Edit README.md")).toBeTruthy();
    expect(screen.getByText("edit")).toBeTruthy();
    expect(screen.getByText("Completed")).toBeTruthy();
  });

  it("keeps a finished tool collapsed until expanded", async () => {
    render(
      <ToolCallCard
        toolCall={{
          title: "Edit README.md",
          status: "completed",
          rawInput: { path: "README.md" },
        }}
      />,
    );
    expect(screen.queryByText("Input")).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: /Edit README.md/i }));

    expect(screen.getByText("Input")).toBeTruthy();
    expect(screen.getByText(/"path": "README\.md"/)).toBeTruthy();
  });

  it("opens automatically while the tool is running", () => {
    render(
      <ToolCallCard
        toolCall={{ title: "Reading files", status: "in_progress", rawInput: { q: 1 } }}
      />,
    );
    expect(screen.getByText("Running")).toBeTruthy();
    expect(screen.getByText("Input")).toBeTruthy();
  });

  it("shows the locations the tool touched", () => {
    render(
      <ToolCallCard
        toolCall={{
          title: "Edit",
          status: "completed",
          locations: [{ path: "src/a.ts" }],
        }}
      />,
    );
    expect(screen.getByText("src/a.ts")).toBeTruthy();
  });
});
