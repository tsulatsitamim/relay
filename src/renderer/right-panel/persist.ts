import {
  fileSurfaceId,
  type RightPanelSurface,
  type SessionPanelState,
} from "../../shared/right-panel.ts";

export const PANELS_STORAGE_KEY = "relay.rightPanel";
export const PANELS_VERSION = 1;
export const WIDTH_STORAGE_PREFIX = "relay.rightPanelWidth:";
export const DEFAULT_PANEL_WIDTH = 540;
export const MIN_PANEL_WIDTH = 360;
export const MIN_CHAT_WIDTH = 360;
export const VIEWPORT_WIDTH_FRACTION = 0.7;

export type Panels = Record<string, SessionPanelState>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function positiveInt(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const rounded = Math.floor(value);
  return rounded >= 1 ? rounded : null;
}

function nonNegativeInt(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  const rounded = Math.floor(value);
  return rounded >= 0 ? rounded : 0;
}

export function validateSurface(value: unknown): RightPanelSurface | null {
  if (!isRecord(value)) return null;
  if (value.kind === "changes") return { id: "changes", kind: "changes" };
  if (value.kind === "files") return { id: "files", kind: "files" };
  if (value.kind === "plan") return { id: "plan", kind: "plan" };
  if (value.kind !== "file") return null;
  const path = typeof value.path === "string" && value.path ? value.path : null;
  if (!path) return null;
  return {
    id: fileSurfaceId(path),
    kind: "file",
    path,
    revealLine: positiveInt(value.revealLine),
    revealRequestId: nonNegativeInt(value.revealRequestId),
  };
}

export function validatePanelState(value: unknown): SessionPanelState | null {
  if (!isRecord(value)) return null;
  const raw = Array.isArray(value.surfaces) ? value.surfaces : [];
  const surfaces: RightPanelSurface[] = [];
  for (const entry of raw) {
    const surface = validateSurface(entry);
    if (!surface) continue;
    if (surfaces.some((seen) => seen.id === surface.id)) continue;
    surfaces.push(surface);
  }
  if (surfaces.length === 0) return null;
  const active =
    typeof value.activeSurfaceId === "string" &&
    surfaces.some((surface) => surface.id === value.activeSurfaceId)
      ? value.activeSurfaceId
      : surfaces[0]!.id;
  return { isOpen: value.isOpen === true, activeSurfaceId: active, surfaces };
}

export function parsePanels(raw: string | null): Panels {
  if (!raw) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }
  if (!isRecord(parsed) || !isRecord(parsed.bySession)) return {};
  const panels: Panels = {};
  for (const [sessionId, entry] of Object.entries(parsed.bySession)) {
    const state = validatePanelState(entry);
    if (state) panels[sessionId] = state;
  }
  return panels;
}

export function serializePanels(panels: Panels): string {
  return JSON.stringify({ version: PANELS_VERSION, bySession: panels });
}

export function readPanels(storage: Storage): Panels {
  return parsePanels(storage.getItem(PANELS_STORAGE_KEY));
}

export function writePanels(storage: Storage, panels: Panels): void {
  storage.setItem(PANELS_STORAGE_KEY, serializePanels(panels));
}

export function clampPanelWidth(
  preferred: number,
  viewportWidth: number,
  containerWidth: number,
): number {
  const capped = Math.max(
    MIN_PANEL_WIDTH,
    Math.min(
      Math.floor(viewportWidth * VIEWPORT_WIDTH_FRACTION),
      Math.floor(containerWidth) - MIN_CHAT_WIDTH,
    ),
  );
  const wanted = Number.isFinite(preferred)
    ? Math.floor(preferred)
    : DEFAULT_PANEL_WIDTH;
  return Math.max(MIN_PANEL_WIDTH, Math.min(wanted, Math.max(MIN_PANEL_WIDTH, capped)));
}

export function readWidth(storage: Storage, sessionId: string): number | null {
  const raw = storage.getItem(`${WIDTH_STORAGE_PREFIX}${sessionId}`);
  if (!raw) return null;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : null;
}

export function writeWidth(storage: Storage, sessionId: string, width: number): void {
  storage.setItem(`${WIDTH_STORAGE_PREFIX}${sessionId}`, String(Math.floor(width)));
}

export function clearWidth(storage: Storage, sessionId: string): void {
  storage.removeItem(`${WIDTH_STORAGE_PREFIX}${sessionId}`);
}
