// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AnimatedHeight } from "../src/renderer/AnimatedHeight.tsx";
import { ToolCallCard } from "../src/renderer/ToolCallCard.tsx";
import { ThinkingBlock } from "../src/renderer/ThinkingBlock.tsx";
import { PlanBlock } from "../src/renderer/PlanBlock.tsx";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

class MockResizeObserver {
  static instances: MockResizeObserver[] = [];
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
  constructor(public callback: ResizeObserverCallback) {
    MockResizeObserver.instances.push(this);
  }
}

function withScrollHeight(el: Element, value: number) {
  Object.defineProperty(el, "scrollHeight", { value, configurable: true });
}

describe("AnimatedHeight", () => {
  it("renders a 0px height while closed", () => {
    const { container } = render(
      <AnimatedHeight open={false}>
        <div>body</div>
      </AnimatedHeight>,
    );
    const box = container.querySelector(".collapse") as HTMLElement;
    expect(box.style.height).toBe("0px");
  });

  it("marks the collapse box open and closed for synchronous observability", () => {
    const { container, rerender } = render(
      <AnimatedHeight open={false}>
        <div>body</div>
      </AnimatedHeight>,
    );
    const box = container.querySelector(".collapse") as HTMLElement;
    expect(box.getAttribute("data-open")).toBe("false");

    rerender(
      <AnimatedHeight open>
        <div>body</div>
      </AnimatedHeight>,
    );
    expect(box.getAttribute("data-open")).toBe("true");
  });

  it("measures a px height while open and observes with ResizeObserver", () => {
    vi.stubGlobal("ResizeObserver", MockResizeObserver);
    const { container, rerender } = render(
      <AnimatedHeight open={false}>
        <div>body</div>
      </AnimatedHeight>,
    );
    const box = container.querySelector(".collapse") as HTMLElement;
    withScrollHeight(box, 120);

    rerender(
      <AnimatedHeight open>
        <div>body</div>
      </AnimatedHeight>,
    );

    expect(box.style.height).toBe("120px");
    expect(MockResizeObserver.instances[0]?.observe).toHaveBeenCalledWith(box);
  });

  it("settles to auto after the expand transition", () => {
    vi.useFakeTimers();
    const { container, rerender } = render(
      <AnimatedHeight open={false}>
        <div>body</div>
      </AnimatedHeight>,
    );
    const box = container.querySelector(".collapse") as HTMLElement;
    withScrollHeight(box, 90);

    rerender(
      <AnimatedHeight open>
        <div>body</div>
      </AnimatedHeight>,
    );
    expect(box.style.height).toBe("90px");

    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(box.style.height).toBe("auto");
  });

  it("collapses from auto through a px height back to zero", () => {
    vi.useFakeTimers();
    const { container, rerender } = render(
      <AnimatedHeight open>
        <div>body</div>
      </AnimatedHeight>,
    );
    const box = container.querySelector(".collapse") as HTMLElement;
    withScrollHeight(box, 100);

    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(box.style.height).toBe("auto");

    rerender(
      <AnimatedHeight open={false}>
        <div>body</div>
      </AnimatedHeight>,
    );
    expect(box.style.height).toBe("100px");

    act(() => {
      vi.advanceTimersByTime(20);
    });
    expect(box.style.height).toBe("0px");
  });

  it("degrades gracefully when ResizeObserver is unavailable", () => {
    vi.stubGlobal("ResizeObserver", undefined);
    const { container, rerender } = render(
      <AnimatedHeight open={false}>
        <div>body</div>
      </AnimatedHeight>,
    );
    const box = container.querySelector(".collapse") as HTMLElement;
    withScrollHeight(box, 70);

    expect(() =>
      rerender(
        <AnimatedHeight open>
          <div>body</div>
        </AnimatedHeight>,
      ),
    ).not.toThrow();

    expect(box.style.height).toBe("70px");
    expect(screen.getByText("body")).toBeTruthy();
  });
});

describe("AnimatedHeight adoption", () => {
  it("wraps the tool body in a collapse box", () => {
    const { container } = render(
      <ToolCallCard
        toolCall={{ title: "Reading", status: "in_progress", rawInput: { a: 1 } }}
      />,
    );
    expect(container.querySelector(".collapse .tool-body")).toBeTruthy();
    expect(screen.getByText("Input")).toBeTruthy();
  });

  it("wraps the thinking body in a collapse box", async () => {
    const { container } = render(<ThinkingBlock text="hmm" />);
    await userEvent.click(screen.getByRole("button", { name: /Thinking/i }));
    expect(container.querySelector(".collapse .badge-body")).toBeTruthy();
    expect(screen.getByText("hmm")).toBeTruthy();
  });

  it("wraps the collapsed plan list without changing the toggle", () => {
    const entries = Array.from({ length: 9 }, (_, i) => ({
      content: `Step ${i}`,
      status: "pending" as const,
    }));
    const { container } = render(<PlanBlock entries={entries} />);
    expect(container.querySelector(".collapse .plan-list")).toBeTruthy();
    expect(container.querySelector(".plan-list")?.classList.contains("collapsed")).toBe(
      true,
    );
    expect(
      screen.getByRole("button", { name: "Show all" }).getAttribute("aria-expanded"),
    ).toBe("false");
  });
});