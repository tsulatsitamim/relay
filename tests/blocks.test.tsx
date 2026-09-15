// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThinkingBlock } from "../src/renderer/ThinkingBlock.tsx";
import { PlanBlock } from "../src/renderer/PlanBlock.tsx";

afterEach(cleanup);

describe("ThinkingBlock", () => {
  it("hides the thought until the toggle is opened", async () => {
    render(<ThinkingBlock text="weighing options" />);
    expect(screen.queryByText("weighing options")).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: /Thinking/i }));

    expect(screen.getByText("weighing options")).toBeTruthy();
  });
});

describe("PlanBlock", () => {
  it("lists plan entries with a status indicator", () => {
    render(
      <PlanBlock
        entries={[
          { content: "Read the file", priority: "high", status: "completed" },
          { content: "Edit the file", priority: "medium", status: "in_progress" },
          { content: "Run tests", priority: "low", status: "pending" },
        ]}
      />,
    );

    expect(screen.getByText("Read the file")).toBeTruthy();
    expect(screen.getByText("Edit the file")).toBeTruthy();
    expect(screen.getByText("Run tests")).toBeTruthy();
    expect(screen.getByLabelText("completed")).toBeTruthy();
    expect(screen.getByLabelText("in progress")).toBeTruthy();
    expect(screen.getByLabelText("pending")).toBeTruthy();
  });
});
