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

  it("collapses when a running tool completes", () => {
    const { rerender } = render(
      <ToolCallCard
        toolCall={{ title: "Reading files", status: "in_progress", rawInput: { q: 1 } }}
      />,
    );
    expect(screen.getByText("Input")).toBeTruthy();

    rerender(
      <ToolCallCard
        toolCall={{ title: "Reading files", status: "completed", rawInput: { q: 1 } }}
      />,
    );

    expect(screen.queryByText("Input")).toBeNull();
  });

  it("keeps a user-expanded card open after the tool completes", async () => {
    const { rerender } = render(
      <ToolCallCard
        toolCall={{ title: "Reading files", status: "pending", rawInput: { q: 1 } }}
      />,
    );
    expect(screen.queryByText("Input")).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: /Reading files/i }));
    expect(screen.getByText("Input")).toBeTruthy();

    rerender(
      <ToolCallCard
        toolCall={{ title: "Reading files", status: "in_progress", rawInput: { q: 1 } }}
      />,
    );
    expect(screen.getByText("Input")).toBeTruthy();

    rerender(
      <ToolCallCard
        toolCall={{ title: "Reading files", status: "completed", rawInput: { q: 1 } }}
      />,
    );
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

  it("shows a read icon for a read tool", () => {
    const { container } = render(
      <ToolCallCard
        toolCall={{ title: "Read file", kind: "read", status: "completed" }}
      />,
    );
    expect(container.querySelector(".tool-head .tool-icon .lucide-file-text")).toBeTruthy();
  });

  it("shows an execute icon for an execute tool", () => {
    const { container } = render(
      <ToolCallCard
        toolCall={{ title: "Run tests", kind: "execute", status: "completed" }}
      />,
    );
    expect(container.querySelector(".tool-head .tool-icon .lucide-terminal")).toBeTruthy();
  });

  it("shows a generic icon for an unknown kind", () => {
    const { container } = render(
      <ToolCallCard
        toolCall={{ title: "Mystery work", kind: "mystery", status: "completed" }}
      />,
    );
    expect(container.querySelector(".tool-head .tool-icon .lucide-wrench")).toBeTruthy();
  });

  it("keeps the status indicator and aria-expanded behavior with an icon", async () => {
    const { container } = render(
      <ToolCallCard
        toolCall={{
          title: "Read file",
          kind: "read",
          status: "completed",
          rawInput: { path: "a" },
        }}
      />,
    );
    const head = container.querySelector(".tool-head")!;
    expect(head.querySelector(".tool-status")).toBeTruthy();
    expect(head.getAttribute("aria-expanded")).toBe("false");
    expect(head.querySelector(".tool-title")?.textContent).toBe("Read file");
    expect(head.querySelector(".tool-state")?.textContent).toBe("Completed");
    expect(head.querySelector(".tool-chevron")?.classList.contains("open")).toBe(false);

    await userEvent.click(head);

    expect(head.getAttribute("aria-expanded")).toBe("true");
    expect(head.querySelector(".lucide-file-text")).toBeTruthy();
    expect(head.querySelector(".tool-chevron")?.classList.contains("open")).toBe(true);
    expect(container.querySelector(".tool-body")).toBeTruthy();
  });
});
