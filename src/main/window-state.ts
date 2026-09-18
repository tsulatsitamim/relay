export type WindowState = {
  x?: number;
  y?: number;
  width: number;
  height: number;
  maximized?: boolean;
};

export type WorkArea = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export const MIN_WINDOW_WIDTH = 480;
export const MIN_WINDOW_HEIGHT = 360;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function parseWindowState(raw: string | undefined | null): WindowState | null {
  if (typeof raw !== "string" || raw.length === 0) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return null;
  }
  const record = parsed as Record<string, unknown>;
  if (!isFiniteNumber(record.width) || !isFiniteNumber(record.height)) {
    return null;
  }
  const state: WindowState = {
    width: Math.max(MIN_WINDOW_WIDTH, record.width),
    height: Math.max(MIN_WINDOW_HEIGHT, record.height),
  };
  if (isFiniteNumber(record.x)) state.x = record.x;
  if (isFiniteNumber(record.y)) state.y = record.y;
  if (typeof record.maximized === "boolean") state.maximized = record.maximized;
  return state;
}

export function serializeWindowState(state: WindowState): string {
  const record: Record<string, number | boolean> = {};
  if (isFiniteNumber(state.x)) record.x = state.x;
  if (isFiniteNumber(state.y)) record.y = state.y;
  record.width = state.width;
  record.height = state.height;
  if (typeof state.maximized === "boolean") record.maximized = state.maximized;
  return JSON.stringify(record);
}

export function clampToWorkArea(state: WindowState, workArea: WorkArea): WindowState {
  const minWidth = Math.max(MIN_WINDOW_WIDTH, workArea.width);
  const minHeight = Math.max(MIN_WINDOW_HEIGHT, workArea.height);
  const width = Math.min(Math.max(MIN_WINDOW_WIDTH, state.width), minWidth);
  const height = Math.min(Math.max(MIN_WINDOW_HEIGHT, state.height), minHeight);
  const result: WindowState = { width, height };
  if (typeof state.maximized === "boolean") result.maximized = state.maximized;
  if (isFiniteNumber(state.x)) {
    const maxX = workArea.x + workArea.width - width;
    result.x = Math.min(Math.max(state.x, workArea.x), Math.max(workArea.x, maxX));
  }
  if (isFiniteNumber(state.y)) {
    const maxY = workArea.y + workArea.height - height;
    result.y = Math.min(Math.max(state.y, workArea.y), Math.max(workArea.y, maxY));
  }
  return result;
}