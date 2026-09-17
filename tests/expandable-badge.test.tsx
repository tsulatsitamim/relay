// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ExpandableBadge } from "../src/renderer/ExpandableBadge.tsx";

afterEach(cleanup);

describe("ExpandableBadge", () => {
  it("renders the icon, label and meta inside a badge head", () => {
    const { container } = render(
      <ExpandableBadge
        icon={<span data-testid="icon" />}
        label={<span>Files</span>}
        meta={<span>3 changes</span>}
        open={false}
        onToggle={() => {}}
      />,
    );
    expect(screen.getByTestId("icon")).toBeTruthy();
    expect(screen.getByText("Files")).toBeTruthy();
    expect(screen.getByText("3 changes")).toBeTruthy();
    expect(container.querySelector(".badge-head")).toBeTruthy();
  });

  it("reflects open in aria-expanded and the chevron, and renders children only when open", () => {
    const { container, rerender } = render(
      <ExpandableBadge icon={null} label="Files" open={false} onToggle={() => {}}>
        <div>body</div>
      </ExpandableBadge>,
    );
    const head = container.querySelector(".badge-head")!;
    expect(head.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByText("body")).toBeNull();
    expect(container.querySelector(".badge-body")).toBeNull();
    expect(container.querySelector(".badge-chevron")?.classList.contains("open")).toBe(false);

    rerender(
      <ExpandableBadge icon={null} label="Files" open onToggle={() => {}}>
        <div>body</div>
      </ExpandableBadge>,
    );
    expect(head.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText("body")).toBeTruthy();
    expect(container.querySelector(".badge-body")).toBeTruthy();
    expect(container.querySelector(".badge-chevron")?.classList.contains("open")).toBe(true);
  });

  it("fires onToggle when the head is clicked", () => {
    const onToggle = vi.fn();
    render(
      <ExpandableBadge icon={null} label="Files" open={false} onToggle={onToggle} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Files" }));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("adds the provided className to the head", () => {
    const { container } = render(
      <ExpandableBadge
        icon={null}
        label="Files"
        open={false}
        onToggle={() => {}}
        className="thinking-head"
      />,
    );
    expect(container.querySelector(".badge-head.thinking-head")).toBeTruthy();
  });
});