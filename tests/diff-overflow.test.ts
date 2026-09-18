import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const css = readFileSync(resolve("src/renderer/styles.css"), "utf8");

function rules(source: string): { selectors: string[]; body: string }[] {
  const out: { selectors: string[]; body: string }[] = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(source)) !== null) {
    out.push({
      selectors: match[1]!
        .split(",")
        .map((selector) => selector.trim())
        .filter(Boolean),
      body: match[2]!,
    });
  }
  return out;
}

const parsed = rules(css);

function decls(selector: string): string {
  return parsed
    .filter((rule) => rule.selectors.includes(selector))
    .map((rule) => rule.body)
    .join("\n");
}

describe("long diff line containment", () => {
  it("scrolls the diff content inside a horizontal scroll container", () => {
    expect(decls(".diff-body")).toContain("overflow: auto;");
    expect(decls(".diff-split")).toContain("overflow-x: auto;");
  });

  it("keeps each split cell self-scrolling", () => {
    expect(decls(".diff-cell")).toContain("min-width: 0;");
    expect(decls(".diff-cell")).toContain("overflow-x: auto;");
  });

  it("keeps diff lines faithful without wrapping", () => {
    expect(decls(".diff-line")).toContain("white-space: pre;");
  });

  it("lets the diff shrink instead of widening the transcript column", () => {
    for (const selector of [
      ".thread",
      ".transcript-wrap",
      ".msg-row",
      ".diff",
      ".diff-split",
      ".diffgroup",
      ".diffgroup-body",
    ]) {
      expect(decls(selector)).toContain("min-width: 0;");
    }
  });
});