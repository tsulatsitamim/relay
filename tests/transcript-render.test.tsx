// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { Transcript } from "../src/renderer/Transcript.tsx";
import type { TranscriptEvent } from "../src/shared/types.ts";

afterEach(cleanup);

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
});
