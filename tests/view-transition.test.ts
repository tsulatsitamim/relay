// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  prefersReducedMotion,
  runTransition,
  supportsViewTransition,
} from "../src/renderer/view-transition";

type CapableDocument = Document & {
  startViewTransition?: (callback: () => void) => unknown;
};

const originalMatchMedia = window.matchMedia;

function removeViewTransition() {
  delete (document as CapableDocument).startViewTransition;
}

function stubViewTransition(impl: (callback: () => void) => unknown) {
  const start = vi.fn(impl);
  Object.defineProperty(document, "startViewTransition", {
    value: start,
    configurable: true,
    writable: true,
  });
  return start;
}

function stubReducedMotion(matches: boolean) {
  Object.defineProperty(window, "matchMedia", {
    value: vi.fn(() => ({
      matches,
      media: "",
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
    configurable: true,
    writable: true,
  });
}

function restoreMatchMedia() {
  if (originalMatchMedia === undefined) {
    delete (window as { matchMedia?: unknown }).matchMedia;
  } else {
    Object.defineProperty(window, "matchMedia", {
      value: originalMatchMedia,
      configurable: true,
      writable: true,
    });
  }
}

afterEach(() => {
  removeViewTransition();
  restoreMatchMedia();
});

describe("supportsViewTransition", () => {
  it("is false without document.startViewTransition", () => {
    removeViewTransition();
    expect(supportsViewTransition()).toBe(false);
  });

  it("is true when startViewTransition is a function", () => {
    stubViewTransition((callback) => callback());
    expect(supportsViewTransition()).toBe(true);
  });
});

describe("prefersReducedMotion", () => {
  it("returns false when matchMedia is unavailable", () => {
    (window as { matchMedia?: unknown }).matchMedia = undefined;
    expect(prefersReducedMotion()).toBe(false);
  });
});

describe("runTransition", () => {
  it("runs update synchronously when startViewTransition is missing", () => {
    removeViewTransition();
    const update = vi.fn();
    expect(() => runTransition(update)).not.toThrow();
    expect(update).toHaveBeenCalledTimes(1);
  });

  it("skips startViewTransition under reduced motion but still runs update", () => {
    const start = stubViewTransition((callback) => callback());
    stubReducedMotion(true);
    const update = vi.fn();
    runTransition(update);
    expect(start).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledTimes(1);
  });

  it("falls back to a direct update when startViewTransition throws", () => {
    stubViewTransition(() => {
      throw new Error("unsupported");
    });
    const update = vi.fn();
    expect(() => runTransition(update)).not.toThrow();
    expect(update).toHaveBeenCalledTimes(1);
  });

  it("delegates the update to startViewTransition when enabled", () => {
    const start = stubViewTransition((callback) => callback());
    const update = vi.fn();
    runTransition(update);
    expect(start).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledTimes(1);
  });
});