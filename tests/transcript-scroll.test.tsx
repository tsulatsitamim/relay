// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
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
});
