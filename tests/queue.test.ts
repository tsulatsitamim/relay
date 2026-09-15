import { describe, expect, it } from "vitest";
import { nextQueued } from "../src/renderer/queue.ts";

describe("nextQueued", () => {
  it("returns nothing when the queue is empty", () => {
    expect(nextQueued([], "idle")).toBeNull();
  });

  it("returns the head when the session is idle", () => {
    expect(nextQueued(["second", "third"], "idle")).toBe("second");
  });

  it("holds the queue while the session is working", () => {
    expect(nextQueued(["second"], "working")).toBeNull();
  });

  it("holds the queue when the session errored or exited", () => {
    expect(nextQueued(["second"], "error")).toBeNull();
    expect(nextQueued(["second"], "exited")).toBeNull();
  });
});
