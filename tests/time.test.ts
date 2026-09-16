import { describe, expect, it } from "vitest";
import { formatDay, formatTime } from "../src/renderer/time.ts";

const morning = new Date(2026, 0, 2, 9, 5).getTime();
const afternoon = new Date(2026, 0, 2, 15, 45).getTime();
const nextDay = new Date(2026, 0, 3, 9, 5).getTime();

describe("time formatting", () => {
  it("formats a timestamp as a short local time", () => {
    expect(formatTime(morning)).toBe(
      new Date(morning).toLocaleTimeString(undefined, {
        hour: "2-digit",
        minute: "2-digit",
      }),
    );
  });

  it("formats a timestamp as a local calendar day", () => {
    expect(formatDay(morning)).toBe(
      new Date(morning).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      }),
    );
  });

  it("groups times on the same local day and separates different days", () => {
    expect(formatDay(morning)).toBe(formatDay(afternoon));
    expect(formatDay(morning)).not.toBe(formatDay(nextDay));
  });

  it("distinguishes different times of day", () => {
    expect(formatTime(morning)).not.toBe(formatTime(afternoon));
  });
});
