import type { TranscriptEvent } from "../shared/types.ts";

export const RAIL_WIDTH = 72;
export const LINE_X = 12;
export const COLUMN_MAX = 768;
export const STRIP_MAX_WIDTH = 40;
export const TICK_SPACING = 8;
export const STRIP_MIN_HEIGHT = 288;
export const JUMP_OFFSET = 24;

export type RowBand = {
  index: number;
  top: number;
  bottom: number;
};

export type MinimapTurn = {
  id: string;
  prompt: string;
  reply: string;
};

export function sideGutter(viewportWidth: number): number {
  return Math.max(0, (viewportWidth - COLUMN_MAX) / 2);
}

export function stripWidth(viewportWidth: number): number {
  return Math.max(0, Math.min(STRIP_MAX_WIDTH, Math.floor(sideGutter(viewportWidth)) - LINE_X));
}

export function stripHeight(count: number, viewportHeight: number): number {
  return Math.max(0, Math.min((count - 1) * TICK_SPACING, viewportHeight - STRIP_MIN_HEIGHT));
}

export function tickOffset(index: number, count: number): number {
  if (count <= 1) return 0;
  return index / (count - 1);
}

export function tickWidth(distance: number): number {
  if (distance <= 0) return 24;
  if (distance === 1) return 16;
  if (distance === 2) return 10;
  return 8;
}

export function indexAtPoint(progress: number, count: number): number {
  if (count <= 1) return 0;
  const clamped = Math.min(1, Math.max(0, progress));
  return Math.round(clamped * (count - 1));
}

export function currentIndex(
  bands: RowBand[],
  scrollTop: number,
  viewportHeight: number,
): number {
  if (bands.length === 0) return 0;
  const viewportBottom = scrollTop + viewportHeight;
  const intersecting = bands.find(
    (band) => band.bottom > scrollTop && band.top < viewportBottom,
  );
  if (intersecting) return intersecting.index;
  let preceding = 0;
  for (const band of bands) {
    if (band.top <= scrollTop) preceding = band.index;
  }
  return preceding;
}

export function visibleIndices(
  bands: RowBand[],
  scrollTop: number,
  viewportHeight: number,
): number[] {
  const viewportBottom = scrollTop + viewportHeight;
  return bands
    .filter((band) => band.bottom > scrollTop && band.top < viewportBottom)
    .map((band) => band.index);
}

export function jumpTop(rowTop: number, offset = JUMP_OFFSET): number {
  return Math.max(0, rowTop - offset);
}

export function buildTurns(events: TranscriptEvent[]): MinimapTurn[] {
  const turns: MinimapTurn[] = [];
  for (const event of events) {
    if (event.kind === "user") {
      turns.push({ id: event.id, prompt: String(event.payload.text ?? ""), reply: "" });
    } else if (event.kind === "agent_message" && turns.length > 0) {
      turns[turns.length - 1]!.reply = String(event.payload.text ?? "");
    }
  }
  return turns;
}
