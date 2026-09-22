export const SCROLLBACK_LIMIT_BYTES = 262_144;
export const FLUSH_THRESHOLD_BYTES = 65_536;
export const REPLAY_PREFIX = "\x1b[0m\x1b[?25h";
export const DEFAULT_COLS = 80;
export const DEFAULT_ROWS = 24;
export const MAX_COLS = 1000;
export const MAX_ROWS = 1000;

const TERMINAL_ID = /^terminal:[0-9a-fA-F-]{36}$/;

export type TerminalEvent =
  | { type: "terminalData"; terminalId: string; data: string }
  | {
      type: "terminalExit";
      terminalId: string;
      exitCode: number | null;
      signal: number | null;
    }
  | { type: "terminalReset"; terminalId: string };

export type TerminalCreateResult = { terminalId: string; title: string };

export type TerminalAttachResult =
  | {
      ok: true;
      data: string;
      exited: boolean;
      exitCode: number | null;
      signal: number | null;
    }
  | { ok: false; reason: "missing" };

export function isTerminalId(value: unknown): value is `terminal:${string}` {
  return typeof value === "string" && TERMINAL_ID.test(value);
}

function clampDimension(value: unknown, max: number, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  const rounded = Math.floor(value);
  if (rounded < 1) return 1;
  return rounded > max ? max : rounded;
}

export function clampCols(value: unknown): number {
  return clampDimension(value, MAX_COLS, DEFAULT_COLS);
}

export function clampRows(value: unknown): number {
  return clampDimension(value, MAX_ROWS, DEFAULT_ROWS);
}
