import { describe, expect, it } from "vitest";
import { diffStat, unifiedDiff } from "../src/shared/diff.ts";

describe("unifiedDiff", () => {
  it("renders a simple replacement as unified diff hunks", () => {
    const text = unifiedDiff("a\nb\nc\n", "a\nB\nc\n", "file.txt");
    expect(text).toContain("--- a/file.txt");
    expect(text).toContain("+++ b/file.txt");
    expect(text).toContain("-b");
    expect(text).toContain("+B");
  });

  it("treats null oldText as a new file", () => {
    const text = unifiedDiff(null, "hello\n", "new.txt");
    expect(text).toContain("--- /dev/null");
    expect(text).toContain("+hello");
  });
});

describe("diffStat", () => {
  it("counts added and removed lines", () => {
    expect(diffStat("a\nb\nc\n", "a\nB\nc\nd\n")).toEqual({ adds: 2, dels: 1 });
  });

  it("treats null oldText as all additions", () => {
    expect(diffStat(null, "one\ntwo\n")).toEqual({ adds: 2, dels: 0 });
  });

  it("reports zero for identical text", () => {
    expect(diffStat("same\n", "same\n")).toEqual({ adds: 0, dels: 0 });
  });
});
