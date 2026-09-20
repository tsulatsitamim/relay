import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { GitChangesResult } from "../../shared/git.ts";
import type { PanelAction, SessionPanelState } from "../../shared/right-panel.ts";
import type { PlanEntry } from "../../shared/types.ts";
import { clampPanelWidth } from "./persist.ts";
import { PanelChanges } from "./PanelChanges.tsx";
import { PanelFile } from "./PanelFile.tsx";
import { PanelFiles } from "./PanelFiles.tsx";
import { PanelPlan } from "./PanelPlan.tsx";
import { RightPanelTabs } from "./RightPanelTabs.tsx";

const OVERLAY_BREAKPOINT = 980;

type Props = {
  sessionId: string;
  cwd: string;
  state: SessionPanelState;
  dispatch: (action: PanelAction) => void;
  width: number;
  setWidth: (width: number, persist?: boolean) => void;
  changes: GitChangesResult | null;
  changesLoading: boolean;
  changesError: string | null;
  onRefreshChanges: () => void;
  planEntries: PlanEntry[];
  onOpenInEditor: (path: string, line?: number) => void;
};

export function RightPanel({
  sessionId,
  cwd,
  state,
  dispatch,
  width,
  setWidth,
  changes,
  changesLoading,
  changesError,
  onRefreshChanges,
  planEntries,
  onOpenInEditor,
}: Props) {
  const [maximized, setMaximized] = useState(false);
  const [overlay, setOverlay] = useState(
    () => typeof window !== "undefined" && window.innerWidth < OVERLAY_BREAKPOINT,
  );
  const rootRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);

  useEffect(() => {
    setMaximized(false);
  }, [sessionId]);

  useEffect(() => {
    const onResize = () => setOverlay(window.innerWidth < OVERLAY_BREAKPOINT);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    if (!overlay || !state.isOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") dispatch({ type: "hide" });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [overlay, state.isOpen, dispatch]);

  if (!state.isOpen) return null;

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    const target = event.currentTarget;
    if (typeof target.setPointerCapture === "function") {
      target.setPointerCapture(event.pointerId);
    }
    dragRef.current = { startX: event.clientX, startWidth: width };
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag) return;
    const container = rootRef.current?.parentElement;
    setWidth(
      clampPanelWidth(
        drag.startWidth - (event.clientX - drag.startX),
        window.innerWidth,
        container ? container.clientWidth : window.innerWidth,
      ),
    );
  }

  function onPointerUp() {
    if (!dragRef.current) return;
    dragRef.current = null;
    setWidth(width, true);
  }

  const active = state.surfaces.find((surface) => surface.id === state.activeSurfaceId);

  return (
    <>
      {overlay ? (
        <div className="right-panel-scrim" onClick={() => dispatch({ type: "hide" })} />
      ) : null}
      <div
        ref={rootRef}
        className={
          overlay ? "right-panel overlay" : maximized ? "right-panel maximized" : "right-panel"
        }
        style={overlay || maximized ? undefined : { width: `${width}px` }}
      >
        {overlay || maximized ? null : (
          <div
            className="right-panel-handle"
            role="separator"
            aria-label="Resize panel"
            aria-orientation="vertical"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          />
        )}
        <RightPanelTabs
          state={state}
          dispatch={dispatch}
          maximized={maximized}
          onMaximize={() => setMaximized((value) => !value)}
        />
        <div className="right-panel-body">
          {active?.kind === "changes" ? (
            <PanelChanges
              cwd={cwd}
              changes={changes}
              loading={changesLoading}
              error={changesError}
              onRefresh={onRefreshChanges}
              onOpenInEditor={(path) => onOpenInEditor(path)}
            />
          ) : null}
          {active?.kind === "files" ? (
            <PanelFiles
              cwd={cwd}
              onOpenFile={(path) => dispatch({ type: "openFile", path })}
            />
          ) : null}
          {active?.kind === "file" ? (
            <PanelFile
              cwd={cwd}
              path={active.path}
              revealLine={active.revealLine}
              revealRequestId={active.revealRequestId}
              onOpenInEditor={onOpenInEditor}
            />
          ) : null}
          {active?.kind === "plan" ? <PanelPlan entries={planEntries} /> : null}
        </div>
      </div>
    </>
  );
}
