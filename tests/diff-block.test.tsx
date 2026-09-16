// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { DiffBlock } from "../src/renderer/DiffBlock.tsx";
import { unifiedDiff } from "../src/shared/diff.ts";

afterEach(() => {
  cleanup();
  delete (navigator as { clipboard?: unknown }).clipboard;
});

describe("DiffBlock", () => {
  it("shows the path and add/remove counts", () => {
    const { container } = render(
      <DiffBlock path="src/a.ts" oldText={"a\nb\nc\n"} newText={"a\nB\nc\nd\n"} />,
    );
    expect(screen.getByText("src/a.ts")).toBeTruthy();
    expect(screen.getByText("+2")).toBeTruthy();
    expect(screen.getByText("-1")).toBeTruthy();
    expect(container.querySelector(".diff-add")).toBeTruthy();
    expect(container.querySelector(".diff-del")).toBeTruthy();
  });

  it("toggles reviewed and reflects the reviewed prop", () => {
    const onToggleReviewed = vi.fn();
    const { container, rerender } = render(
      <DiffBlock
        path="src/a.ts"
        oldText={"a\n"}
        newText={"b\n"}
        reviewed={false}
        onToggleReviewed={onToggleReviewed}
      />,
    );
    const button = screen.getByRole("button", { name: "Reviewed" });
    expect(button.getAttribute("aria-pressed")).toBe("false");

    fireEvent.click(button);
    expect(onToggleReviewed).toHaveBeenCalledTimes(1);

    rerender(
      <DiffBlock
        path="src/a.ts"
        oldText={"a\n"}
        newText={"b\n"}
        reviewed
        onToggleReviewed={onToggleReviewed}
      />,
    );
    expect(screen.getByRole("button", { name: "Reviewed" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
    expect(container.querySelector(".diff-reviewed")?.classList.contains("on")).toBe(
      true,
    );
  });

  it("opens the diff through the open action", () => {
    const onOpen = vi.fn();
    render(
      <DiffBlock path="src/a.ts" oldText={"a\n"} newText={"b\n"} onOpen={onOpen} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Open in editor" }));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("omits the open action when no handler is provided", () => {
    render(<DiffBlock path="src/a.ts" oldText={"a\n"} newText={"b\n"} />);
    expect(screen.queryByRole("button", { name: "Open in editor" })).toBeNull();
  });

  it("copies the unified diff text through the clipboard action", () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(<DiffBlock path="src/a.ts" oldText={"a\n"} newText={"b\n"} />);
    fireEvent.click(screen.getByRole("button", { name: "Copy diff" }));
    expect(writeText).toHaveBeenCalledWith(unifiedDiff("a\n", "b\n", "src/a.ts"));
  });
});
