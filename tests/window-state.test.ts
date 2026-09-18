import { describe, expect, it } from "vitest";
import {
  clampToWorkArea,
  MIN_WINDOW_HEIGHT,
  MIN_WINDOW_WIDTH,
  parseWindowState,
  serializeWindowState,
} from "../src/main/window-state.ts";

describe("window state minimums", () => {
  it("exports the documented minimum size", () => {
    expect(MIN_WINDOW_WIDTH).toBe(480);
    expect(MIN_WINDOW_HEIGHT).toBe(360);
  });
});

describe("parseWindowState", () => {
  it("returns null for missing or empty input", () => {
    expect(parseWindowState(undefined)).toBeNull();
    expect(parseWindowState(null)).toBeNull();
    expect(parseWindowState("")).toBeNull();
  });

  it("returns null for malformed JSON", () => {
    expect(parseWindowState("{ not json")).toBeNull();
    expect(parseWindowState("1200x800")).toBeNull();
    expect(parseWindowState('{"width":NaN,"height":800}')).toBeNull();
  });

  it("returns null for non-object JSON", () => {
    expect(parseWindowState("42")).toBeNull();
    expect(parseWindowState('"1200x800"')).toBeNull();
    expect(parseWindowState("null")).toBeNull();
    expect(parseWindowState("true")).toBeNull();
  });

  it("returns null for arrays", () => {
    expect(parseWindowState("[1,2,3]")).toBeNull();
    expect(parseWindowState('[{"width":1200,"height":800}]')).toBeNull();
  });

  it("returns null when width or height is missing or not finite", () => {
    expect(parseWindowState("{}")).toBeNull();
    expect(parseWindowState('{"width":1200}')).toBeNull();
    expect(parseWindowState('{"height":800}')).toBeNull();
    expect(parseWindowState('{"width":"1200","height":800}')).toBeNull();
    expect(parseWindowState('{"width":null,"height":800}')).toBeNull();
    expect(parseWindowState('{"width":1200,"height":null}')).toBeNull();
    expect(parseWindowState('{"width":1e999,"height":800}')).toBeNull();
    expect(parseWindowState('{"width":1200,"height":1e999}')).toBeNull();
  });

  it("clamps stored dimensions up to the minimums", () => {
    expect(parseWindowState('{"width":100,"height":200}')).toEqual({
      width: 480,
      height: 360,
    });
    expect(parseWindowState('{"width":100,"height":600}')).toEqual({
      width: 480,
      height: 600,
    });
    expect(parseWindowState('{"width":900,"height":100}')).toEqual({
      width: 900,
      height: 360,
    });
  });

  it("preserves finite coordinates and the maximized flag", () => {
    expect(
      parseWindowState(
        '{"x":40,"y":60,"width":900,"height":700,"maximized":true}',
      ),
    ).toEqual({ x: 40, y: 60, width: 900, height: 700, maximized: true });
  });

  it("drops coordinates that are not finite numbers", () => {
    expect(
      parseWindowState('{"x":null,"y":60,"width":900,"height":700}'),
    ).toEqual({ y: 60, width: 900, height: 700 });
    expect(
      parseWindowState('{"x":1e999,"y":60,"width":900,"height":700}'),
    ).toEqual({ y: 60, width: 900, height: 700 });
    expect(parseWindowState('{"x":"10","width":900,"height":700}')).toEqual({
      width: 900,
      height: 700,
    });
  });

  it("does not treat a non-boolean maximized flag as true", () => {
    expect(parseWindowState('{"width":900,"height":700,"maximized":1}')).toEqual(
      { width: 900, height: 700 },
    );
  });
});

describe("serializeWindowState", () => {
  it("emits compact JSON and drops absent coordinates", () => {
    expect(serializeWindowState({ width: 900, height: 700 })).toBe(
      '{"width":900,"height":700}',
    );
    expect(
      serializeWindowState({ x: 1, y: 2, width: 900, height: 700 }),
    ).toBe('{"x":1,"y":2,"width":900,"height":700}');
    expect(
      serializeWindowState({ width: 900, height: 700, maximized: true }),
    ).toBe('{"width":900,"height":700,"maximized":true}');
  });

  it("round-trips a full state through serialize and parse", () => {
    const state = { x: 10, y: 20, width: 1000, height: 640, maximized: true };
    expect(parseWindowState(serializeWindowState(state))).toEqual(state);
  });
});

const workArea = { x: 0, y: 0, width: 1920, height: 1080 };

describe("clampToWorkArea", () => {
  it("keeps a window that is already fully on screen", () => {
    expect(
      clampToWorkArea({ x: 100, y: 80, width: 900, height: 700 }, workArea),
    ).toEqual({ x: 100, y: 80, width: 900, height: 700 });
  });

  it("snaps a fully off-screen window back inside", () => {
    expect(
      clampToWorkArea({ x: 5000, y: 5000, width: 900, height: 700 }, workArea),
    ).toEqual({ x: 1020, y: 380, width: 900, height: 700 });
  });

  it("snaps a mostly off-screen window back inside", () => {
    expect(
      clampToWorkArea({ x: -800, y: 500, width: 900, height: 700 }, workArea),
    ).toEqual({ x: 0, y: 380, width: 900, height: 700 });
  });

  it("keeps absent coordinates absent", () => {
    expect(clampToWorkArea({ width: 900, height: 700 }, workArea)).toEqual({
      width: 900,
      height: 700,
    });
  });

  it("clamps oversized dimensions down to the work area", () => {
    expect(clampToWorkArea({ width: 4000, height: 3000 }, workArea)).toEqual({
      width: 1920,
      height: 1080,
    });
  });

  it("enforces minimum dimensions inside a small work area", () => {
    const small = { x: 0, y: 0, width: 320, height: 240 };
    expect(clampToWorkArea({ width: 100, height: 100 }, small)).toEqual({
      width: 480,
      height: 360,
    });
  });

  it("snaps coordinates into a work area that is offset from the origin", () => {
    const offset = { x: 1920, y: 0, width: 1280, height: 720 };
    expect(
      clampToWorkArea({ x: 0, y: 0, width: 900, height: 700 }, offset),
    ).toEqual({ x: 1920, y: 0, width: 900, height: 700 });
  });

  it("preserves the maximized flag when clamping", () => {
    expect(
      clampToWorkArea(
        { x: 5000, y: 5000, width: 900, height: 700, maximized: true },
        workArea,
      ),
    ).toEqual({ x: 1020, y: 380, width: 900, height: 700, maximized: true });
  });
});