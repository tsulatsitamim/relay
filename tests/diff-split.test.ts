import { describe, expect, it } from "vitest";
import { splitCommentLines, splitDiff } from "../src/renderer/diff-split.ts";

describe("splitDiff", () => {
  it("puts context lines on both sides with their own line numbers", () => {
    expect(splitDiff("a\nb\nc\n", "a\nB\nc\n")).toEqual([
      {
        left: { text: "a", type: "context", line: 1 },
        right: { text: "a", type: "context", line: 1 },
      },
      {
        left: { text: "b", type: "del", line: 2 },
        right: { text: "B", type: "add", line: 2 },
      },
      {
        left: { text: "c", type: "context", line: 3 },
        right: { text: "c", type: "context", line: 3 },
      },
    ]);
  });

  it("pairs consecutive deletes and adds side by side", () => {
    const rows = splitDiff("a\nb\nc\n", "a\nx\ny\n");
    expect(rows).toEqual([
      {
        left: { text: "a", type: "context", line: 1 },
        right: { text: "a", type: "context", line: 1 },
      },
      {
        left: { text: "b", type: "del", line: 2 },
        right: { text: "x", type: "add", line: 2 },
      },
      {
        left: { text: "c", type: "del", line: 3 },
        right: { text: "y", type: "add", line: 3 },
      },
    ]);
  });

  it("leaves the left cell empty when there are more adds than deletes", () => {
    const rows = splitDiff("a\nb\n", "a\nx\ny\n");
    expect(rows).toEqual([
      {
        left: { text: "a", type: "context", line: 1 },
        right: { text: "a", type: "context", line: 1 },
      },
      {
        left: { text: "b", type: "del", line: 2 },
        right: { text: "x", type: "add", line: 2 },
      },
      { left: null, right: { text: "y", type: "add", line: 3 } },
    ]);
  });

  it("leaves the right cell empty for a pure deletion", () => {
    const rows = splitDiff("a\nb\nc\n", "a\nb\n");
    expect(rows).toEqual([
      {
        left: { text: "a", type: "context", line: 1 },
        right: { text: "a", type: "context", line: 1 },
      },
      {
        left: { text: "b", type: "context", line: 2 },
        right: { text: "b", type: "context", line: 2 },
      },
      { left: { text: "c", type: "del", line: 3 }, right: null },
    ]);
  });

  it("treats a null old text as a brand new file", () => {
    expect(splitDiff(null, "one\ntwo\n")).toEqual([
      { left: null, right: { text: "one", type: "add", line: 1 } },
      { left: null, right: { text: "two", type: "add", line: 2 } },
    ]);
  });

  it("returns no rows for two empty texts", () => {
    expect(splitDiff("", "")).toEqual([]);
  });
});

describe("splitCommentLines", () => {
  it("uses the new-file line of each row's right cell", () => {
    const rows = splitDiff("a\nb\nc\n", "a\nB\nc\n");
    expect(splitCommentLines(rows)).toEqual([1, 2, 3]);
  });

  it("points a pure deletion at the nearest following new-file line", () => {
    const rows = splitDiff("a\nb\nc\nd\n", "a\nd\n");
    expect(splitCommentLines(rows)).toEqual([1, 2, 2, 2]);
  });

  it("falls back to the nearest preceding new-file line", () => {
    const rows = splitDiff("a\nb\nc\n", "a\nb\n");
    expect(splitCommentLines(rows)).toEqual([1, 2, 2]);
  });

  it("returns null when the new file has no lines", () => {
    expect(splitCommentLines(splitDiff("a\nb\n", ""))).toEqual([null, null]);
  });

  it("returns null for the left of a new file", () => {
    expect(splitCommentLines(splitDiff(null, "one\n"))).toEqual([1]);
  });
});