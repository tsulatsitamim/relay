// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { WorkingStatus } from "../src/renderer/WorkingStatus.tsx";

afterEach(cleanup);

describe("WorkingStatus", () => {
  it("shows Working · 0s right after the prompt was sent", () => {
    render(<WorkingStatus active since={Date.now()} />);
    expect(screen.getByText("Working · 0s")).toBeTruthy();
  });

  it("renders nothing when the session is idle", () => {
    const { container } = render(<WorkingStatus active={false} since={Date.now()} />);
    expect(container.querySelector(".thread-status")).toBeNull();
  });

  it("falls back to 0s while working without a since timestamp", () => {
    render(<WorkingStatus active />);
    expect(screen.getByText("Working · 0s")).toBeTruthy();
  });

  it("shows animated dots while working", () => {
    const { container } = render(<WorkingStatus active since={Date.now()} />);
    expect(container.querySelectorAll(".dots i")).toHaveLength(3);
  });

  it("renders a transcript row variant with the same timer", () => {
    const { container } = render(
      <WorkingStatus active since={Date.now()} variant="row" />,
    );
    expect(container.querySelector(".working-row")).toBeTruthy();
    expect(screen.getByText("Working · 0s")).toBeTruthy();
  });

  it("omits the row class for the header variant", () => {
    const { container } = render(<WorkingStatus active since={Date.now()} />);
    expect(container.querySelector(".working-row")).toBeNull();
    expect(container.querySelector(".thread-status")).toBeTruthy();
  });
});
