import { describe, expect, it } from "vitest";
import {
  branchFromPorcelain,
  changeLabel,
  mergeStats,
  parseNumstat,
  parsePorcelainV2,
  truncateDiffText,
} from "../src/shared/git.ts";

function record(...parts: string[]): string {
  return parts.join("\0");
}

describe("parsePorcelainV2", () => {
  it("reads modified, added, deleted, untracked, and conflicted entries", () => {
    const output = record(
      "# branch.head main",
      "1 .M N... 100644 100644 100644 abc def src/a.ts",
      "1 A. N... 000000 100644 100644 000 abc src/b.ts",
      "1 .D N... 100644 000000 000000 abc 000 src/c.ts",
      "? src/d.ts",
      "u UU N... 100644 100644 100644 100644 abc def ghi src/e.ts",
    );
    expect(parsePorcelainV2(output)).toEqual([
      { path: "src/a.ts", status: "modified" },
      { path: "src/b.ts", status: "added" },
      { path: "src/c.ts", status: "deleted" },
      { path: "src/d.ts", status: "untracked" },
      { path: "src/e.ts", status: "conflicted" },
    ]);
  });

  it("keeps both names for a rename and survives paths with spaces", () => {
    const output = record(
      "# branch.head main",
      "2 R. N... 100644 100644 100644 abc def R100 src/new name.ts",
      "src/old name.ts",
    );
    expect(parsePorcelainV2(output)).toEqual([
      {
        path: "src/new name.ts",
        status: "renamed",
        oldPath: "src/old name.ts",
      },
    ]);
  });

  it("returns an empty list for empty output", () => {
    expect(parsePorcelainV2("")).toEqual([]);
  });
});

describe("branchFromPorcelain", () => {
  it("reads the branch head", () => {
    expect(branchFromPorcelain("# branch.oid abc\0# branch.head feature/x\0")).toBe("feature/x");
  });

  it("returns an empty string when the header is missing", () => {
    expect(branchFromPorcelain("1 .M N... 100644 100644 100644 abc def a.ts\0")).toBe("");
  });
});

describe("parseNumstat", () => {
  it("maps insertions and deletions per path", () => {
    const stats = parseNumstat(record("12\t3\tsrc/a.ts", "0\t7\tsrc/c.ts"));
    expect(stats.get("src/a.ts")).toEqual({ insertions: 12, deletions: 3 });
    expect(stats.get("src/c.ts")).toEqual({ insertions: 0, deletions: 7 });
  });

  it("treats binary counts as zero", () => {
    const stats = parseNumstat(record("-\t-\tlogo.png"));
    expect(stats.get("logo.png")).toEqual({ insertions: 0, deletions: 0 });
  });

  it("reads the new path for a rename", () => {
    const stats = parseNumstat(record("1\t2\t", "src/old.ts", "src/new.ts"));
    expect(stats.get("src/new.ts")).toEqual({ insertions: 1, deletions: 2 });
  });
});

describe("mergeStats", () => {
  it("attaches stats to the matching files", () => {
    const files = mergeStats(
      [
        { path: "src/a.ts", status: "modified" as const },
        { path: "src/z.ts", status: "untracked" as const },
      ],
      new Map([["src/a.ts", { insertions: 4, deletions: 1 }]]),
    );
    expect(files[0]).toEqual({ path: "src/a.ts", status: "modified", insertions: 4, deletions: 1 });
    expect(files[1]).toEqual({ path: "src/z.ts", status: "untracked" });
  });
});

describe("truncateDiffText", () => {
  it("leaves short text alone and caps long text", () => {
    expect(truncateDiffText("a\nb")).toEqual({ text: "a\nb", truncated: false });
    const long = Array.from({ length: 5 }, (_, index) => `line ${index}`).join("\n");
    const capped = truncateDiffText(long, 3);
    expect(capped.truncated).toBe(true);
    expect(capped.text.split("\n")).toHaveLength(3);
  });
});

describe("changeLabel", () => {
  it("labels every status", () => {
    expect(changeLabel("modified")).toBe("Modified");
    expect(changeLabel("added")).toBe("Added");
    expect(changeLabel("deleted")).toBe("Deleted");
    expect(changeLabel("renamed")).toBe("Renamed");
    expect(changeLabel("untracked")).toBe("Untracked");
    expect(changeLabel("conflicted")).toBe("Conflicted");
  });
});
