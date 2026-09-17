import { describe, expect, it } from "vitest";
import { nextQueued, promoteQueued, pruneQueued, queuedNowMode } from "../src/renderer/queue.ts";

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

describe("promoteQueued", () => {
  it("moves the chosen item to the front", () => {
    expect(promoteQueued(["a", "b", "c"], 2)).toEqual(["c", "a", "b"]);
  });

  it("returns the same reference when the item is already first", () => {
    const queue = ["a", "b"];
    expect(promoteQueued(queue, 0)).toBe(queue);
  });

  it("returns the same reference for an out-of-range index", () => {
    const queue = ["a", "b"];
    expect(promoteQueued(queue, 5)).toBe(queue);
  });
});

describe("queuedNowMode", () => {
  it("steers while a turn is running", () => {
    expect(queuedNowMode("starting")).toBe("steer");
    expect(queuedNowMode("working")).toBe("steer");
    expect(queuedNowMode("cancelling")).toBe("steer");
  });

  it("sends directly when the session is not running", () => {
    expect(queuedNowMode("idle")).toBe("send");
    expect(queuedNowMode("error")).toBe("send");
    expect(queuedNowMode("exited")).toBe("send");
  });
});
