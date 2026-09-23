import { useCallback, useEffect, useRef, useState } from "react";
import {
  EMPTY_PANEL_STATE,
  panelReducer,
  type PanelAction,
  type SessionPanelState,
} from "../../shared/right-panel.ts";
import {
  clearWidth,
  DEFAULT_PANEL_WIDTH,
  readPanels,
  readWidth,
  writePanels,
  writeWidth,
  type Panels,
} from "./persist.ts";
import { closedSurfaceIds } from "./surface-lifecycle.ts";
import type { RightPanelSurface } from "../../shared/right-panel.ts";

function readPanelsSafe(): Panels {
  try {
    return readPanels(window.localStorage);
  } catch {
    return {};
  }
}

function readWidthSafe(sessionId: string | null): number {
  if (!sessionId) return DEFAULT_PANEL_WIDTH;
  try {
    return readWidth(window.localStorage, sessionId) ?? DEFAULT_PANEL_WIDTH;
  } catch {
    return DEFAULT_PANEL_WIDTH;
  }
}

function writePanelsSafe(panels: Panels): void {
  try {
    writePanels(window.localStorage, panels);
  } catch {
    return;
  }
}

function writeWidthSafe(sessionId: string, width: number): void {
  try {
    writeWidth(window.localStorage, sessionId, width);
  } catch {
    return;
  }
}

function clearWidthSafe(sessionId: string): void {
  try {
    clearWidth(window.localStorage, sessionId);
  } catch {
    return;
  }
}

export function defaultCloseSurface(surface: RightPanelSurface): void {
  try {
    if (surface.kind === "terminal") void window.relay.terminal.close(surface.id);
    else if (surface.kind === "preview") void window.relay.preview.close(surface.id);
  } catch {
    return;
  }
}

export function usePanelStore(
  sessionId: string | null,
  closeSurface: (surface: RightPanelSurface) => void = defaultCloseSurface,
) {
  const [panels, setPanels] = useState(readPanelsSafe);
  const panelsRef = useRef(panels);
  panelsRef.current = panels;
  const [width, setWidthState] = useState(() => readWidthSafe(sessionId));
  const dirtyRef = useRef(false);

  useEffect(() => {
    if (!dirtyRef.current) return;
    dirtyRef.current = false;
    writePanelsSafe(panels);
  }, [panels]);

  useEffect(() => {
    setWidthState(readWidthSafe(sessionId));
  }, [sessionId]);

  const state: SessionPanelState = sessionId
    ? panels[sessionId] ?? EMPTY_PANEL_STATE
    : EMPTY_PANEL_STATE;

  const dispatch = useCallback(
    (action: PanelAction) => {
      if (!sessionId) return;
      dirtyRef.current = true;
      const current = panelsRef.current[sessionId] ?? EMPTY_PANEL_STATE;
      const next = panelReducer(current, action);
      for (const surface of closedSurfaceIds(current.surfaces, next.surfaces)) {
        closeSurface(surface);
      }
      const mirror = { ...panelsRef.current };
      if (next.surfaces.length === 0) delete mirror[sessionId];
      else mirror[sessionId] = next;
      panelsRef.current = mirror;
      setPanels((prev) => {
        const from = prev[sessionId] ?? EMPTY_PANEL_STATE;
        const resolved = panelReducer(from, action);
        const bySession = { ...prev };
        if (resolved.surfaces.length === 0) delete bySession[sessionId];
        else bySession[sessionId] = resolved;
        return bySession;
      });
    },
    [sessionId, closeSurface],
  );

  const setWidth = useCallback(
    (value: number, persist = false) => {
      setWidthState(value);
      if (persist && sessionId) writeWidthSafe(sessionId, value);
    },
    [sessionId],
  );

  const removeSession = useCallback(
    (id: string) => {
      dirtyRef.current = true;
      for (const surface of closedSurfaceIds(
        panelsRef.current[id]?.surfaces ?? [],
        [],
      )) {
        closeSurface(surface);
      }
      setPanels((prev) => {
        if (!(id in prev)) return prev;
        const bySession = { ...prev };
        delete bySession[id];
        return bySession;
      });
      clearWidthSafe(id);
    },
    [closeSurface],
  );

  return { state, dispatch, width, setWidth, removeSession };
}
