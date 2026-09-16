// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Transcript } from "../src/renderer/Transcript.tsx";
import { formatDay, formatTime } from "../src/renderer/time.ts";
import type { TranscriptEvent } from "../src/shared/types.ts";

afterEach(() => {
  cleanup();
  delete (navigator as { clipboard?: unknown }).clipboard;
});

describe("Transcript rendering", () => {
  it("renders agent messages as markdown", () => {
    const events: TranscriptEvent[] = [
      { id: "1", kind: "agent_message", payload: { text: "## Result\n\n- one\n- two" } },
    ];
    render(<Transcript events={events} />);
    expect(screen.getByRole("heading", { level: 2, name: "Result" })).toBeTruthy();
    expect(screen.getByText("one")).toBeTruthy();
  });

  it("renders attachment names on user messages", () => {
    const events: TranscriptEvent[] = [
      {
        id: "1",
        kind: "user",
        payload: {
          text: "see this",
          attachments: [{ name: "shot.png", mimeType: "image/png" }],
        },
      },
    ];
    render(<Transcript events={events} />);
    expect(screen.getByText("shot.png")).toBeTruthy();
    expect(screen.getByText(/see this/)).toBeTruthy();
  });

  it("renders duplicate attachment names without key collisions", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const events: TranscriptEvent[] = [
      {
        id: "1",
        kind: "user",
        payload: {
          text: "two shots",
          attachments: [
            { name: "shot.png", mimeType: "image/png" },
            { name: "shot.png", mimeType: "image/png" },
          ],
        },
      },
    ];
    render(<Transcript events={events} />);
    expect(screen.getAllByText("shot.png")).toHaveLength(2);
    const keyWarnings = spy.mock.calls.filter((call) =>
      call.some((arg) => typeof arg === "string" && arg.includes("same key")),
    );
    expect(keyWarnings).toHaveLength(0);
    spy.mockRestore();
  });

  it("renders a thumbnail image for user attachments that carry a thumb", () => {
    const events: TranscriptEvent[] = [
      {
        id: "1",
        kind: "user",
        payload: {
          text: "see this",
          attachments: [
            {
              name: "a.png",
              mimeType: "image/png",
              thumb: "data:image/jpeg;base64,xyz",
            },
          ],
        },
      },
    ];
    const { container } = render(<Transcript events={events} />);
    const img = container.querySelector("img.msg-thumb") as HTMLImageElement | null;
    expect(img).toBeTruthy();
    expect(img?.getAttribute("src")).toBe("data:image/jpeg;base64,xyz");
  });

  it("omits the thumbnail image when an attachment has no thumb", () => {
    const events: TranscriptEvent[] = [
      {
        id: "1",
        kind: "user",
        payload: {
          text: "see this",
          attachments: [{ name: "a.png", mimeType: "image/png" }],
        },
      },
    ];
    const { container } = render(<Transcript events={events} />);
    expect(container.querySelector("img.msg-thumb")).toBeNull();
  });

  it("renders tool calls, thinking and plans through their components", () => {
    const events: TranscriptEvent[] = [
      { id: "1", kind: "thinking", payload: { text: "pondering" } },
      {
        id: "2",
        kind: "tool_call",
        payload: { title: "Edit README.md", kind: "edit", status: "completed" },
      },
      {
        id: "3",
        kind: "plan",
        payload: { entries: [{ content: "First step", status: "completed" }] },
      },
    ];
    render(<Transcript events={events} />);
    expect(screen.getByRole("button", { name: /Thinking/i })).toBeTruthy();
    expect(screen.getByText("Edit README.md")).toBeTruthy();
    expect(screen.getByText("First step")).toBeTruthy();
  });

  it("copies an agent message through the clipboard action", () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    const events: TranscriptEvent[] = [
      { id: "1", kind: "agent_message", payload: { text: "the answer" } },
    ];
    render(<Transcript events={events} />);
    fireEvent.click(screen.getByRole("button", { name: "Copy message" }));
    expect(writeText).toHaveBeenCalledWith("the answer");
  });

  it("edits a user message through the action when onEditUser is provided", () => {
    const onEditUser = vi.fn();
    const events: TranscriptEvent[] = [
      { id: "1", kind: "user", payload: { text: "try again" } },
    ];
    render(<Transcript events={events} onEditUser={onEditUser} />);
    fireEvent.click(screen.getByRole("button", { name: "Edit message" }));
    expect(onEditUser).toHaveBeenCalledWith("try again", "1");
  });

  it("offers regenerate only on the last agent message", () => {
    const onRegenerate = vi.fn();
    const events: TranscriptEvent[] = [
      { id: "u1", kind: "user", payload: { text: "q1" } },
      { id: "a1", kind: "agent_message", payload: { text: "one" } },
      { id: "u2", kind: "user", payload: { text: "q2" } },
      { id: "a2", kind: "agent_message", payload: { text: "two" } },
    ];
    render(<Transcript events={events} onRegenerate={onRegenerate} />);
    const buttons = screen.getAllByRole("button", { name: "Regenerate answer" });
    expect(buttons).toHaveLength(1);
    fireEvent.click(buttons[0]!);
    expect(onRegenerate).toHaveBeenCalledWith("a2");
  });

  it("omits regenerate when onRegenerate is not provided", () => {
    const events: TranscriptEvent[] = [
      { id: "a1", kind: "agent_message", payload: { text: "one" } },
    ];
    render(<Transcript events={events} />);
    expect(screen.queryByRole("button", { name: "Regenerate answer" })).toBeNull();
  });

  it("omits the edit action when onEditUser is not provided", () => {
    const events: TranscriptEvent[] = [
      { id: "1", kind: "user", payload: { text: "try again" } },
    ];
    render(<Transcript events={events} />);
    expect(screen.queryByRole("button", { name: "Edit message" })).toBeNull();
  });

  it("renders a usage line with tokens and cost", () => {
    const events: TranscriptEvent[] = [
      {
        id: "1",
        kind: "usage",
        payload: { used: 1500, size: 8000, costAmount: 0.0123, costCurrency: "USD" },
      },
    ];
    const { container } = render(<Transcript events={events} />);
    const usage = container.querySelector(".msg.usage");
    expect(usage?.textContent).toBe("1.5k / 8.0k tokens · USD0.0123");
  });

  it("renders nothing for an empty usage payload", () => {
    const events: TranscriptEvent[] = [{ id: "1", kind: "usage", payload: {} }];
    const { container } = render(<Transcript events={events} />);
    expect(container.querySelector(".msg.usage")).toBeNull();
  });

  it("wraps each event row in a containment container", () => {
    const events: TranscriptEvent[] = [
      { id: "1", kind: "user", payload: { text: "a" } },
      { id: "2", kind: "agent_message", payload: { text: "b" } },
    ];
    const { container } = render(<Transcript events={events} />);
    const rows = container.querySelectorAll(".transcript > .msg-row");
    expect(rows).toHaveLength(2);
  });

  it("announces new transcript content politely to assistive tech", () => {
    const { container } = render(<Transcript events={[]} />);
    const log = container.querySelector(".transcript");
    expect(log?.getAttribute("role")).toBe("log");
    expect(log?.getAttribute("aria-live")).toBe("polite");
    expect(log?.getAttribute("aria-relevant")).toBe("additions");
  });

  it("shows per-message times and day separators when events carry createdAt", () => {
    const day1 = new Date(2026, 0, 2, 9, 5).getTime();
    const day2 = new Date(2026, 0, 3, 9, 5).getTime();
    const events: TranscriptEvent[] = [
      { id: "1", kind: "user", payload: { text: "hi" }, createdAt: day1 },
      { id: "2", kind: "agent_message", payload: { text: "yo" }, createdAt: day2 },
    ];
    const { container } = render(<Transcript events={events} />);

    const times = container.querySelectorAll(".msg-time");
    expect(times).toHaveLength(2);
    expect(times[0].textContent).toBe(formatTime(day1));
    expect(times[1].textContent).toBe(formatTime(day2));

    const separators = container.querySelectorAll(".day-separator");
    expect(separators).toHaveLength(2);
    expect(separators[0].textContent).toBe(formatDay(day1));
    expect(separators[1].textContent).toBe(formatDay(day2));
  });

  it("omits message times and day separators for events without createdAt", () => {
    const events: TranscriptEvent[] = [
      { id: "1", kind: "user", payload: { text: "hi" } },
      { id: "2", kind: "agent_message", payload: { text: "yo" } },
    ];
    const { container } = render(<Transcript events={events} />);
    expect(container.querySelectorAll(".msg-time")).toHaveLength(0);
    expect(container.querySelectorAll(".day-separator")).toHaveLength(0);
  });

  it("emits a single day separator when an untimestamped event sits between same-day events", () => {
    const day1 = new Date(2026, 0, 2, 9, 5).getTime();
    const events: TranscriptEvent[] = [
      { id: "1", kind: "user", payload: { text: "a" }, createdAt: day1 },
      { id: "2", kind: "user", payload: { text: "b" } },
      { id: "3", kind: "user", payload: { text: "c" }, createdAt: day1 },
    ];
    const { container } = render(<Transcript events={events} />);
    expect(container.querySelectorAll(".day-separator")).toHaveLength(1);
    expect(container.querySelectorAll(".msg-time")).toHaveLength(2);
  });
});
