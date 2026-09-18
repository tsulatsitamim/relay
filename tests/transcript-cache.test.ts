import { describe, expect, it, vi } from "vitest";
import { memoByEvents, newMemoCache } from "../src/renderer/memo-cache.ts";
import type { TranscriptEvent } from "../src/shared/types.ts";

function event(id: string, text: string): TranscriptEvent {
  return { id, kind: "agent_message", payload: { text } };
}

describe("memoByEvents", () => {
  it("reuses the cached value when only the array identity changes", () => {
    const cache = newMemoCache<number>();
    const compute = vi.fn(() => 7);
    const first = [event("a1", "one")];
    const second = [...first];

    expect(memoByEvents(cache, first, compute)).toBe(7);
    expect(memoByEvents(cache, second, compute)).toBe(7);
    expect(compute).toHaveBeenCalledTimes(1);
  });

  it("recomputes when the last event object is replaced in place", () => {
    const cache = newMemoCache<number>();
    const compute = vi.fn(() => 1);
    const first = [event("a1", "one")];
    memoByEvents(cache, first, compute);

    const streamed = [{ ...first[0]!, payload: { text: "one two" } }];
    memoByEvents(cache, streamed, compute);

    expect(compute).toHaveBeenCalledTimes(2);
  });

  it("recomputes when a new event object is appended", () => {
    const cache = newMemoCache<number>();
    const compute = vi.fn(() => 1);
    const first = [event("a1", "one")];
    memoByEvents(cache, first, compute);

    memoByEvents(cache, [...first, event("a2", "two")], compute);

    expect(compute).toHaveBeenCalledTimes(2);
  });

  it("recomputes when the array shrinks to a different length", () => {
    const cache = newMemoCache<number>();
    const compute = vi.fn(() => 1);
    const first = [event("a1", "one"), event("a2", "two")];
    memoByEvents(cache, first, compute);

    memoByEvents(cache, first.slice(0, 1), compute);

    expect(compute).toHaveBeenCalledTimes(2);
  });

  it("keeps an empty transcript cached", () => {
    const cache = newMemoCache<number>();
    const compute = vi.fn(() => 0);

    memoByEvents(cache, [], compute);
    memoByEvents(cache, [], compute);

    expect(compute).toHaveBeenCalledTimes(1);
  });

  it("returns the value produced by the compute function", () => {
    const cache = newMemoCache<string>();
    expect(memoByEvents(cache, [event("a1", "one")], () => "rows")).toBe("rows");
  });
});
