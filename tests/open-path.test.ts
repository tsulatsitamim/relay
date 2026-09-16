import { describe, expect, it } from "vitest";
import { resolveWithin } from "../src/main/open-path.ts";

describe("resolveWithin", () => {
  it("joins a relative path against the cwd", () => {
    expect(resolveWithin("/tmp/repo", "src/a.ts")).toBe("/tmp/repo/src/a.ts");
  });

  it("accepts an absolute path that stays inside the cwd", () => {
    expect(resolveWithin("/tmp/repo", "/tmp/repo/src/a.ts")).toBe(
      "/tmp/repo/src/a.ts",
    );
  });

  it("refuses a parent traversal", () => {
    expect(resolveWithin("/tmp/repo", "../secret.txt")).toBeNull();
    expect(resolveWithin("/tmp/repo", "src/../../secret.txt")).toBeNull();
  });

  it("refuses an absolute path outside the cwd", () => {
    expect(resolveWithin("/tmp/repo", "/etc/passwd")).toBeNull();
  });

  it("refuses an empty cwd", () => {
    expect(resolveWithin("", "src/a.ts")).toBeNull();
  });
});
