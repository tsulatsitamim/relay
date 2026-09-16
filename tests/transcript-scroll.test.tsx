// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Transcript } from "../src/renderer/Transcript.tsx";
import type { TranscriptEvent } from "../src/shared/types.ts";

afterEach(cleanup);

const events: TranscriptEvent[] = [{ id: "1", kind: "user", payload: { text: "hello" } }];

function setMetrics(
  el: HTMLElement,
  m: { scrollTop: number; scrollHeight: number; clientHeight: number },
) {
  Object.defineProperty(el, "scrollHeight", { value: m.scrollHeight, configurable: true });
  Object.defineProperty(el, "clientHeight", { value: m.clientHeight, configurable: true });
  Object.defineProperty(el, "scrollTop", { value: m.scrollTop, writable: true, configurable: true });
}

describe("Transcript smart scroll", () => {
  it("offers a jump-to-latest button only when scrolled away from the bottom", () => {
    const { container } = render(<Transcript events={events} />);
    const scroller = container.querySelector(".transcript") as HTMLElement;

    expect(screen.queryByRole("button", { name: /jump to latest/i })).toBeNull();

    setMetrics(scroller, { scrollTop: 100, scrollHeight: 1000, clientHeight: 200 });
    fireEvent.scroll(scroller);
    expect(screen.getByRole("button", { name: /jump to latest/i })).toBeTruthy();

    setMetrics(scroller, { scrollTop: 795, scrollHeight: 1000, clientHeight: 200 });
    fireEvent.scroll(scroller);
    expect(screen.queryByRole("button", { name: /jump to latest/i })).toBeNull();
  });

  it("returns to the bottom when the jump button is clicked", () => {
    const { container } = render(<Transcript events={events} />);
    const scroller = container.querySelector(".transcript") as HTMLElement;
    setMetrics(scroller, { scrollTop: 50, scrollHeight: 1000, clientHeight: 200 });
    fireEvent.scroll(scroller);

    fireEvent.click(screen.getByRole("button", { name: /jump to latest/i }));

    expect(scroller.scrollTop).toBe(1000);
    expect(screen.queryByRole("button", { name: /jump to latest/i })).toBeNull();
  });

  it("keeps auto-scrolling to the end while following", () => {
    const first: TranscriptEvent[] = [{ id: "1", kind: "user", payload: { text: "hi" } }];
    const { container, rerender } = render(<Transcript events={first} />);
    const scroller = container.querySelector(".transcript") as HTMLElement;
    setMetrics(scroller, { scrollTop: 795, scrollHeight: 1000, clientHeight: 200 });
    fireEvent.scroll(scroller);

    rerender(
      <Transcript
        events={[...first, { id: "2", kind: "agent_message", payload: { text: "yo" } }]}
      />,
    );

    expect(scroller.scrollTop).toBe(1000);
  });

  it("does not auto-scroll while free", () => {
    const first: TranscriptEvent[] = [{ id: "1", kind: "user", payload: { text: "hi" } }];
    const { container, rerender } = render(<Transcript events={first} />);
    const scroller = container.querySelector(".transcript") as HTMLElement;
    setMetrics(scroller, { scrollTop: 100, scrollHeight: 1000, clientHeight: 200 });
    fireEvent.scroll(scroller);

    rerender(
      <Transcript
        events={[...first, { id: "2", kind: "agent_message", payload: { text: "yo" } }]}
      />,
    );

    expect(scroller.scrollTop).toBe(100);
  });

  it("anchors a newly sent user message near the top of the viewport", () => {
    const scrollIntoView = vi.fn();
    Object.defineProperty(Element.prototype, "scrollIntoView", {
      value: scrollIntoView,
      writable: true,
      configurable: true,
    });
    const before: TranscriptEvent[] = [
      { id: "1", kind: "agent_message", payload: { text: "previous" } },
    ];
    const { rerender } = render(<Transcript events={before} />);
    scrollIntoView.mockClear();

    rerender(
      <Transcript
        events={[...before, { id: "2", kind: "user", payload: { text: "new prompt" } }]}
      />,
    );

    expect(scrollIntoView).toHaveBeenCalledWith({ block: "start" });
    const anchored = scrollIntoView.mock.instances.find(
      (node) => node instanceof HTMLElement && node.dataset.eventId === "2",
    );
    expect(anchored).toBeTruthy();
    delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
  });

  it("does not anchor user messages that are already loaded as history", () => {
    const scrollIntoView = vi.fn();
    Object.defineProperty(Element.prototype, "scrollIntoView", {
      value: scrollIntoView,
      writable: true,
      configurable: true,
    });
    const history: TranscriptEvent[] = [
      { id: "1", kind: "agent_message", payload: { text: "previous" } },
      { id: "2", kind: "user", payload: { text: "old prompt" } },
    ];
    render(<Transcript events={history} />);
    expect(scrollIntoView).not.toHaveBeenCalled();
    delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
  });
});
