import { describe, expect, it } from "vitest";
import { composeReview, unsentComments } from "../src/renderer/review.ts";
import type { DiffComment } from "../src/shared/types.ts";

function comment(overrides: Partial<DiffComment> = {}): DiffComment {
  return {
    id: "c1",
    sessionId: "s1",
    eventId: "e1",
    path: "a.ts",
    startLine: 1,
    endLine: 1,
    body: "note",
    createdAt: 0,
    ...overrides,
  };
}

describe("composeReview", () => {
  it("renders a single-line reference with the body", () => {
    expect(composeReview([comment()])).toBe("> a.ts:1\nnote");
  });

  it("renders a range reference", () => {
    expect(composeReview([comment({ startLine: 3, endLine: 5 })])).toBe(
      "> a.ts:3-5\nnote",
    );
  });

  it("orders by path then start line and separates with a blank line", () => {
    const text = composeReview([
      comment({ id: "b", path: "b.ts", startLine: 2, body: "bee" }),
      comment({ id: "a2", path: "a.ts", startLine: 9, body: "nine" }),
      comment({ id: "a1", path: "a.ts", startLine: 4, body: "four" }),
    ]);
    expect(text).toBe("> a.ts:4\nfour\n\n> a.ts:9\nnine\n\n> b.ts:2\nbee");
  });

  it("excludes comments that were already sent", () => {
    expect(
      composeReview([
        comment({ body: "kept" }),
        comment({ id: "sent", body: "gone", sentAt: 5 }),
      ]),
    ).toBe("> a.ts:1\nkept");
  });

  it("returns an empty string when there is nothing to send", () => {
    expect(composeReview([])).toBe("");
    expect(composeReview([comment({ sentAt: 1 })])).toBe("");
  });

  it("has no trailing newline", () => {
    expect(composeReview([comment()]).endsWith("\n")).toBe(false);
  });
});

describe("unsentComments", () => {
  it("keeps only comments without sentAt", () => {
    const kept = comment({ id: "kept" });
    expect(unsentComments([kept, comment({ id: "sent", sentAt: 2 })])).toEqual([
      kept,
    ]);
  });
});
