import { describe, expect, it } from "vitest";
import { prettyValue, toolIcon, toolStatusMeta } from "../src/renderer/toolFormat.ts";

describe("toolStatusMeta", () => {
  it("maps in_progress to a running tone", () => {
    expect(toolStatusMeta("in_progress")).toEqual({ tone: "running", label: "Running" });
  });

  it("maps completed to a done tone", () => {
    expect(toolStatusMeta("completed")).toEqual({ tone: "done", label: "Completed" });
  });

  it("maps failed to an error tone", () => {
    expect(toolStatusMeta("failed")).toEqual({ tone: "error", label: "Failed" });
  });

  it("falls back to pending for unknown status", () => {
    expect(toolStatusMeta(undefined)).toEqual({ tone: "pending", label: "Pending" });
  });
});

describe("toolIcon", () => {
  it("maps known acp tool kinds to an icon kind", () => {
    expect(toolIcon("read")).toBe("read");
    expect(toolIcon("edit")).toBe("edit");
    expect(toolIcon("write")).toBe("edit");
    expect(toolIcon("execute")).toBe("execute");
    expect(toolIcon("bash")).toBe("execute");
    expect(toolIcon("shell")).toBe("execute");
    expect(toolIcon("search")).toBe("search");
    expect(toolIcon("fetch")).toBe("web");
    expect(toolIcon("web")).toBe("web");
    expect(toolIcon("browser")).toBe("web");
    expect(toolIcon("think")).toBe("generic");
    expect(toolIcon("reason")).toBe("generic");
  });

  it("falls back to keyword matching on the title for unknown kinds", () => {
    expect(toolIcon(undefined, "Read the file")).toBe("read");
    expect(toolIcon("mystery", "Open config")).toBe("read");
    expect(toolIcon("mystery", "cat package.json")).toBe("read");
    expect(toolIcon("mystery", "Edit the file")).toBe("edit");
    expect(toolIcon("mystery", "Write a note")).toBe("edit");
    expect(toolIcon("mystery", "Apply patch")).toBe("edit");
    expect(toolIcon("mystery", "Run the tests")).toBe("execute");
    expect(toolIcon("mystery", "Exec command")).toBe("execute");
    expect(toolIcon("mystery", "Build project")).toBe("execute");
    expect(toolIcon("mystery", "Grep the source")).toBe("search");
    expect(toolIcon("mystery", "Find usages")).toBe("search");
    expect(toolIcon("mystery", "Search docs")).toBe("search");
    expect(toolIcon("mystery", "Fetch the url")).toBe("web");
    expect(toolIcon("mystery", "HTTP request")).toBe("web");
  });

  it("is case-insensitive and defaults to generic", () => {
    expect(toolIcon("READ")).toBe("read");
    expect(toolIcon(undefined, "READ ME")).toBe("read");
    expect(toolIcon("mystery", "Do something")).toBe("generic");
    expect(toolIcon(undefined)).toBe("generic");
    expect(toolIcon(null, "unknown")).toBe("generic");
  });

  it("matches keywords on word boundaries rather than substrings", () => {
    expect(toolIcon(undefined, "Edit README.md")).toBe("edit");
    expect(toolIcon(undefined, "Read README.md")).toBe("read");
    expect(toolIcon(undefined, "README")).toBe("generic");
    expect(toolIcon(undefined, "Run the tests")).toBe("execute");
  });
});

describe("prettyValue", () => {
  it("pretty-prints objects as indented json", () => {
    expect(prettyValue({ a: 1 })).toBe('{\n  "a": 1\n}');
  });

  it("re-parses json encoded strings", () => {
    expect(prettyValue('{"a":1}')).toBe('{\n  "a": 1\n}');
  });

  it("returns plain strings untouched", () => {
    expect(prettyValue("hello world")).toBe("hello world");
  });

  it("returns empty string for null", () => {
    expect(prettyValue(null)).toBe("");
  });
});
