// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { WorkingStatus } from "../src/renderer/WorkingStatus.tsx";

afterEach(cleanup);

describe("WorkingStatus", () => {
  it("shows Working · 0s right after the prompt was sent", () => {
    render(<WorkingStatus status="working" since={Date.now()} />);
    expect(screen.getByText("Working · 0s")).toBeTruthy();
  });

  it("renders nothing when the session is idle", () => {
    const { container } = render(<WorkingStatus status="idle" since={Date.now()} />);
    expect(container.querySelector(".thread-status")).toBeNull();
  });

  it("falls back to 0s while working without a since timestamp", () => {
    render(<WorkingStatus status="working" />);
    expect(screen.getByText("Working · 0s")).toBeTruthy();
  });
});
