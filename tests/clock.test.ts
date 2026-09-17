import { afterEach, describe, expect, it, vi } from "vitest";
import { subscribeTick } from "../src/renderer/clock.ts";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("subscribeTick", () => {
  it("runs one timer for many listeners and clears it when the last unsubscribes", () => {
    vi.useFakeTimers();
    const setSpy = vi.spyOn(globalThis, "setInterval");
    const clearSpy = vi.spyOn(globalThis, "clearInterval");
    const a = vi.fn();
    const b = vi.fn();

    const offA = subscribeTick(a);
    const offB = subscribeTick(b);

    expect(setSpy).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1000);
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);

    offA();
    expect(clearSpy).not.toHaveBeenCalled();

    offB();
    expect(clearSpy).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(3000);
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });

  it("keeps ticking for other listeners when one throws", () => {
    vi.useFakeTimers();
    const boom = vi.fn(() => {
      throw new Error("boom");
    });
    const ok = vi.fn();

    const offBoom = subscribeTick(boom);
    const offOk = subscribeTick(ok);

    expect(() => vi.advanceTimersByTime(1000)).not.toThrow();
    expect(boom).toHaveBeenCalledTimes(1);
    expect(ok).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1000);
    expect(boom).toHaveBeenCalledTimes(2);
    expect(ok).toHaveBeenCalledTimes(2);

    offBoom();
    offOk();
  });
});