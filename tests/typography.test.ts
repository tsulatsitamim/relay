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

describe("conversation typography contract", () => {
  it("keeps a 16px rem basis while the UI text stays 13px", () => {
    expect(decls("html")).toContain("font-size: 16px;");
    expect(decls("body")).toContain("font-size: var(--font-size);");
  });

  it("uses the T3 sans and mono stacks at the root", () => {
    expect(decls(":root")).toContain(
      '--font: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;',
    );
    expect(decls(":root")).toContain(
      '--mono: ui-monospace, "SF Mono", "SFMono-Regular", Menlo, Consolas, "Liberation Mono", monospace;',
    );
  });

  it("drives conversation text from a single 14px / 1.625 token pair", () => {
    expect(decls(":root")).toContain("--conversation-font-size: 14px;");
    expect(decls(":root")).toContain("--conversation-line-height: 1.625;");
  });

  it("renders user and agent text at the same size and line-height", () => {
    expect(decls(".msg.user")).toContain("font-size: var(--conversation-font-size);");
    expect(decls(".msg.user")).toContain("line-height: var(--conversation-line-height);");
    expect(decls(".msg.agent")).toContain("font-size: var(--conversation-font-size);");
    expect(decls(".msg.agent")).toContain("line-height: var(--conversation-line-height);");
  });

  it("resets letter-spacing to normal on message and textarea text", () => {
    for (const selector of [
      ".msg.user",
      ".msg.agent",
      ".msg-edit-input",
      ".composer-mirror",
      ".composer-card textarea",
      ".dock textarea",
    ]) {
      expect(decls(selector)).toContain("letter-spacing: normal;");
    }
  });

  it("gives the transcript column 12px/20px padding and a zero-width native scrollbar", () => {
    const transcript = decls(".transcript");
    expect(transcript).toContain("padding: var(--space-5) 12px;");
    expect(transcript).toContain("padding-left: 20px;");
    expect(transcript).not.toContain("scrollbar-gutter");
    expect(transcript).toContain("gap: 16px;");
    expect(decls(".transcript::-webkit-scrollbar")).toContain("width: 0;");
  });

  it("draws the user bubble at 80% / 18px / 12px on a surface", () => {
    expect(decls(".msg.user")).toContain("max-width: 80%;");
    const bubble = decls(".msg-bubble");
    expect(bubble).toContain("border-radius: 18px;");
    expect(bubble).toContain("padding: 12px;");
  });

  it("sizes markdown headings and lists like T3", () => {
    expect(decls(".markdown h1")).toContain("font-size: 1.25rem;");
    expect(decls(".markdown h2")).toContain("font-size: 1.125rem;");
    expect(decls(".markdown h3")).toContain("font-size: 1rem;");
    expect(decls(".markdown h4")).toContain("font-size: 0.875rem;");
    expect(decls(".markdown h1")).toContain("font-weight: 600;");
    expect(decls(".markdown ul")).toContain("padding-left: 1.25rem;");
    expect(decls(".markdown ol")).toContain("font-variant-numeric: tabular-nums;");
    expect(decls(".markdown li + li")).toContain("margin-top: 0.25rem;");
  });

  it("sizes inline and fenced code like T3", () => {
    expect(decls(".markdown code")).toContain("font-size: 12px;");
    expect(decls(".markdown code")).toContain("border-radius: 6px;");
    expect(decls(".code-block")).toContain("border-radius: 12px;");
    expect(decls(".code-body")).toContain("font-size: 13px;");
    expect(decls(".code-body")).toContain("padding: 13px 14px;");
  });

  it("styles blockquotes and tables like T3", () => {
    expect(decls(".markdown blockquote")).toContain("padding-left: 0.8rem;");
    expect(decls(".markdown th")).toContain("padding: 7px 12px;");
    expect(decls(".markdown table")).toContain("font-size: 12px;");
  });

  it("renders footer meta and the amber working row as compact tabular text", () => {
    expect(decls(".msg-time")).toContain("font-size: var(--font-size-sm);");
    expect(decls(".msg-time")).toContain("font-variant-numeric: tabular-nums;");
    const working = decls(".working-row");
    expect(working).toContain("color: var(--working);");
    expect(working).toContain("font-size: var(--font-size);");
    expect(working).toContain("font-variant-numeric: tabular-nums;");
    expect(working).toContain("border-bottom: 1px solid var(--line);");
  });
});
