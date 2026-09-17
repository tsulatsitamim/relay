// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Transcript } from "../src/renderer/Transcript.tsx";
import { unifiedDiff } from "../src/shared/diff.ts";
import type { TranscriptEvent } from "../src/shared/types.ts";

afterEach(() => {
  cleanup();
  delete (navigator as { clipboard?: unknown }).clipboard;
});

const events: TranscriptEvent[] = [
  {
    id: "d1",
    kind: "diff",
    payload: { path: "a.ts", oldText: "a\nb\n", newText: "a\nB\nc\n" },
  },
  {
    id: "d2",
    kind: "diff",
    payload: { path: "b.ts", oldText: null, newText: "x\ny\n" },
  },
  {
    id: "d3",
    kind: "diff",
    payload: { path: "c.ts", oldText: "x\n", newText: "x\n" },
  },
];

describe("diff group summary card", () => {
  it("renders a compact card with the file count and total changes", () => {
    const { container } = render(<Transcript events={events} />);
    const group = container.querySelector(".diffgroup");
    expect(group).toBeTruthy();
    expect(screen.getByText("3 changed files")).toBeTruthy();
    expect(group!.querySelector(".diffgroup-total")?.textContent).toContain("+4");
    expect(group!.querySelector(".diffgroup-total")?.textContent).toContain("-1");
  });

  it("lists each changed file with its own add/remove counts", () => {
    const { container } = render(<Transcript events={events} />);
    const files = container.querySelectorAll(".diffgroup-file");
    expect(files).toHaveLength(3);
    expect(files[0]!.textContent).toContain("a.ts");
    expect(files[0]!.querySelector(".diff-add")?.textContent).toBe("+2");
    expect(files[0]!.querySelector(".diff-del")?.textContent).toBe("-1");
    expect(files[1]!.textContent).toContain("b.ts");
    expect(files[1]!.querySelector(".diff-add")?.textContent).toBe("+2");
    expect(files[2]!.textContent).toContain("c.ts");
  });

  it("keeps diff bodies hidden until expanded, then reveals them", () => {
    const { container } = render(<Transcript events={events} />);
    expect(container.querySelectorAll(".diffgroup-body .diff")).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: /changed files/i }));
    expect(container.querySelectorAll(".diffgroup-body .diff")).toHaveLength(3);
    expect(container.querySelectorAll(".diffgroup-body .diff-body")).toHaveLength(3);
  });

  it("keeps each expanded diff's reviewed action tied to its event id", () => {
    const onToggleReviewed = vi.fn();
    render(<Transcript events={events} onToggleReviewed={onToggleReviewed} />);
    fireEvent.click(screen.getByRole("button", { name: /changed files/i }));
    const reviewed = screen.getAllByRole("button", { name: "Reviewed" });
    expect(reviewed).toHaveLength(3);
    fireEvent.click(reviewed[1]!);
    expect(onToggleReviewed).toHaveBeenCalledWith("d2");
  });

  it("keeps each expanded diff's copy action working", () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(<Transcript events={events} />);
    fireEvent.click(screen.getByRole("button", { name: /changed files/i }));
    const copies = screen.getAllByRole("button", { name: "Copy diff" });
    fireEvent.click(copies[0]!);
    expect(writeText).toHaveBeenCalledWith(
      unifiedDiff("a\nb\n", "a\nB\nc\n", "a.ts"),
    );
  });

  it("renders a single diff exactly as a plain block with no summary card", () => {
    const { container } = render(<Transcript events={[events[0]!]} />);
    expect(container.querySelector(".diffgroup")).toBeNull();
    expect(container.querySelectorAll(".diff")).toHaveLength(1);
    expect(screen.getByText("a.ts")).toBeTruthy();
  });
});
