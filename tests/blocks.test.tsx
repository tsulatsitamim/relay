// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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

  it("renders the thought through the shared badge body", async () => {
    const { container } = render(<ThinkingBlock text="weighing options" />);
    await userEvent.click(screen.getByRole("button", { name: /Thinking/i }));
    expect(container.querySelector(".thinking .badge-body")).toBeTruthy();
    expect(container.querySelector(".thinking-body")).toBeNull();
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

const mixed = [
  { content: "First", status: "completed" },
  { content: "Second", status: "in_progress" },
  { content: "Third", status: "pending" },
  { content: "Fourth", status: "completed" },
  { content: "Fifth", status: "pending" },
];

describe("PlanBlock card", () => {
  it("shows the completed count and a status segment per entry", () => {
    const { container } = render(<PlanBlock entries={mixed} />);
    expect(container.querySelector(".plan-card")).toBeTruthy();
    expect(screen.getByText("2/5")).toBeTruthy();
    const progress = container.querySelector(".plan-progress");
    expect(progress?.querySelectorAll(".plan-seg")).toHaveLength(5);
    expect(progress?.querySelectorAll(".plan-seg-completed")).toHaveLength(2);
    expect(progress?.querySelectorAll(".plan-seg-in-progress")).toHaveLength(1);
    expect(progress?.querySelectorAll(".plan-seg-pending")).toHaveLength(2);
  });

  it("does not collapse a plan at or under the thresholds", () => {
    const { container } = render(<PlanBlock entries={mixed} />);
    expect(screen.queryByRole("button", { name: "Show all" })).toBeNull();
    expect(container.querySelector(".plan-list")?.classList.contains("collapsed")).toBe(
      false,
    );

    const eight = Array.from({ length: 8 }, (_, i) => ({
      content: `Step ${i}`,
      status: "pending" as const,
    }));
    const { container: full } = render(<PlanBlock entries={eight} />);
    expect(full.querySelector(".plan-list")?.classList.contains("collapsed")).toBe(false);
    expect(screen.queryByRole("button", { name: "Show all" })).toBeNull();
  });

  it("collapses and expands when there are more than eight entries", () => {
    const entries = Array.from({ length: 9 }, (_, i) => ({
      content: `Step ${i}`,
      status: "pending" as const,
    }));
    const { container } = render(<PlanBlock entries={entries} />);
    expect(container.querySelector(".plan-list")?.classList.contains("collapsed")).toBe(
      true,
    );
    const show = screen.getByRole("button", { name: "Show all" });
    expect(show.getAttribute("aria-expanded")).toBe("false");

    fireEvent.click(show);
    expect(container.querySelector(".plan-list")?.classList.contains("collapsed")).toBe(
      false,
    );
    const less = screen.getByRole("button", { name: "Show less" });
    expect(less.getAttribute("aria-expanded")).toBe("true");
  });

  it("collapses when the combined text exceeds the character threshold", () => {
    const entries = [
      { content: "x".repeat(500), status: "pending" },
      { content: "y".repeat(401), status: "completed" },
    ];
    const { container } = render(<PlanBlock entries={entries} />);
    expect(container.querySelector(".plan-list")?.classList.contains("collapsed")).toBe(
      true,
    );
    expect(screen.getByRole("button", { name: "Show all" })).toBeTruthy();
  });
});
