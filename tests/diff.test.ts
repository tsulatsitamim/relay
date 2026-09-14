import { describe, expect, it } from "vitest";
import { unifiedDiff } from "../src/main/diff.ts";

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
