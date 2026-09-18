// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Transcript } from "../src/renderer/Transcript.tsx";
import { formatDay, formatTime } from "../src/renderer/time.ts";
import type { TranscriptEvent } from "../src/shared/types.ts";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  delete (navigator as { clipboard?: unknown }).clipboard;
});

function fakeClipboardItem() {
  const items: Record<string, Blob>[] = [];
  class FakeClipboardItem {
    constructor(record: Record<string, Blob>) {
      items.push(record);
    }
  }
  vi.stubGlobal("ClipboardItem", FakeClipboardItem);
  return items;
}

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

  it("copies an agent message as rich html with the rendered markup", async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { write, writeText } });
    const items = fakeClipboardItem();
    const events: TranscriptEvent[] = [
      { id: "1", kind: "agent_message", payload: { text: "## Result\n\n**bold**" } },
    ];
    render(<Transcript events={events} />);
    fireEvent.click(screen.getByRole("button", { name: "Copy message" }));
    expect(write).toHaveBeenCalledTimes(1);
    expect(writeText).not.toHaveBeenCalled();
    const html = await items[0]!["text/html"]!.text();
    expect(html).toContain("<h2>Result</h2>");
    expect(html).toContain("<strong>bold</strong>");
    expect(html).not.toContain("msg-actions");
    expect(html).not.toContain("<button");
  });

  it("keeps user message copy as plain text", () => {
    const write = vi.fn().mockResolvedValue(undefined);
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { write, writeText } });
    fakeClipboardItem();
    const events: TranscriptEvent[] = [
      { id: "1", kind: "user", payload: { text: "**not markdown**" } },
    ];
    render(<Transcript events={events} />);
    fireEvent.click(screen.getByRole("button", { name: "Copy message" }));
    expect(write).not.toHaveBeenCalled();
    expect(writeText).toHaveBeenCalledWith("**not markdown**");
  });

  it("opens an inline editor pre-filled when a user message body is clicked", () => {
    const onEditUser = vi.fn();
    const events: TranscriptEvent[] = [
      { id: "1", kind: "user", payload: { text: "try again" } },
    ];
    const { container } = render(
      <Transcript events={events} onEditUser={onEditUser} />,
    );
    fireEvent.click(container.querySelector(".msg.user")!);
    const box = screen.getByRole("textbox", {
      name: "Edit message text",
    }) as HTMLTextAreaElement;
    expect(box.value).toBe("try again");
  });

  it("saves an inline edit through onEditUser", () => {
    const onEditUser = vi.fn();
    const events: TranscriptEvent[] = [
      { id: "1", kind: "user", payload: { text: "try again" } },
    ];
    const { container } = render(
      <Transcript events={events} onEditUser={onEditUser} />,
    );
    fireEvent.click(container.querySelector(".msg.user")!);
    const box = screen.getByRole("textbox", { name: "Edit message text" });
    fireEvent.change(box, { target: { value: "try harder" } });
    fireEvent.click(screen.getByRole("button", { name: "Save edit" }));
    expect(onEditUser).toHaveBeenCalledWith("try harder", "1");
  });

  it("saves on Enter and keeps Shift+Enter for newlines", () => {
    const onEditUser = vi.fn();
    const events: TranscriptEvent[] = [
      { id: "1", kind: "user", payload: { text: "try again" } },
    ];
    const { container } = render(
      <Transcript events={events} onEditUser={onEditUser} />,
    );
    fireEvent.click(container.querySelector(".msg.user")!);
    const box = screen.getByRole("textbox", { name: "Edit message text" });
    fireEvent.change(box, { target: { value: "line one\nline two" } });
    fireEvent.keyDown(box, { key: "Enter", shiftKey: true });
    expect(onEditUser).not.toHaveBeenCalled();
    fireEvent.keyDown(box, { key: "Enter" });
    expect(onEditUser).toHaveBeenCalledWith("line one\nline two", "1");
  });

  it("does not call onEditUser when an inline edit is cancelled with Escape", () => {
    const onEditUser = vi.fn();
    const events: TranscriptEvent[] = [
      { id: "1", kind: "user", payload: { text: "try again" } },
    ];
    const { container } = render(
      <Transcript events={events} onEditUser={onEditUser} />,
    );
    fireEvent.click(container.querySelector(".msg.user")!);
    const box = screen.getByRole("textbox", { name: "Edit message text" });
    fireEvent.change(box, { target: { value: "discard me" } });
    fireEvent.keyDown(box, { key: "Escape" });
    expect(onEditUser).not.toHaveBeenCalled();
    expect(screen.queryByRole("textbox", { name: "Edit message text" })).toBeNull();
  });

  it("does not open an inline editor when onEditUser is absent", () => {
    const events: TranscriptEvent[] = [
      { id: "1", kind: "user", payload: { text: "try again" } },
    ];
    const { container } = render(<Transcript events={events} />);
    fireEvent.click(container.querySelector(".msg.user")!);
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("does not open the inline editor when the footer copy button is clicked", () => {
    const onEditUser = vi.fn();
    const events: TranscriptEvent[] = [
      { id: "1", kind: "user", payload: { text: "try again" } },
    ];
    render(<Transcript events={events} onEditUser={onEditUser} />);
    fireEvent.click(screen.getByRole("button", { name: "Copy message" }));
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("has no regenerate action", () => {
    const events: TranscriptEvent[] = [
      { id: "u1", kind: "user", payload: { text: "q1" } },
      { id: "a1", kind: "agent_message", payload: { text: "one" } },
      { id: "u2", kind: "user", payload: { text: "q2" } },
      { id: "a2", kind: "agent_message", payload: { text: "two" } },
    ];
    render(<Transcript events={events} />);
    expect(screen.queryByRole("button", { name: "Regenerate answer" })).toBeNull();
  });

  it("renders copy in the footer of user and agent messages", () => {
    const events: TranscriptEvent[] = [
      { id: "u1", kind: "user", payload: { text: "hello" } },
      { id: "a1", kind: "agent_message", payload: { text: "world" } },
    ];
    const { container } = render(<Transcript events={events} />);
    const foots = container.querySelectorAll(".msg-foot");
    expect(foots).toHaveLength(2);
    expect(foots[0]!.querySelector(".msg-actions")).toBeTruthy();
    expect(foots[1]!.querySelector(".msg-actions")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Copy message" })).toHaveLength(2);
  });

  it("renders the timestamp inside the message footer", () => {
    const ts = new Date(2026, 0, 2, 9, 5).getTime();
    const events: TranscriptEvent[] = [
      { id: "u1", kind: "user", payload: { text: "hello" }, createdAt: ts },
      { id: "a1", kind: "agent_message", payload: { text: "world" }, createdAt: ts },
    ];
    const { container } = render(<Transcript events={events} />);
    const foots = container.querySelectorAll(".msg-foot");
    expect(foots[0]!.querySelector(".msg-time")?.textContent).toBe(formatTime(ts));
    expect(foots[1]!.querySelector(".msg-time")?.textContent).toBe(formatTime(ts));
  });

  it("renders the user footer below and outside the bubble", () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    const ts = new Date(2026, 0, 2, 9, 5).getTime();
    const events: TranscriptEvent[] = [
      { id: "u1", kind: "user", payload: { text: "hello" }, createdAt: ts },
      { id: "a1", kind: "agent_message", payload: { text: "world" }, createdAt: ts },
    ];
    const { container } = render(<Transcript events={events} />);
    const user = container.querySelector(".msg.user")!;
    const bubble = user.querySelector(".msg-bubble");
    const foot = user.querySelector(".msg-foot");
    expect(bubble).toBeTruthy();
    expect(foot).toBeTruthy();
    expect(bubble!.contains(foot!)).toBe(false);
    expect(foot!.contains(bubble!)).toBe(false);
    expect(bubble!.textContent).toContain("hello");
    expect(foot!.querySelector(".msg-time")?.textContent).toBe(formatTime(ts));
    const copy = foot!.querySelector<HTMLButtonElement>(".msg-actions button")!;
    fireEvent.click(copy);
    expect(writeText).toHaveBeenCalledWith("hello");
  });

  it("does not render an edit affordance on agent messages", () => {
    const events: TranscriptEvent[] = [
      { id: "a1", kind: "agent_message", payload: { text: "world" } },
    ];
    const { container } = render(<Transcript events={events} onEditUser={vi.fn()} />);
    const agent = container.querySelector(".msg.agent")!;
    expect(agent.querySelector(".msg-actions")?.textContent).toBe("");
    expect(agent.querySelector(".msg-actions .lucide-copy")).toBeTruthy();
  });

  it("renders the copy action as an icon-only button with a tooltip", () => {
    const events: TranscriptEvent[] = [
      { id: "u1", kind: "user", payload: { text: "hello" } },
      { id: "a1", kind: "agent_message", payload: { text: "world" } },
    ];
    const { container } = render(<Transcript events={events} />);
    const buttons = screen.getAllByRole("button", { name: "Copy message" });
    expect(buttons).toHaveLength(2);
    for (const button of buttons) {
      expect(button.textContent).toBe("");
      expect(button.getAttribute("title")).toBe("Copy");
      expect(button.querySelector("svg.lucide-copy")).toBeTruthy();
    }
    expect(container.textContent).not.toContain("Copy");
  });

  it("swaps the copy icon for a check and reverts after the feedback delay", () => {
    vi.useFakeTimers();
    try {
      const writeText = vi.fn().mockResolvedValue(undefined);
      Object.assign(navigator, { clipboard: { writeText } });
      const events: TranscriptEvent[] = [
        { id: "a1", kind: "agent_message", payload: { text: "the answer" } },
      ];
      render(<Transcript events={events} />);
      const button = screen.getByRole("button", { name: "Copy message" });
      expect(button.querySelector("svg.lucide-copy")).toBeTruthy();
      fireEvent.click(button);
      expect(writeText).toHaveBeenCalledWith("the answer");
      expect(button.querySelector("svg.lucide-check")).toBeTruthy();
      expect(button.querySelector("svg.lucide-copy")).toBeNull();
      act(() => {
        vi.advanceTimersByTime(1200);
      });
      expect(button.querySelector("svg.lucide-copy")).toBeTruthy();
      expect(button.querySelector("svg.lucide-check")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("renders the inline edit actions as icon-only buttons", () => {
    const events: TranscriptEvent[] = [
      { id: "1", kind: "user", payload: { text: "try again" } },
    ];
    const { container } = render(<Transcript events={events} onEditUser={vi.fn()} />);
    fireEvent.click(container.querySelector(".msg.user")!);
    const save = screen.getByRole("button", { name: "Save edit" });
    const cancel = screen.getByRole("button", { name: "Cancel edit" });
    expect(save.textContent).toBe("");
    expect(cancel.textContent).toBe("");
    expect(save.querySelector("svg.lucide-check")).toBeTruthy();
    expect(cancel.querySelector("svg.lucide-x")).toBeTruthy();
  });

  it("cancels an inline edit through the cancel button", () => {
    const onEditUser = vi.fn();
    const events: TranscriptEvent[] = [
      { id: "1", kind: "user", payload: { text: "try again" } },
    ];
    const { container } = render(<Transcript events={events} onEditUser={onEditUser} />);
    fireEvent.click(container.querySelector(".msg.user")!);
    const box = screen.getByRole("textbox", { name: "Edit message text" });
    fireEvent.change(box, { target: { value: "discard me" } });
    fireEvent.click(screen.getByRole("button", { name: "Cancel edit" }));
    expect(onEditUser).not.toHaveBeenCalled();
    expect(screen.queryByRole("textbox", { name: "Edit message text" })).toBeNull();
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

  it("renders the overlay scrollbar inside the transcript wrap", () => {
    const events: TranscriptEvent[] = [
      { id: "1", kind: "user", payload: { text: "hello" } },
    ];
    const { container } = render(<Transcript events={events} />);
    const wrap = container.querySelector(".transcript-wrap");
    expect(wrap?.querySelector(".overlay-scroll-track")).toBeTruthy();
    expect(wrap?.querySelector(".transcript")?.getAttribute("role")).toBe("log");
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

  it("marks the transcript as streaming only while the session is working", () => {
    const events: TranscriptEvent[] = [
      { id: "1", kind: "user", payload: { text: "a" } },
    ];
    const { container, rerender } = render(<Transcript events={events} />);
    const log = container.querySelector(".transcript");
    expect(log?.hasAttribute("data-streaming")).toBe(false);

    rerender(<Transcript events={events} streaming />);
    expect(log?.hasAttribute("data-streaming")).toBe(true);
  });

  it("does not replay the entrance animation for rows that predate streaming", () => {
    const events: TranscriptEvent[] = [
      { id: "u1", kind: "user", payload: { text: "q1" } },
      { id: "a1", kind: "agent_message", payload: { text: "one" } },
      { id: "u2", kind: "user", payload: { text: "q2" } },
    ];
    const { container } = render(<Transcript events={events} streaming />);
    expect(container.querySelectorAll(".msg-row[data-streaming-row]")).toHaveLength(0);
  });

  it("marks only rows appended while streaming", () => {
    const events: TranscriptEvent[] = [
      { id: "u1", kind: "user", payload: { text: "q1" } },
      { id: "a1", kind: "agent_message", payload: { text: "one" } },
    ];
    const { container, rerender } = render(<Transcript events={events} streaming />);
    rerender(
      <Transcript
        events={[...events, { id: "a2", kind: "agent_message", payload: { text: "two" } }]}
        streaming
      />,
    );
    const marked = container.querySelectorAll(".msg-row[data-streaming-row]");
    expect(marked).toHaveLength(1);
    expect(marked[0]!.getAttribute("data-event-id")).toBe("a2");
  });

  it("clears the streaming row markers when streaming ends", () => {
    const events: TranscriptEvent[] = [
      { id: "u1", kind: "user", payload: { text: "q1" } },
    ];
    const streamingEvents = [
      ...events,
      { id: "a1", kind: "agent_message", payload: { text: "one" } },
    ];
    const { container, rerender } = render(<Transcript events={events} streaming />);
    rerender(<Transcript events={streamingEvents} streaming />);
    expect(container.querySelectorAll(".msg-row[data-streaming-row]")).toHaveLength(1);

    rerender(<Transcript events={streamingEvents} />);
    expect(container.querySelectorAll(".msg-row[data-streaming-row]")).toHaveLength(0);
  });
});

describe("user message collapse", () => {
  const long = "x".repeat(700);

  it("renders a long user message collapsed with a show button", () => {
    const { container } = render(
      <Transcript events={[{ id: "1", kind: "user", payload: { text: long } }]} />,
    );
    const text = container.querySelector(".msg-text");
    expect(text).toBeTruthy();
    expect(text!.classList.contains("collapsed")).toBe(true);
    expect(screen.getByRole("button", { name: "Show full message" })).toBeTruthy();
  });

  it("expands a collapsed message and flips the label to show less", () => {
    const { container } = render(
      <Transcript events={[{ id: "1", kind: "user", payload: { text: long } }]} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Show full message" }));
    expect(container.querySelector(".msg-text")!.classList.contains("collapsed")).toBe(false);
    expect(screen.getByRole("button", { name: "Show less" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Show full message" })).toBeNull();
  });

  it("collapses a message that exceeds the line limit", () => {
    const lines = Array.from({ length: 9 }, (_, i) => `line ${i}`).join("\n");
    render(
      <Transcript events={[{ id: "1", kind: "user", payload: { text: lines } }]} />,
    );
    expect(screen.getByRole("button", { name: "Show full message" })).toBeTruthy();
  });

  it("does not collapse a short user message", () => {
    const { container } = render(
      <Transcript
        events={[{ id: "1", kind: "user", payload: { text: "short note" } }]}
      />,
    );
    expect(container.querySelector(".msg-text")).toBeNull();
    expect(screen.queryByRole("button", { name: "Show full message" })).toBeNull();
  });

  it("does not open the inline editor when the expand button is clicked", () => {
    const onEditUser = vi.fn();
    render(
      <Transcript
        events={[{ id: "1", kind: "user", payload: { text: long } }]}
        onEditUser={onEditUser}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Show full message" }));
    expect(screen.queryByRole("textbox", { name: "Edit message text" })).toBeNull();
  });

  it("shows the full text in the editor when editing a collapsed message", () => {
    const onEditUser = vi.fn();
    const { container } = render(
      <Transcript
        events={[{ id: "1", kind: "user", payload: { text: long } }]}
        onEditUser={onEditUser}
      />,
    );
    fireEvent.click(container.querySelector(".msg.user")!);
    const box = screen.getByRole("textbox", {
      name: "Edit message text",
    }) as HTMLTextAreaElement;
    expect(box.value).toBe(long);
  });

  it("keeps attachments and the footer on a long collapsed message", () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    const ts = new Date(2026, 0, 2, 9, 5).getTime();
    const { container } = render(
      <Transcript
        events={[
          {
            id: "1",
            kind: "user",
            payload: {
              text: long,
              attachments: [{ name: "shot.png", mimeType: "image/png" }],
            },
            createdAt: ts,
          },
        ]}
      />,
    );
    expect(screen.getByText("shot.png")).toBeTruthy();
    const foot = container.querySelector(".msg.user .msg-foot");
    expect(foot?.querySelector(".msg-time")?.textContent).toBe(formatTime(ts));
    fireEvent.click(screen.getByRole("button", { name: "Copy message" }));
    expect(writeText).toHaveBeenCalledWith(long);
  });
});

describe("agent message cap", () => {
  const big = "a".repeat(40000);

  it("caps a giant agent message and shows a notice", () => {
    const { container } = render(
      <Transcript
        events={[{ id: "1", kind: "agent_message", payload: { text: big } }]}
      />,
    );
    expect(screen.getByText("Message capped at 32,000 characters")).toBeTruthy();
    const rendered = container.querySelector(".markdown")?.textContent ?? "";
    expect(rendered.length).toBeGreaterThan(0);
    expect(rendered.length).toBeLessThan(big.length);
  });

  it("does not cap a short agent message", () => {
    const { container } = render(
      <Transcript
        events={[{ id: "1", kind: "agent_message", payload: { text: "brief" } }]}
      />,
    );
    expect(container.querySelector(".msg-cap")).toBeNull();
  });

  it("copies the full uncapped agent message text", () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(
      <Transcript
        events={[{ id: "1", kind: "agent_message", payload: { text: big } }]}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Copy message" }));
    expect(writeText).toHaveBeenCalledWith(big);
  });
});

describe("user message rewind and fork actions", () => {
  const events: TranscriptEvent[] = [
    { id: "u1", kind: "user", payload: { text: "hello there" } },
    { id: "a1", kind: "agent_message", payload: { text: "world" } },
  ];

  it("renders the actions only when their callbacks are provided", () => {
    const { rerender } = render(<Transcript events={events} />);
    expect(screen.queryByRole("button", { name: "Rewind to this message" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Fork as new chat" })).toBeNull();

    rerender(<Transcript events={events} onRewind={vi.fn()} onFork={vi.fn()} />);
    expect(screen.getAllByRole("button", { name: "Rewind to this message" })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "Fork as new chat" })).toHaveLength(1);
  });

  it("does not add the actions to agent messages", () => {
    const { container } = render(<Transcript events={events} onRewind={vi.fn()} onFork={vi.fn()} />);
    const agent = container.querySelector(".msg.agent")!;
    expect(agent.querySelector('[aria-label="Rewind to this message"]')).toBeNull();
    expect(agent.querySelector('[aria-label="Fork as new chat"]')).toBeNull();
  });

  it("calls the callbacks with the message text and event id", () => {
    const onRewind = vi.fn();
    const onFork = vi.fn();
    render(<Transcript events={events} onRewind={onRewind} onFork={onFork} />);
    fireEvent.click(screen.getByRole("button", { name: "Rewind to this message" }));
    fireEvent.click(screen.getByRole("button", { name: "Fork as new chat" }));
    expect(onRewind).toHaveBeenCalledWith("u1", "hello there");
    expect(onFork).toHaveBeenCalledWith("hello there");
  });

  it("exposes matching tooltips on the icon actions", () => {
    render(<Transcript events={events} onRewind={vi.fn()} onFork={vi.fn()} />);
    expect(
      screen.getByRole("button", { name: "Rewind to this message" }).getAttribute("title"),
    ).toBe("Rewind");
    expect(
      screen.getByRole("button", { name: "Fork as new chat" }).getAttribute("title"),
    ).toBe("Fork");
  });
});

describe("Transcript diff comments", () => {
  const diffEvents: TranscriptEvent[] = [
    {
      id: "d1",
      kind: "diff",
      payload: { path: "src/a.ts", oldText: "a\nb\nc\n", newText: "a\nB\nc\nd\n" },
    },
  ];

  const comments = [
    {
      id: "c1",
      sessionId: "s1",
      eventId: "d1",
      path: "src/a.ts",
      startLine: 2,
      endLine: 4,
      body: "collapse these",
      createdAt: 0,
    },
  ];

  it("threads comments into a single rendered diff", () => {
    const { container } = render(
      <Transcript events={diffEvents} diffComments={comments} />,
    );
    const list = container.querySelector(".diff-comments");
    expect(list?.textContent).toContain("src/a.ts:2-4");
    expect(list?.textContent).toContain("collapse these");
    expect(container.querySelector(".diff-comment.sent")).toBeNull();
  });

  it("keeps diff comments out of unrelated events", () => {
    const { container } = render(
      <Transcript
        events={[
          ...diffEvents,
          { id: "a1", kind: "agent_message", payload: { text: "done" } },
        ]}
        diffComments={[{ ...comments[0]!, eventId: "other" }]}
      />,
    );
    expect(container.querySelector(".diff-comments")).toBeNull();
  });

  it("adds a comment through the transcript callback with the event id", () => {
    const onAddDiffComment = vi.fn();
    render(
      <Transcript
        events={diffEvents}
        diffComments={comments}
        onAddDiffComment={onAddDiffComment}
        onToggleReviewed={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Comment on line 1" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Comment body" }), {
      target: { value: "rename" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add comment" }));
    expect(onAddDiffComment).toHaveBeenCalledWith("d1", {
      path: "src/a.ts",
      startLine: 1,
      endLine: 1,
      body: "rename",
    });
  });

  it("deletes a comment through the transcript callback", () => {
    const onDeleteDiffComment = vi.fn();
    render(
      <Transcript
        events={diffEvents}
        diffComments={comments}
        onDeleteDiffComment={onDeleteDiffComment}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Delete comment" }));
    expect(onDeleteDiffComment).toHaveBeenCalledWith("c1");
  });

  it("sends the unsent ids through the transcript callback", () => {
    const onSendDiffReview = vi.fn();
    render(
      <Transcript
        events={diffEvents}
        diffComments={[...comments, { ...comments[0]!, id: "c2", sentAt: 5 }]}
        onSendDiffReview={onSendDiffReview}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Send review" }));
    expect(onSendDiffReview).toHaveBeenCalledWith(["c1"]);
  });
});
