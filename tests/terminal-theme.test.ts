import { describe, expect, it } from "vitest";
import { terminalFontSize, terminalTheme } from "../src/renderer/right-panel/terminal-theme.ts";

const styles: Record<string, string> = {
  "--editor": "oklch(0.26 0 0)",
  "--base": "oklch(0.96 0 0)",
  "--danger": "oklch(0.72 0.196 14.313)",
  "--ok": "oklch(0.72 0.116 156.327)",
  "--mono": "Menlo, monospace",
  "--font-size": "13px",
};

const read = (name: string) => styles[name] ?? "";

describe("terminalTheme", () => {
  it("takes the surface, text, danger and ok colours from the app tokens", () => {
    const theme = terminalTheme(read);
    expect(theme.background).toBe(styles["--editor"]);
    expect(theme.foreground).toBe(styles["--base"]);
    expect(theme.cursor).toBe(styles["--base"]);
    expect(theme.red).toBe(styles["--danger"]);
    expect(theme.green).toBe(styles["--ok"]);
  });

  it("always returns a full ansi palette", () => {
    const theme = terminalTheme(read);
    for (const key of ["black", "blue", "cyan", "magenta", "white", "brightWhite"]) {
      expect(typeof theme[key as keyof typeof theme]).toBe("string");
    }
  });

  it("falls back when a token is missing", () => {
    const theme = terminalTheme(() => "");
    expect(theme.background).toBeTruthy();
    expect(theme.foreground).toBeTruthy();
    expect(theme.selectionBackground).toBeTruthy();
  });
});

describe("terminalFontSize", () => {
  it("reads the app font size", () => {
    expect(terminalFontSize(read)).toBe(13);
  });

  it("falls back for junk", () => {
    expect(terminalFontSize(() => "")).toBe(13);
    expect(terminalFontSize(() => "0")).toBe(13);
    expect(terminalFontSize(() => "400")).toBe(13);
  });
});
