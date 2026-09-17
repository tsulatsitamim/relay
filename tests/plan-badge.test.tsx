// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { PlanEntry } from "../src/shared/types.ts";
import { PlanBadge } from "../src/renderer/PlanBadge.tsx";

afterEach(cleanup);

const mixed: PlanEntry[] = [
  { content: "First step", status: "completed" },
  { content: "Second step", status: "in_progress" },
  { content: "Third step", status: "pending" },
  { content: "Fourth step", status: "completed" },
  { content: "Fifth step", status: "pending" },
];

describe("PlanBadge", () => {
  it("counts the completed entries and renders one segment per entry", () => {
    const { container } = render(<PlanBadge entries={mixed} />);
    expect(screen.getByText("2/5 tasks")).toBeTruthy();
    expect(container.querySelectorAll(".plan-seg")).toHaveLength(5);
    expect(container.querySelectorAll(".plan-seg-completed")).toHaveLength(2);
    expect(container.querySelectorAll(".plan-seg-in-progress")).toHaveLength(1);
    expect(container.querySelectorAll(".plan-seg-pending")).toHaveLength(2);
  });

  it("hides when there is no plan", () => {
    const { container } = render(<PlanBadge />);
    expect(container.querySelector(".plan-badge")).toBeNull();
  });

  it("hides an empty plan", () => {
    const { container } = render(<PlanBadge entries={[]} />);
    expect(container.querySelector(".plan-badge")).toBeNull();
  });

  it("reveals the entries with their statuses", async () => {
    render(<PlanBadge entries={mixed} />);
    await userEvent.click(screen.getByRole("button", { name: /2\/5 tasks/i }));
    expect(screen.getByText("First step")).toBeTruthy();
    expect(screen.getByText("Second step")).toBeTruthy();
    expect(screen.getByText("in progress")).toBeTruthy();
    expect(screen.getAllByText("completed")).toHaveLength(2);
    expect(screen.getAllByText("pending")).toHaveLength(2);
  });
});
