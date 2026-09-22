import { describe, expect, it } from "vitest";
import {
  DEFAULT_COLS,
  DEFAULT_ROWS,
  MAX_COLS,
  MAX_ROWS,
  clampCols,
  clampRows,
  isTerminalId,
} from "../src/shared/terminal.ts";

describe("clampCols and clampRows", () => {
  it("passes through a sane size and floors fractions", () => {
    expect(clampCols(120)).toBe(120);
    expect(clampRows(33.9)).toBe(33);
  });

  it("clamps to the supported range", () => {
    expect(clampCols(0)).toBe(1);
    expect(clampCols(-40)).toBe(1);
    expect(clampCols(1e9)).toBe(MAX_COLS);
    expect(clampRows(1e9)).toBe(MAX_ROWS);
  });

  it("falls back for junk", () => {
    expect(clampCols(Number.NaN)).toBe(DEFAULT_COLS);
    expect(clampCols("80")).toBe(DEFAULT_COLS);
    expect(clampCols(null)).toBe(DEFAULT_COLS);
    expect(clampRows(undefined)).toBe(DEFAULT_ROWS);
  });
});

describe("isTerminalId", () => {
  it("accepts a main-minted uuid id", () => {
    expect(isTerminalId("terminal:2f1a3c4d-5b6e-4f70-8a9b-0c1d2e3f4a5b")).toBe(true);
  });

  it("rejects counters, other kinds and non-strings", () => {
    expect(isTerminalId("terminal:1")).toBe(false);
    expect(isTerminalId("file:src/a.ts")).toBe(false);
    expect(isTerminalId("terminal:2f1a3c4d5b6e4f708a9b0c1d2e3f4a5b")).toBe(false);
    expect(isTerminalId(null)).toBe(false);
    expect(isTerminalId(7)).toBe(false);
  });
});
