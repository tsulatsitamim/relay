// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, renderHook } from "@testing-library/react";
import type { RefObject } from "react";
import {
  applyAnimationVisibility,
  useVisibleAnimation,
} from "../src/renderer/visible-animation.ts";

afterEach(() => {
  cleanup();
  MockIntersectionObserver.instances = [];
  vi.unstubAllGlobals();
});

type Entry = { target: Element; isIntersecting: boolean };

class MockIntersectionObserver {
  static instances: MockIntersectionObserver[] = [];
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
  takeRecords = vi.fn(() => []);
  root = null;
  rootMargin = "";
  thresholds = [];
  constructor(public callback: IntersectionObserverCallback) {
    MockIntersectionObserver.instances.push(this);
  }
  emit(entries: Entry[]) {
    this.callback(
      entries as unknown as IntersectionObserverEntry[],
      this as unknown as IntersectionObserver,
    );
  }
}

describe("visible animation gate", () => {
  it("pauses offscreen animations and resumes them when intersecting", () => {
    const el = document.createElement("div");
    applyAnimationVisibility(el, false);
    expect(el.style.getPropertyValue("--visible-animation-state")).toBe("paused");
    applyAnimationVisibility(el, true);
    expect(el.style.getPropertyValue("--visible-animation-state")).toBe("");
  });

  it("observes the element and toggles the state via IntersectionObserver", () => {
    vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);
    const el = document.createElement("div");
    const ref = { current: el } as RefObject<HTMLElement | null>;

    renderHook(() => useVisibleAnimation(ref));

    const observer = MockIntersectionObserver.instances[0]!;
    expect(observer.observe).toHaveBeenCalledWith(el);

    observer.emit([{ target: el, isIntersecting: false }]);
    expect(el.style.getPropertyValue("--visible-animation-state")).toBe("paused");

    observer.emit([{ target: el, isIntersecting: true }]);
    expect(el.style.getPropertyValue("--visible-animation-state")).toBe("");
  });

  it("disconnects the observer on unmount", () => {
    vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);
    const el = document.createElement("div");
    const ref = { current: el } as RefObject<HTMLElement | null>;

    const { unmount } = renderHook(() => useVisibleAnimation(ref));
    const observer = MockIntersectionObserver.instances[0]!;

    unmount();
    expect(observer.disconnect).toHaveBeenCalled();
  });

  it("is a no-op when IntersectionObserver is unavailable", () => {
    const el = document.createElement("div");
    const ref = { current: el } as RefObject<HTMLElement | null>;
    expect(() => renderHook(() => useVisibleAnimation(ref))).not.toThrow();
    expect(el.style.getPropertyValue("--visible-animation-state")).toBe("");
  });
});
