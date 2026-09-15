import { describe, expect, it } from "vitest";
import { nextQueued, pruneQueued } from "../src/renderer/queue.ts";

describe("pruneQueued", () => {
  it("drops entries for sessions that no longer exist", () => {
    expect(pruneQueued({ a: ["one"], b: ["two"] }, ["a"])).toEqual({ a: ["one"] });
  });

  it("drops empty queues", () => {
    expect(pruneQueued({ a: [], b: ["two"] }, ["a", "b"])).toEqual({ b: ["two"] });
  });

  it("returns the same reference when there is nothing to prune", () => {
    const queued = { a: ["one"] };
    expect(pruneQueued(queued, ["a", "b"])).toBe(queued);
  });
});

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
