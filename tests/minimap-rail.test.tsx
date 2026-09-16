// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useRef } from "react";
import { MinimapRail } from "../src/renderer/MinimapRail.tsx";
import { Transcript } from "../src/renderer/Transcript.tsx";
import type { TranscriptEvent } from "../src/shared/types.ts";

afterEach(cleanup);

const turns = [
  { id: "u1", prompt: "first prompt", reply: "first reply" },
  { id: "u2", prompt: "second prompt", reply: "second reply" },
  { id: "u3", prompt: "third prompt", reply: "third reply" },
];

function Harness({
  items = turns,
  onJump = () => {},
}: {
  items?: typeof turns;
  onJump?: (index: number) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  return (
    <div className="transcript-wrap">
      <div className="transcript" ref={scrollRef} />
      <MinimapRail turns={items} scrollRef={scrollRef} onJump={onJump} />
    </div>
  );
}

function rect(top: number, height: number): DOMRect {
  return {
    top,
    bottom: top + height,
    left: 0,
    right: 0,
    width: 0,
    height,
    x: 0,
    y: top,
    toJSON: () => ({}),
  } as DOMRect;
}

describe("MinimapRail", () => {
  it("renders one tick per user message", () => {
    const { container } = render(<Harness />);
    expect(container.querySelectorAll(".minimap-tick")).toHaveLength(3);
  });

  it("stays hidden with fewer than two user turns", () => {
    const { container } = render(<Harness items={turns.slice(0, 1)} />);
    expect(container.querySelector(".minimap")).toBeNull();
  });

  it("is a focusable control with a jump label", () => {
    render(<Harness />);
    const rail = screen.getByRole("group", { name: /jump to message/i });
    expect(rail.getAttribute("tabindex")).toBe("0");
  });

  it("jumps to the clicked tick", () => {
    const onJump = vi.fn();
    const { container } = render(<Harness onJump={onJump} />);
    const ticks = container.querySelectorAll<HTMLButtonElement>(".minimap-tick");
    fireEvent.click(ticks[1]!);
    expect(onJump).toHaveBeenCalledWith(1);
  });

  it("shows a preview with the prompt and last reply while hovering", () => {
    const { container } = render(<Harness />);
    const ticks = container.querySelectorAll<HTMLButtonElement>(".minimap-tick");
    expect(container.querySelector(".minimap-preview")).toBeNull();
    fireEvent.mouseEnter(ticks[0]!);
    const preview = container.querySelector(".minimap-preview");
    expect(preview?.querySelector(".minimap-preview-prompt")?.textContent).toBe(
      "first prompt",
    );
    expect(preview?.querySelector(".minimap-preview-reply")?.textContent).toBe(
      "first reply",
    );
    fireEvent.mouseLeave(ticks[0]!);
    expect(container.querySelector(".minimap-preview")).toBeNull();
  });

  it("steps the active turn with the arrow keys and Enter", () => {
    const onJump = vi.fn();
    render(<Harness onJump={onJump} />);
    const rail = screen.getByRole("group", { name: /jump to message/i });
    fireEvent.keyDown(rail, { key: "ArrowDown" });
    expect(onJump).toHaveBeenLastCalledWith(1);
    fireEvent.keyDown(rail, { key: "ArrowUp" });
    expect(onJump).toHaveBeenLastCalledWith(0);
    fireEvent.keyDown(rail, { key: "End" });
    expect(onJump).toHaveBeenLastCalledWith(2);
    fireEvent.keyDown(rail, { key: "Home" });
    expect(onJump).toHaveBeenLastCalledWith(0);
    fireEvent.keyDown(rail, { key: "Enter" });
    expect(onJump).toHaveBeenLastCalledWith(0);
  });

  it("steps turns with the chevron buttons", () => {
    const onJump = vi.fn();
    const { container } = render(<Harness onJump={onJump} />);
    const down = container.querySelector<HTMLButtonElement>(".minimap-step.down");
    fireEvent.click(down!);
    expect(onJump).toHaveBeenLastCalledWith(1);
    const up = container.querySelector<HTMLButtonElement>(".minimap-step.up");
    fireEvent.click(up!);
    expect(onJump).toHaveBeenLastCalledWith(0);
  });
});

describe("Transcript minimap integration", () => {
  const events: TranscriptEvent[] = [
    { id: "u1", kind: "user", payload: { text: "one" } },
    { id: "a1", kind: "agent_message", payload: { text: "reply one" } },
    { id: "u2", kind: "user", payload: { text: "two" } },
    { id: "a2", kind: "agent_message", payload: { text: "reply two" } },
    { id: "u3", kind: "user", payload: { text: "three" } },
  ];

  it("tags user rows with their turn index and renders a tick each", () => {
    const { container } = render(<Transcript events={events} />);
    expect(container.querySelectorAll(".minimap-tick")).toHaveLength(3);
    expect(container.querySelector('[data-user-turn="1"]')?.textContent).toContain("two");
  });

  it("hides the rail for a single user turn", () => {
    const { container } = render(<Transcript events={events.slice(0, 2)} />);
    expect(container.querySelector(".minimap")).toBeNull();
  });

  it("scrolls the turn below the top and switches to free mode on a tick click", () => {
    const { container } = render(<Transcript events={events} />);
    const scroller = container.querySelector(".transcript") as HTMLElement;
    Object.defineProperty(scroller, "getBoundingClientRect", {
      value: () => rect(0, 0),
      configurable: true,
    });
    Object.defineProperty(scroller, "scrollTop", {
      value: 0,
      writable: true,
      configurable: true,
    });
    const row = container.querySelector<HTMLElement>('[data-user-turn="1"]')!;
    Object.defineProperty(row, "getBoundingClientRect", {
      value: () => rect(300, 40),
      configurable: true,
    });

    fireEvent.click(container.querySelectorAll<HTMLButtonElement>(".minimap-tick")[1]!);

    expect(scroller.scrollTop).toBe(276);
    expect(screen.getByRole("button", { name: /jump to latest/i })).toBeTruthy();
  });
});
