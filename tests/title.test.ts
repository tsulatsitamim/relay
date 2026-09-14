import { describe, expect, it } from "vitest";
import { titleFromPrompt } from "../src/main/title.ts";

describe("titleFromPrompt", () => {
  it("uses the first line truncated to 72 characters", () => {
    expect(titleFromPrompt("Fix auth\nmore")).toBe("Fix auth");
    expect(titleFromPrompt("a".repeat(80)).length).toBe(72);
  });

  it("falls back to Untitled for blank prompts", () => {
    expect(titleFromPrompt("   ")).toBe("Untitled");
  });
});
