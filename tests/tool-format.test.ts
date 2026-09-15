import { describe, expect, it } from "vitest";
import { prettyValue, toolStatusMeta } from "../src/renderer/toolFormat.ts";

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
