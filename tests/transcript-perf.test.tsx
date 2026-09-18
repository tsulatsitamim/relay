// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import type { TranscriptEvent } from "../src/shared/types.ts";

const markdownSpy = vi.hoisted(() => vi.fn());

vi.mock("../src/renderer/Markdown", () => ({
  Markdown: ({ text }: { text: string }) => {
    markdownSpy(text);
    return <div className="markdown">{text}</div>;
  },
}));

import { Transcript } from "../src/renderer/Transcript.tsx";

afterEach(() => {
  cleanup();
  markdownSpy.mockReset();
});

function buildTurns(count: number): TranscriptEvent[] {
  const events: TranscriptEvent[] = [];
  for (let index = 0; index < count; index += 1) {
    events.push({
      id: `u${index}`,
      kind: "user",
      payload: { text: `prompt ${index}` },
    });
    events.push({
      id: `a${index}`,
      kind: "agent_message",
      payload: { text: `reply ${index}` },
    });
  }
  return events;
}

describe("Transcript render performance", () => {
  it("re-parses markdown for only the appended chunk", () => {
    const events = buildTurns(12);
    const { container, rerender } = render(<Transcript events={events} />);
    const initialParses = markdownSpy.mock.calls.length;
    const initialRows = container.querySelectorAll(".msg-row").length;
    expect(initialParses).toBeGreaterThan(0);
    expect(initialRows).toBeGreaterThan(0);

    const last = events[events.length - 1]!;
    const appended: TranscriptEvent[] = [
      ...events.slice(0, -1),
      { ...last, payload: { ...last.payload, text: "reply 11 plus a streamed chunk" } },
    ];
    rerender(<Transcript events={appended} />);
    expect(markdownSpy.mock.calls.length - initialParses).toBe(1);
    expect(container.querySelectorAll(".msg-row").length).toBe(initialRows);
  });

  it("keeps the rendered row count stable when an append does not add rows", () => {
    const events = buildTurns(12);
    const { container, rerender } = render(<Transcript events={events} />);
    const rows = container.querySelectorAll(".msg-row").length;
    const last = events[events.length - 1]!;
    rerender(
      <Transcript
        events={[
          ...events.slice(0, -1),
          { ...last, payload: { ...last.payload, text: "changed" } },
        ]}
      />,
    );
    expect(container.querySelectorAll(".msg-row").length).toBe(rows);
  });
});
