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

import { nextFollowMode } from "../src/renderer/scroll.ts";

describe("nextFollowMode", () => {
  it("switches to free when the user scrolls up", () => {
    expect(nextFollowMode("following", "scrolled-up")).toBe("free");
    expect(nextFollowMode("free", "scrolled-up")).toBe("free");
  });

  it("switches back to following when the user returns near the bottom", () => {
    expect(nextFollowMode("free", "near-bottom")).toBe("following");
    expect(nextFollowMode("following", "near-bottom")).toBe("following");
  });

  it("returns to following when the user jumps to latest", () => {
    expect(nextFollowMode("free", "jump-to-latest")).toBe("following");
  });

  it("leaves the mode untouched for programmatic scrolls", () => {
    expect(nextFollowMode("following", "programmatic")).toBe("following");
    expect(nextFollowMode("free", "programmatic")).toBe("free");
  });
});
