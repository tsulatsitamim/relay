// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { useRef } from "react";
import { MinimapRail } from "../src/renderer/MinimapRail.tsx";

const rafSpy = vi.hoisted(() => vi.fn());
const cafSpy = vi.hoisted(() => vi.fn());

let frames: FrameRequestCallback[] = [];
let nextHandle = 0;

beforeEach(() => {
  frames = [];
  nextHandle = 0;
  rafSpy.mockReset();
  cafSpy.mockReset();
  rafSpy.mockImplementation((callback: FrameRequestCallback) => {
    frames.push(callback);
    nextHandle += 1;
    return nextHandle;
  });
  vi.stubGlobal("requestAnimationFrame", rafSpy);
  vi.stubGlobal("cancelAnimationFrame", cafSpy);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const turns = [
  { id: "u1", prompt: "one", reply: "" },
  { id: "u2", prompt: "two", reply: "" },
  { id: "u3", prompt: "three", reply: "" },
];

function Harness() {
  const scrollRef = useRef<HTMLDivElement>(null);
  return (
    <div className="transcript-wrap">
      <div className="transcript" ref={scrollRef}>
        <div data-user-turn="0" />
        <div data-user-turn="1" />
        <div data-user-turn="2" />
      </div>
      <MinimapRail turns={turns} scrollRef={scrollRef} onJump={() => {}} />
    </div>
  );
}

function flushFrame() {
  const pending = frames;
  frames = [];
  act(() => {
    for (const callback of pending) callback(0);
  });
}

describe("MinimapRail scroll sync throttle", () => {
  it("coalesces several scroll events into a single sync per frame", () => {
    const querySelectorAll = vi.spyOn(Element.prototype, "querySelectorAll");
    const syncs = () =>
      querySelectorAll.mock.calls.filter(
        ([selector]) => selector === "[data-user-turn]",
      ).length;
    const { container } = render(<Harness />);
    const scroller = container.querySelector(".transcript") as HTMLElement;
    querySelectorAll.mockClear();

    fireEvent.scroll(scroller);
    fireEvent.scroll(scroller);
    fireEvent.scroll(scroller);

    expect(rafSpy).toHaveBeenCalledTimes(1);
    expect(syncs()).toBe(0);

    flushFrame();

    expect(syncs()).toBe(1);
  });

  it("runs a trailing sync after the last scroll event", () => {
    const querySelectorAll = vi.spyOn(Element.prototype, "querySelectorAll");
    const syncs = () =>
      querySelectorAll.mock.calls.filter(
        ([selector]) => selector === "[data-user-turn]",
      ).length;
    const { container } = render(<Harness />);
    const scroller = container.querySelector(".transcript") as HTMLElement;
    querySelectorAll.mockClear();

    fireEvent.scroll(scroller);
    flushFrame();
    expect(syncs()).toBe(1);

    fireEvent.scroll(scroller);
    fireEvent.scroll(scroller);
    expect(syncs()).toBe(1);
    flushFrame();
    expect(syncs()).toBe(2);
  });

  it("cancels the pending frame on unmount", () => {
    const { container, unmount } = render(<Harness />);
    const scroller = container.querySelector(".transcript") as HTMLElement;

    fireEvent.scroll(scroller);
    const handle = rafSpy.mock.results[rafSpy.mock.results.length - 1]?.value;
    expect(frames).toHaveLength(1);

    unmount();

    expect(cafSpy).toHaveBeenCalledWith(handle);
  });
});
