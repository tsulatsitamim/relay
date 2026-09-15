import { describe, expect, it } from "vitest";
import { formatTokens, formatUsage } from "../src/renderer/format.ts";

describe("formatTokens", () => {
  it("keeps small counts as plain integers", () => {
    expect(formatTokens(0)).toBe("0");
    expect(formatTokens(7)).toBe("7");
    expect(formatTokens(999)).toBe("999");
  });

  it("abbreviates thousands with one decimal", () => {
    expect(formatTokens(1000)).toBe("1.0k");
    expect(formatTokens(1234)).toBe("1.2k");
    expect(formatTokens(12500)).toBe("12.5k");
  });
});

describe("formatUsage", () => {
  it("renders used and size together", () => {
    expect(formatUsage({ used: 100, size: 200 })).toBe("100 / 200 tokens");
  });

  it("renders used only when size is missing", () => {
    expect(formatUsage({ used: 100 })).toBe("100 tokens");
  });

  it("appends cost with an explicit currency", () => {
    expect(formatUsage({ used: 100, size: 200, costAmount: 0.0123, costCurrency: "USD" })).toBe(
      "100 / 200 tokens · USD0.0123",
    );
  });

  it("defaults the currency symbol when none is provided", () => {
    expect(formatUsage({ costAmount: 0.5 })).toBe("$0.5000");
  });

  it("returns an empty string when there is nothing to show", () => {
    expect(formatUsage({})).toBe("");
  });
});
