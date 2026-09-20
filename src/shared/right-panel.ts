export type RightPanelKind = "changes" | "files" | "plan" | "file";

export type SingletonSurface =
  | { id: "changes"; kind: "changes" }
  | { id: "files"; kind: "files" }
  | { id: "plan"; kind: "plan" };

export type FileSurface = {
  id: `file:${string}`;
  kind: "file";
  path: string;
  revealLine: number | null;
  revealRequestId: number;
};

export type RightPanelSurface = SingletonSurface | FileSurface;

export type SessionPanelState = {
  isOpen: boolean;
  activeSurfaceId: string | null;
  surfaces: RightPanelSurface[];
};

export const EMPTY_PANEL_STATE: SessionPanelState = {
  isOpen: false,
  activeSurfaceId: null,
  surfaces: [],
};

export type PanelAction =
  | { type: "open"; kind: "changes" | "files" | "plan" }
  | { type: "openFile"; path: string; line?: number | null }
  | { type: "activate"; id: string }
  | { type: "close"; id: string }
  | { type: "closeOthers"; id: string }
  | { type: "closeAll" }
  | { type: "togglePanel" }
  | { type: "hide" }
  | { type: "show" }
  | { type: "removeSession" };

export function fileSurfaceId(path: string): `file:${string}` {
  return `file:${path}`;
}

function upsert(
  surfaces: RightPanelSurface[],
  surface: RightPanelSurface,
): RightPanelSurface[] {
  const index = surfaces.findIndex((entry) => entry.id === surface.id);
  if (index === -1) return [...surfaces, surface];
  const next = surfaces.slice();
  next[index] = surface;
  return next;
}

function dropFileSurfaces(surfaces: RightPanelSurface[]): RightPanelSurface[] {
  return surfaces.filter((surface) => surface.kind !== "file");
}

function dropFilesExplorer(surfaces: RightPanelSurface[]): RightPanelSurface[] {
  return surfaces.filter((surface) => surface.kind !== "files");
}

function normalize(state: SessionPanelState): SessionPanelState {
  return state.surfaces.length === 0 ? EMPTY_PANEL_STATE : state;
}

export function panelReducer(
  state: SessionPanelState,
  action: PanelAction,
): SessionPanelState {
  switch (action.type) {
    case "open": {
      const surface: SingletonSurface =
        action.kind === "changes"
          ? { id: "changes", kind: "changes" }
          : action.kind === "files"
            ? { id: "files", kind: "files" }
            : { id: "plan", kind: "plan" };
      const base = action.kind === "files" ? dropFileSurfaces(state.surfaces) : state.surfaces;
      return { isOpen: true, activeSurfaceId: surface.id, surfaces: upsert(base, surface) };
    }
    case "openFile": {
      const id = fileSurfaceId(action.path);
      const existing = state.surfaces.find((entry) => entry.id === id);
      const previous = existing?.kind === "file" ? existing : null;
      const surface: FileSurface = {
        id,
        kind: "file",
        path: action.path,
        revealLine: action.line ?? previous?.revealLine ?? null,
        revealRequestId: previous ? previous.revealRequestId + 1 : 0,
      };
      return {
        isOpen: true,
        activeSurfaceId: id,
        surfaces: upsert(dropFilesExplorer(state.surfaces), surface),
      };
    }
    case "activate": {
      if (!state.surfaces.some((entry) => entry.id === action.id)) return state;
      return { ...state, isOpen: true, activeSurfaceId: action.id };
    }
    case "close": {
      const index = state.surfaces.findIndex((entry) => entry.id === action.id);
      if (index === -1) return state;
      const surfaces = state.surfaces.filter((entry) => entry.id !== action.id);
      if (surfaces.length === 0) return EMPTY_PANEL_STATE;
      const activeSurfaceId =
        state.activeSurfaceId === action.id
          ? surfaces[Math.min(index, surfaces.length - 1)]!.id
          : state.activeSurfaceId;
      return { ...state, surfaces, activeSurfaceId };
    }
    case "closeOthers": {
      const surface = state.surfaces.find((entry) => entry.id === action.id);
      if (!surface) return state;
      return { isOpen: true, activeSurfaceId: surface.id, surfaces: [surface] };
    }
    case "closeAll":
      return EMPTY_PANEL_STATE;
    case "togglePanel": {
      if (state.isOpen) return { ...state, isOpen: false };
      if (state.activeSurfaceId) return { ...state, isOpen: true };
      return panelReducer(state, { type: "open", kind: "changes" });
    }
    case "hide":
      return normalize({ ...state, isOpen: false });
    case "show":
      return normalize({ ...state, isOpen: state.surfaces.length > 0 && true });
    case "removeSession":
      return EMPTY_PANEL_STATE;
    default:
      return state;
  }
}
