import { describe, expect, it } from "vitest";
import { eventText, matchesSession } from "../src/renderer/search.ts";
import type { TranscriptEvent } from "../src/shared/types.ts";

function event(kind: TranscriptEvent["kind"], payload: unknown): TranscriptEvent {
  return { id: "e", kind, payload };
}

describe("eventText", () => {
  it("collects text from markdown chunks", () => {
    expect(eventText(event("agent_message", { text: "Hello World" }))).toContain("hello world");
  });

  it("collects tool call title and raw input", () => {
    const text = eventText(
      event("tool_call", {
        title: "Read src/index.ts",
        rawInput: { path: "README.md" },
      }),
    );
    expect(text).toContain("read src/index.ts");
    expect(text).toContain("readme.md");
  });

  it("collects plan entry content", () => {
    const text = eventText(
      event("plan", { entries: [{ content: "Refactor auth" }] }),
    );
    expect(text).toContain("refactor auth");
  });

  it("collects diff paths", () => {
    expect(eventText(event("diff", { path: "src/App.tsx" }))).toContain("src/app.tsx");
  });
});

describe("matchesSession", () => {
  it("matches the title case-insensitively", () => {
    expect(matchesSession("auth", "Fix Auth flow", [])).toBe(true);
  });

  it("matches transcript content when the title does not", () => {
    const events = [event("agent_message", { text: "token refresh logic" })];
    expect(matchesSession("refresh", "Some chat", events)).toBe(true);
  });

  it("ignores surrounding whitespace in the query", () => {
    expect(matchesSession("  auth  ", "Fix Auth flow", [])).toBe(true);
  });

  it("returns false when nothing matches", () => {
    const events = [event("agent_message", { text: "hello" })];
    expect(matchesSession("zzz", "Some chat", events)).toBe(false);
  });

  it("treats an empty query as matching everything", () => {
    expect(matchesSession("", "Some chat", [])).toBe(true);
  });
});
