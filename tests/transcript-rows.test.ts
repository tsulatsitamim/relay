import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TranscriptEvent } from "../src/shared/types.ts";

const spies = vi.hoisted(() => ({
  formatDay: vi.fn<(ts: number) => string>(),
  formatTime: vi.fn<(ts: number) => string>(),
}));

vi.mock("../src/renderer/time.ts", () => ({
  formatDay: spies.formatDay,
  formatTime: spies.formatTime,
}));

import { buildRows } from "../src/renderer/transcript-rows.ts";

const day1 = new Date(2026, 0, 2, 9, 5).getTime();
const day2 = new Date(2026, 0, 3, 9, 5).getTime();

function event(id: string, createdAt?: number): TranscriptEvent {
  return { id, kind: "user", payload: { text: id }, createdAt };
}

beforeEach(() => {
  spies.formatDay.mockReset();
  spies.formatTime.mockReset();
  spies.formatDay.mockImplementation((ts: number) => new Date(ts).toDateString());
  spies.formatTime.mockImplementation((ts: number) =>
    new Date(ts).toLocaleTimeString(),
  );
});

describe("buildRows", () => {
  it("emits a single separator for same-day events split by an untimestamped event", () => {
    const rows = buildRows([
      event("1", day1),
      event("2"),
      event("3", day1),
    ]);
    expect(rows.map((row) => row.showSeparator)).toEqual([true, false, false]);
    expect(rows.map((row) => row.time)).toEqual([
      new Date(day1).toLocaleTimeString(),
      null,
      new Date(day1).toLocaleTimeString(),
    ]);
  });

  it("emits a separator when an event lands on a new day", () => {
    const rows = buildRows([event("1", day1), event("2", day2)]);
    expect(rows.map((row) => row.showSeparator)).toEqual([true, true]);
  });

  it("formats each timestamped event at most once", () => {
    const events = [event("1", day1), event("2"), event("3", day1), event("4", day2)];
    buildRows(events);
    expect(spies.formatDay.mock.calls.length).toBeLessThanOrEqual(events.length);
    expect(spies.formatDay).toHaveBeenCalledTimes(3);
    expect(spies.formatTime).toHaveBeenCalledTimes(3);
  });

  it("never emits a separator for untimestamped events", () => {
    const rows = buildRows([event("1"), event("2")]);
    expect(rows.map((row) => row.showSeparator)).toEqual([false, false]);
    expect(spies.formatDay).not.toHaveBeenCalled();
  });
});
