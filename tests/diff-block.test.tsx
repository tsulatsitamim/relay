// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { DiffBlock } from "../src/renderer/DiffBlock.tsx";
import { unifiedDiff } from "../src/shared/diff.ts";
import type { DiffComment } from "../src/shared/types.ts";

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

  it("shows a transient message when the open action resolves false", async () => {
    const onOpen = vi.fn().mockResolvedValue(false);
    const { container } = render(
      <DiffBlock path="src/a.ts" oldText={"a\n"} newText={"b\n"} onOpen={onOpen} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Open in editor" }));
    expect(await screen.findByText("Could not open file")).toBeTruthy();
    expect(container.querySelector(".diff-open-error")).toBeTruthy();
  });

  it("does not show a message when the open action resolves true", async () => {
    const onOpen = vi.fn().mockResolvedValue(true);
    render(<DiffBlock path="src/a.ts" oldText={"a\n"} newText={"b\n"} onOpen={onOpen} />);
    fireEvent.click(screen.getByRole("button", { name: "Open in editor" }));
    await Promise.resolve();
    expect(screen.queryByText("Could not open file")).toBeNull();
  });

  it("copies the unified diff text through the clipboard action", () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(<DiffBlock path="src/a.ts" oldText={"a\n"} newText={"b\n"} />);
    fireEvent.click(screen.getByRole("button", { name: "Copy diff" }));
    expect(writeText).toHaveBeenCalledWith(unifiedDiff("a\n", "b\n", "src/a.ts"));
  });
});

const OLD = "a\nb\nc\n";
const NEW = "a\nB\nc\nd\n";

function comment(overrides: Partial<DiffComment> = {}): DiffComment {
  return {
    id: "c1",
    sessionId: "s1",
    eventId: "e1",
    path: "src/a.ts",
    startLine: 2,
    endLine: 2,
    body: "rename this",
    createdAt: 0,
    ...overrides,
  };
}

describe("DiffBlock comments", () => {
  it("offers a comment button on new-file lines only", () => {
    render(
      <DiffBlock
        path="src/a.ts"
        oldText={OLD}
        newText={NEW}
        onAddComment={() => {}}
      />,
    );
    expect(screen.getByRole("button", { name: "Comment on line 1" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Comment on line 4" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Comment on line 0" })).toBeNull();
  });

  it("omits the comment buttons when no handler is provided", () => {
    render(<DiffBlock path="src/a.ts" oldText={OLD} newText={NEW} />);
    expect(screen.queryByRole("button", { name: /Comment on line/ })).toBeNull();
  });

  it("opens an inline form from the gutter button", () => {
    render(
      <DiffBlock
        path="src/a.ts"
        oldText={OLD}
        newText={NEW}
        onAddComment={() => {}}
      />,
    );
    expect(screen.queryByRole("textbox", { name: "Comment body" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Comment on line 3" }));
    expect(screen.getByRole("textbox", { name: "Comment body" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Add comment" })).toBeTruthy();
    expect(document.querySelector(".diff-comment-form")).toBeTruthy();
  });

  it("submits the comment with 1-based new-file line numbers", () => {
    const onAddComment = vi.fn();
    render(
      <DiffBlock
        path="src/a.ts"
        oldText={OLD}
        newText={NEW}
        onAddComment={onAddComment}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Comment on line 2" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Comment body" }), {
      target: { value: "  use a map here  " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add comment" }));
    expect(onAddComment).toHaveBeenCalledWith({
      path: "src/a.ts",
      startLine: 2,
      endLine: 2,
      body: "  use a map here  ",
    });
    expect(screen.queryByRole("textbox", { name: "Comment body" })).toBeNull();
  });

  it("cancels the form without submitting", () => {
    const onAddComment = vi.fn();
    render(
      <DiffBlock
        path="src/a.ts"
        oldText={OLD}
        newText={NEW}
        onAddComment={onAddComment}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Comment on line 1" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Comment body" }), {
      target: { value: "nope" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onAddComment).not.toHaveBeenCalled();
    expect(screen.queryByRole("textbox", { name: "Comment body" })).toBeNull();
  });

  it("does not toggle the surrounding details when using the gutter", () => {
    render(
      <DiffBlock
        path="src/a.ts"
        oldText={OLD}
        newText={NEW}
        onAddComment={() => {}}
      />,
    );
    const details = document.querySelector(".diff") as HTMLDetailsElement;
    expect(details.open).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Comment on line 1" }));
    expect(details.open).toBe(false);
  });

  it("extends the range with shift-click and submits the whole range", () => {
    const onAddComment = vi.fn();
    render(
      <DiffBlock
        path="src/a.ts"
        oldText={OLD}
        newText={NEW}
        onAddComment={onAddComment}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Comment on line 2" }));
    fireEvent.click(screen.getByRole("button", { name: "Comment on line 4" }), {
      shiftKey: true,
    });
    fireEvent.change(screen.getByRole("textbox", { name: "Comment body" }), {
      target: { value: "split this up" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add comment" }));
    expect(onAddComment).toHaveBeenCalledWith({
      path: "src/a.ts",
      startLine: 2,
      endLine: 4,
      body: "split this up",
    });
  });

  it("renders existing comments with their line reference", () => {
    const { container } = render(
      <DiffBlock
        path="src/a.ts"
        oldText={OLD}
        newText={NEW}
        comments={[comment(), comment({ id: "c2", startLine: 3, endLine: 4, body: "both" })]}
      />,
    );
    const list = container.querySelector(".diff-comments");
    expect(list).toBeTruthy();
    expect(container.querySelectorAll(".diff-comment")).toHaveLength(2);
    expect(list!.textContent).toContain("src/a.ts:2");
    expect(list!.textContent).toContain("src/a.ts:3-4");
    expect(list!.textContent).toContain("rename this");
    expect(list!.textContent).toContain("both");
  });

  it("marks a sent comment", () => {
    const { container } = render(
      <DiffBlock
        path="src/a.ts"
        oldText={OLD}
        newText={NEW}
        comments={[comment({ sentAt: 5 })]}
      />,
    );
    const item = container.querySelector(".diff-comment");
    expect(item?.classList.contains("sent")).toBe(true);
  });

  it("deletes a comment", () => {
    const onDeleteComment = vi.fn();
    render(
      <DiffBlock
        path="src/a.ts"
        oldText={OLD}
        newText={NEW}
        comments={[comment({ id: "gone" })]}
        onDeleteComment={onDeleteComment}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Delete comment" }));
    expect(onDeleteComment).toHaveBeenCalledWith("gone");
  });

  it("shows the comment count in the header", () => {
    const { container } = render(
      <DiffBlock
        path="src/a.ts"
        oldText={OLD}
        newText={NEW}
        comments={[comment(), comment({ id: "c2" })]}
      />,
    );
    expect(container.querySelector(".diff-head .diff-comment-count")?.textContent).toBe(
      "2",
    );
    expect(container.querySelector(".diff-comment-count")).toBeTruthy();
  });

  it("sends only the unsent comment ids", () => {
    const onSendReview = vi.fn();
    render(
      <DiffBlock
        path="src/a.ts"
        oldText={OLD}
        newText={NEW}
        comments={[comment({ id: "sent", sentAt: 1 }), comment({ id: "fresh" })]}
        onSendReview={onSendReview}
      />,
    );
    const button = screen.getByRole("button", { name: "Send review" });
    expect(button.hasAttribute("disabled")).toBe(false);
    fireEvent.click(button);
    expect(onSendReview).toHaveBeenCalledWith(["fresh"]);
  });

  it("disables send review while every comment is already sent", () => {
    render(
      <DiffBlock
        path="src/a.ts"
        oldText={OLD}
        newText={NEW}
        comments={[comment({ sentAt: 1 })]}
        onSendReview={() => {}}
      />,
    );
    expect(screen.getByRole("button", { name: "Send review" }).hasAttribute("disabled")).toBe(
      true,
    );
  });

  it("disables send review with no comments and hides it without a handler", () => {
    const { rerender } = render(
      <DiffBlock path="src/a.ts" oldText={OLD} newText={NEW} onSendReview={() => {}} />,
    );
    expect(screen.getByRole("button", { name: "Send review" }).hasAttribute("disabled")).toBe(
      true,
    );
    rerender(<DiffBlock path="src/a.ts" oldText={OLD} newText={NEW} />);
    expect(screen.queryByRole("button", { name: "Send review" })).toBeNull();
  });
});

describe("DiffBlock view toggle", () => {
  it("reports the active mode and requests a switch without toggling the details", () => {
    const onView = vi.fn();
    const { container } = render(
      <DiffBlock
        path="src/a.ts"
        oldText={OLD}
        newText={NEW}
        view="unified"
        onView={onView}
      />,
    );
    expect(screen.getByRole("group", { name: "Diff view" })).toBeTruthy();
    const unified = screen.getByRole("button", { name: "Unified" });
    const split = screen.getByRole("button", { name: "Split" });
    expect(unified.getAttribute("aria-pressed")).toBe("true");
    expect(split.getAttribute("aria-pressed")).toBe("false");

    fireEvent.click(split);
    expect(onView).toHaveBeenCalledWith("split");
    const details = container.querySelector(".diff") as HTMLDetailsElement;
    expect(details.open).toBe(false);
  });

  it("omits the toggle when no view handler is provided", () => {
    render(<DiffBlock path="src/a.ts" oldText={OLD} newText={NEW} />);
    expect(screen.queryByRole("group", { name: "Diff view" })).toBeNull();
  });
});

describe("DiffBlock split view", () => {
  it("renders both columns with add, delete and blank cells", () => {
    const { container } = render(
      <DiffBlock
        path="src/a.ts"
        oldText={"a\nb\nc\n"}
        newText={"a\nB\nc\nd\n"}
        view="split"
        onView={() => {}}
      />,
    );
    expect(container.querySelector(".diff-split")).toBeTruthy();
    expect(container.querySelectorAll(".diff-split-row")).toHaveLength(4);
    expect(container.querySelectorAll(".diff-split-row .diff-cell")).toHaveLength(8);
    expect(container.querySelectorAll(".diff-cell.diff-add-line")).toHaveLength(2);
    expect(container.querySelectorAll(".diff-cell.diff-del-line")).toHaveLength(1);
    expect(container.querySelectorAll(".diff-cell.diff-cell-empty")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Split" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
  });

  it("comments on a deletion against the nearest new-file line", () => {
    const onAddComment = vi.fn();
    const { container } = render(
      <DiffBlock
        path="src/a.ts"
        oldText={"a\nb\nc\n"}
        newText={"a\nb\n"}
        view="split"
        onView={() => {}}
        onAddComment={onAddComment}
      />,
    );
    const buttons = screen.getAllByRole("button", { name: "Comment on line 2" });
    fireEvent.click(buttons[1]!);
    const details = container.querySelector(".diff") as HTMLDetailsElement;
    expect(details.open).toBe(false);
    fireEvent.change(screen.getByRole("textbox", { name: "Comment body" }), {
      target: { value: "drop this" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add comment" }));
    expect(onAddComment).toHaveBeenCalledWith({
      path: "src/a.ts",
      startLine: 2,
      endLine: 2,
      body: "drop this",
    });
  });
});
