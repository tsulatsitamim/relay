import { describe, expect, it } from "vitest";
import {
  buildTurns,
  currentIndex,
  indexAtPoint,
  jumpTop,
  sideGutter,
  stripHeight,
  stripWidth,
  tickOffset,
  tickWidth,
  visibleIndices,
  type RowBand,
} from "../src/renderer/minimap.ts";
import type { TranscriptEvent } from "../src/shared/types.ts";

describe("minimap geometry", () => {
  it("derives the side gutter from the viewport width", () => {
    expect(sideGutter(1200)).toBe(216);
    expect(sideGutter(1000)).toBe(116);
    expect(sideGutter(768)).toBe(0);
    expect(sideGutter(600)).toBe(0);
  });

  it("keeps the hit strip inside the gutter and never wider than 40px", () => {
    expect(stripWidth(1200)).toBe(40);
    expect(stripWidth(1000)).toBe(40);
    expect(stripWidth(900)).toBe(40);
    expect(stripWidth(800)).toBe(4);
    expect(stripWidth(792)).toBe(0);
    expect(stripWidth(768)).toBe(0);
  });

  it("caps the strip height by count, viewport and a 0 floor", () => {
    expect(stripHeight(10, 800)).toBe(72);
    expect(stripHeight(100, 400)).toBe(112);
    expect(stripHeight(2, 300)).toBe(8);
    expect(stripHeight(1, 800)).toBe(0);
    expect(stripHeight(10, 200)).toBe(0);
  });

  it("places ticks by their fraction of the strip", () => {
    expect(tickOffset(0, 5)).toBe(0);
    expect(tickOffset(2, 5)).toBe(0.5);
    expect(tickOffset(4, 5)).toBe(1);
    expect(tickOffset(0, 1)).toBe(0);
  });

  it("widens ticks as they approach the active index", () => {
    expect(tickWidth(0)).toBe(24);
    expect(tickWidth(1)).toBe(16);
    expect(tickWidth(2)).toBe(10);
    expect(tickWidth(3)).toBe(8);
    expect(tickWidth(9)).toBe(8);
  });

  it("maps a pointer progress to the nearest tick and clamps", () => {
    expect(indexAtPoint(0, 5)).toBe(0);
    expect(indexAtPoint(0.5, 5)).toBe(2);
    expect(indexAtPoint(1, 5)).toBe(4);
    expect(indexAtPoint(-0.5, 5)).toBe(0);
    expect(indexAtPoint(1.5, 5)).toBe(4);
    expect(indexAtPoint(0.5, 1)).toBe(0);
  });

  it("resolves the active turn from row bands", () => {
    const bands: RowBand[] = [
      { index: 0, top: 0, bottom: 100 },
      { index: 1, top: 100, bottom: 200 },
      { index: 2, top: 200, bottom: 320 },
    ];
    expect(currentIndex(bands, 0, 150)).toBe(0);
    expect(currentIndex(bands, 120, 100)).toBe(1);
    expect(currentIndex(bands, 500, 100)).toBe(2);
    expect(currentIndex([], 0, 400)).toBe(0);
    expect(
      currentIndex(
        [
          { index: 0, top: 0, bottom: 50 },
          { index: 1, top: 200, bottom: 250 },
        ],
        100,
        50,
      ),
    ).toBe(0);
  });

  it("lists every band crossing the viewport", () => {
    const bands: RowBand[] = [
      { index: 0, top: 0, bottom: 100 },
      { index: 1, top: 100, bottom: 200 },
      { index: 2, top: 200, bottom: 320 },
    ];
    expect(visibleIndices(bands, 0, 100)).toEqual([0]);
    expect(visibleIndices(bands, 120, 50)).toEqual([1]);
    expect(visibleIndices(bands, 0, 300)).toEqual([0, 1, 2]);
  });

  it("lands a jump 24px below the viewport top", () => {
    expect(jumpTop(500)).toBe(476);
    expect(jumpTop(10)).toBe(0);
  });
});

describe("buildTurns", () => {
  it("collects each user prompt with the last agent reply in its turn", () => {
    const events: TranscriptEvent[] = [
      { id: "u1", kind: "user", payload: { text: "first" } },
      { id: "a1", kind: "agent_message", payload: { text: "one" } },
      { id: "a2", kind: "agent_message", payload: { text: "two" } },
      { id: "u2", kind: "user", payload: { text: "second" } },
      { id: "a3", kind: "agent_message", payload: { text: "three" } },
    ];
    expect(buildTurns(events)).toEqual([
      { id: "u1", prompt: "first", reply: "two" },
      { id: "u2", prompt: "second", reply: "three" },
    ]);
  });

  it("leaves the reply empty until an agent answers and ignores leading agents", () => {
    const events: TranscriptEvent[] = [
      { id: "a0", kind: "agent_message", payload: { text: "orphan" } },
      { id: "u1", kind: "user", payload: { text: "hi" } },
    ];
    expect(buildTurns(events)).toEqual([{ id: "u1", prompt: "hi", reply: "" }]);
    expect(buildTurns([])).toEqual([]);
  });
});
