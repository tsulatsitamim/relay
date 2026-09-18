import { describe, expect, it } from "vitest";
import {
  scrollTopFromThumb,
  thumbGeometry,
} from "../src/renderer/overlay-scrollbar.ts";

describe("thumbGeometry", () => {
  it("hides the thumb when the content is not scrollable", () => {
    expect(
      thumbGeometry({
        scrollTop: 0,
        scrollHeight: 400,
        clientHeight: 400,
        trackHeight: 300,
      }),
    ).toEqual({ top: 0, height: 300, visible: false });
  });

  it("hides the thumb when the track has no height", () => {
    expect(
      thumbGeometry({
        scrollTop: 0,
        scrollHeight: 1000,
        clientHeight: 200,
        trackHeight: 0,
      }),
    ).toEqual({ top: 0, height: 0, visible: false });
  });

  it("scales the thumb to the visible ratio", () => {
    const geo = thumbGeometry({
      scrollTop: 0,
      scrollHeight: 1000,
      clientHeight: 200,
      trackHeight: 300,
    });
    expect(geo.visible).toBe(true);
    expect(geo.height).toBe(60);
    expect(geo.top).toBe(0);
  });

  it("honours the minimum thumb height", () => {
    const geo = thumbGeometry({
      scrollTop: 0,
      scrollHeight: 100000,
      clientHeight: 200,
      trackHeight: 300,
    });
    expect(geo.height).toBe(24);
  });

  it("accepts a custom minimum thumb height", () => {
    const geo = thumbGeometry({
      scrollTop: 0,
      scrollHeight: 100000,
      clientHeight: 200,
      trackHeight: 300,
      minThumb: 40,
    });
    expect(geo.height).toBe(40);
  });

  it("moves the thumb proportionally and clamps at the end", () => {
    const mid = thumbGeometry({
      scrollTop: 400,
      scrollHeight: 1000,
      clientHeight: 200,
      trackHeight: 300,
    });
    expect(mid.top).toBeCloseTo(120, 5);
    const end = thumbGeometry({
      scrollTop: 800,
      scrollHeight: 1000,
      clientHeight: 200,
      trackHeight: 300,
    });
    expect(end.top).toBeCloseTo(240, 5);
    const over = thumbGeometry({
      scrollTop: 5000,
      scrollHeight: 1000,
      clientHeight: 200,
      trackHeight: 300,
    });
    expect(over.top).toBeCloseTo(240, 5);
  });
});

describe("scrollTopFromThumb", () => {
  it("returns 0 when the content is not scrollable", () => {
    expect(
      scrollTopFromThumb({
        thumbTop: 100,
        trackHeight: 300,
        thumbHeight: 60,
        scrollHeight: 400,
        clientHeight: 400,
      }),
    ).toBe(0);
  });

  it("maps the thumb position back to scrollTop", () => {
    expect(
      scrollTopFromThumb({
        thumbTop: 120,
        trackHeight: 300,
        thumbHeight: 60,
        scrollHeight: 1000,
        clientHeight: 200,
      }),
    ).toBe(400);
  });

  it("round-trips with thumbGeometry", () => {
    for (const scrollTop of [0, 250, 400, 800]) {
      const geo = thumbGeometry({
        scrollTop,
        scrollHeight: 1000,
        clientHeight: 200,
        trackHeight: 300,
      });
      expect(
        scrollTopFromThumb({
          thumbTop: geo.top,
          trackHeight: 300,
          thumbHeight: geo.height,
          scrollHeight: 1000,
          clientHeight: 200,
        }),
      ).toBeCloseTo(scrollTop, 5);
    }
  });

  it("clamps out-of-range positions", () => {
    expect(
      scrollTopFromThumb({
        thumbTop: -50,
        trackHeight: 300,
        thumbHeight: 60,
        scrollHeight: 1000,
        clientHeight: 200,
      }),
    ).toBe(0);
    expect(
      scrollTopFromThumb({
        thumbTop: 9999,
        trackHeight: 300,
        thumbHeight: 60,
        scrollHeight: 1000,
        clientHeight: 200,
      }),
    ).toBe(800);
  });
});