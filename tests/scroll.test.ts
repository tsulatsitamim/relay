import { describe, expect, it } from "vitest";
import { isNearBottom } from "../src/renderer/scroll.ts";

describe("isNearBottom", () => {
  it("is true when scrolled to the very bottom", () => {
    expect(isNearBottom({ scrollTop: 800, scrollHeight: 1000, clientHeight: 200 })).toBe(true);
  });

  it("is true within the threshold", () => {
    expect(isNearBottom({ scrollTop: 760, scrollHeight: 1000, clientHeight: 200 })).toBe(true);
  });

  it("is false when scrolled up past the threshold", () => {
    expect(isNearBottom({ scrollTop: 400, scrollHeight: 1000, clientHeight: 200 })).toBe(false);
  });
});
