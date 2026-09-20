import { useCallback, useEffect, useState } from "react";
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

export function usePanelStore(sessionId: string | null) {
  const [panels, setPanels] = useState(readPanelsSafe);
  const [width, setWidthState] = useState(() => readWidthSafe(sessionId));

  useEffect(() => {
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
      setPanels((prev) => {
        const current = prev[sessionId] ?? EMPTY_PANEL_STATE;
        const next = panelReducer(current, action);
        const bySession = { ...prev };
        if (next.surfaces.length === 0) delete bySession[sessionId];
        else bySession[sessionId] = next;
        return bySession;
      });
    },
    [sessionId],
  );

  const setWidth = useCallback(
    (value: number, persist = false) => {
      setWidthState(value);
      if (persist && sessionId) writeWidthSafe(sessionId, value);
    },
    [sessionId],
  );

  const removeSession = useCallback((id: string) => {
    setPanels((prev) => {
      if (!(id in prev)) return prev;
      const bySession = { ...prev };
      delete bySession[id];
      return bySession;
    });
    clearWidthSafe(id);
  }, []);

  return { state, dispatch, width, setWidth, removeSession };
}
