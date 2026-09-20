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

describe("right panel stylesheet contract", () => {
  it("reserves the toolbar band below the inline panel's top edge", () => {
    const inline = decls(".right-panel:not(.overlay)");
    expect(inline).toContain("padding-top: var(--titlebar);");
  });

  it("keeps the overlay flush against the top edge", () => {
    expect(decls(".right-panel.overlay")).not.toContain("padding-top");
  });

  it("keeps the resize handle spanning the full panel height", () => {
    const handle = decls(".right-panel-handle");
    expect(handle).toContain("top: 0;");
    expect(handle).toContain("bottom: 0;");
  });
});
