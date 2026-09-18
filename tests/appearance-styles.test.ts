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

describe("appearance stylesheet contract", () => {
  it("flips color-scheme and the base surface tokens on a dark theme", () => {
    const dark = decls(':root[data-theme="dark"]');
    expect(dark).toContain("color-scheme: dark;");
    expect(dark).toContain("--base: oklch(0.96 0 0);");
    expect(dark).toContain("--sidebar: oklch(0.235 0 0);");
    expect(dark).toContain("--chrome: oklch(0.205 0 0);");
    expect(dark).toContain("--editor: oklch(0.26 0 0);");
  });

  it("overrides the chrome affordances that hardcode black-on-light", () => {
    expect(decls(':root[data-theme="dark"] .traffic-btn')).toContain(
      "border-color: rgb(255 255 255 / 18%);",
    );
    expect(decls(':root[data-theme="dark"] .traffic-btn svg')).toContain(
      "color: rgb(255 255 255 / 55%);",
    );
  });

  it("inverts the primary and send affordances in dark mode", () => {
    expect(decls(':root[data-theme="dark"] .send-orb:not(.stop)')).toContain(
      "color: oklch(0.205 0 0);",
    );
    expect(decls(':root[data-theme="dark"] .btn.primary')).toContain(
      "color: oklch(0.205 0 0);",
    );
  });
});