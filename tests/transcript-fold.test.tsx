// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { Transcript } from "../src/renderer/Transcript.tsx";
import type { TranscriptEvent } from "../src/shared/types.ts";

afterEach(cleanup);

const base = new Date(2026, 0, 2, 9, 0, 0).getTime();

function sevenTurns(): TranscriptEvent[] {
  const events: TranscriptEvent[] = [
    { id: "u1", kind: "user", payload: { text: "first prompt text" }, createdAt: base },
    {
      id: "t1",
      kind: "tool_call",
      payload: { title: "read", kind: "read", status: "completed" },
      createdAt: base + 1000,
    },
    {
      id: "t2",
      kind: "tool_call",
      payload: { title: "edit", kind: "edit", status: "completed" },
      createdAt: base + 2000,
    },
    { id: "a1", kind: "agent_message", payload: { text: "reply one" }, createdAt: base + 42000 },
  ];
  for (let i = 2; i <= 7; i += 1) {
    events.push({ id: `u${i}`, kind: "user", payload: { text: `q${i}` } });
    events.push({ id: `a${i}`, kind: "agent_message", payload: { text: `reply ${i}` } });
  }
  return events;
}

function userTexts(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll(".msg.user")).map(
    (el) => el.textContent ?? "",
  );
}

describe("Transcript turn folding", () => {
  it("folds every turn older than the last five", () => {
    const { container } = render(<Transcript events={sevenTurns()} />);
    expect(container.querySelectorAll(".turn-fold")).toHaveLength(2);
    expect(userTexts(container)).toEqual(["q3", "q4", "q5", "q6", "q7"]);
  });

  it("summarizes a folded turn with duration, steps and a prompt preview", () => {
    const { container } = render(<Transcript events={sevenTurns()} />);
    const header = container.querySelector<HTMLButtonElement>(".turn-fold")!;
    expect(header.getAttribute("aria-expanded")).toBe("false");
    expect(header.textContent).toContain("Worked for 42s");
    expect(header.textContent).toContain("2 steps");
    expect(header.textContent).toContain("first prompt text");
    expect(header.querySelector(".turn-fold-chevron svg")).toBeTruthy();
    expect(header.dataset.userTurn).toBe("0");
  });

  it("expands and re-collapses a folded turn on click", () => {
    const { container } = render(<Transcript events={sevenTurns()} />);
    const header = container.querySelector<HTMLButtonElement>(".turn-fold")!;
    fireEvent.click(header);
    expect(header.getAttribute("aria-expanded")).toBe("true");
    expect(userTexts(container).some((t) => t.includes("first prompt text"))).toBe(true);
    expect(container.querySelectorAll(".msg-row[data-event-id='a1']")).toHaveLength(1);

    fireEvent.click(header);
    expect(header.getAttribute("aria-expanded")).toBe("false");
    expect(userTexts(container).some((t) => t.includes("first prompt text"))).toBe(false);
  });

  it("resets the expansion state when the session changes", () => {
    const events = sevenTurns();
    const { container, rerender } = render(
      <Transcript events={events} sessionId="a" />,
    );
    fireEvent.click(container.querySelector<HTMLButtonElement>(".turn-fold")!);
    expect(
      container.querySelector<HTMLButtonElement>(".turn-fold")!.getAttribute("aria-expanded"),
    ).toBe("true");

    rerender(<Transcript events={events} sessionId="b" />);
    expect(
      container.querySelector<HTMLButtonElement>(".turn-fold")!.getAttribute("aria-expanded"),
    ).toBe("false");
  });

  it("keeps one minimap band per user turn while folded", () => {
    const { container } = render(<Transcript events={sevenTurns()} />);
    expect(container.querySelectorAll(".minimap-tick")).toHaveLength(7);
    const bands = container.querySelectorAll("[data-user-turn]");
    expect(bands).toHaveLength(7);
    expect(bands[0]!.getAttribute("data-user-turn")).toBe("0");
    expect(bands[1]!.getAttribute("data-user-turn")).toBe("1");
  });

  it("auto-opens a folded turn that contains the active find match", () => {
    const { container } = render(
      <Transcript events={sevenTurns()} activeEventId="a1" />,
    );
    const row = container.querySelector<HTMLElement>('[data-event-id="a1"]');
    expect(row).toBeTruthy();
    expect(row!.classList.contains("find-active")).toBe(true);
    expect(
      container.querySelector<HTMLButtonElement>(".turn-fold")!.getAttribute("aria-expanded"),
    ).toBe("true");
  });

  it("still renders an empty transcript unchanged", () => {
    const { container } = render(<Transcript events={[]} />);
    expect(container.querySelector(".transcript")).toBeTruthy();
    expect(container.querySelectorAll(".turn-fold")).toHaveLength(0);
    expect(container.querySelector(".minimap")).toBeNull();
  });
});