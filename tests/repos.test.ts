import { describe, expect, it } from "vitest";
import { repoNameFromPath } from "../src/main/repo-name.ts";
import { timeAgo } from "../src/shared/time.ts";

describe("repoNameFromPath", () => {
  it("uses the last path segment", () => {
    expect(repoNameFromPath("/Volumes/Storage/Projects/relay")).toBe("relay");
  });
});

describe("timeAgo", () => {
  it("formats minutes hours and days", () => {
    const now = 1_000_000_000_000;
    expect(timeAgo(now - 60_000, now)).toBe("1m");
    expect(timeAgo(now - 7 * 3600_000, now)).toBe("7h");
    expect(timeAgo(now - 14 * 86400_000, now)).toBe("14d");
  });
});
