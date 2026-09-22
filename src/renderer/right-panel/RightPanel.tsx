import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { GitChangesResult } from "../../shared/git.ts";
import type { PanelAction, SessionPanelState } from "../../shared/right-panel.ts";
import type { PlanEntry } from "../../shared/types.ts";
import { clampPanelWidth, shouldOverlayPanel } from "./persist.ts";
import { PanelChanges } from "./PanelChanges.tsx";
import { PanelFile } from "./PanelFile.tsx";
import { PanelFiles } from "./PanelFiles.tsx";
import { PanelPlan } from "./PanelPlan.tsx";
import { PanelTerminal } from "./PanelTerminal.tsx";
import { PANEL_BODY_ID, RightPanelTabs, tabId } from "./RightPanelTabs.tsx";
import { useTerminalLauncher } from "./useTerminalLauncher.ts";

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
  onOpenInEditor: (path: string, cwd?: string, line?: number) => void;
  onNewTerminal?: () => void;
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
  onNewTerminal: onNewTerminalProp,
}: Props) {
  const [maximized, setMaximized] = useState(false);
  const [overlay, setOverlay] = useState(
    () => typeof window !== "undefined" && shouldOverlayPanel(null, window.innerWidth),
  );
  const rootRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startX: number; startWidth: number; lastWidth: number } | null>(
    null,
  );

  useEffect(() => {
    setMaximized(false);
  }, [sessionId]);

  useEffect(() => {
    const container = rootRef.current?.parentElement ?? null;
    const update = () => {
      setOverlay(
        shouldOverlayPanel(container ? container.clientWidth : null, window.innerWidth),
      );
    };
    update();
    window.addEventListener("resize", update);
    let observer: ResizeObserver | null = null;
    if (container && typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(update);
      observer.observe(container);
    }
    return () => {
      window.removeEventListener("resize", update);
      observer?.disconnect();
    };
  }, [state.isOpen]);

  useEffect(() => {
    if (!overlay || !state.isOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") dispatch({ type: "hide" });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [overlay, state.isOpen, dispatch]);

  const launcher = useTerminalLauncher(sessionId, dispatch);
  const onNewTerminal = onNewTerminalProp ?? launcher.launch;

  if (!state.isOpen) return null;

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    const target = event.currentTarget;
    if (typeof target.setPointerCapture === "function") {
      target.setPointerCapture(event.pointerId);
    }
    dragRef.current = { startX: event.clientX, startWidth: width, lastWidth: width };
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag) return;
    const container = rootRef.current?.parentElement;
    const clamped = clampPanelWidth(
      drag.startWidth - (event.clientX - drag.startX),
      window.innerWidth,
      container ? container.clientWidth : window.innerWidth,
    );
    drag.lastWidth = clamped;
    setWidth(clamped);
  }

  function onPointerUp() {
    const drag = dragRef.current;
    if (!drag) return;
    dragRef.current = null;
    setWidth(drag.lastWidth, true);
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
          onNewTerminal={onNewTerminal}
        />
        {launcher.error ? <p className="panel-note">{launcher.error}</p> : null}
        <div
          className="right-panel-body"
          id={PANEL_BODY_ID}
          role="tabpanel"
          aria-labelledby={active ? tabId(active.id) : undefined}
        >
          {active?.kind === "changes" ? (
            <PanelChanges
              cwd={cwd}
              changes={changes}
              loading={changesLoading}
              error={changesError}
              onRefresh={onRefreshChanges}
              onOpenInEditor={(path, cwd) => onOpenInEditor(path, cwd)}
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
              onOpenInEditor={(path, line) => onOpenInEditor(path, undefined, line)}
            />
          ) : null}
          {active?.kind === "plan" ? <PanelPlan entries={planEntries} /> : null}
          {active?.kind === "terminal" ? (
            <PanelTerminal
              terminalId={active.id}
              onStartNew={onNewTerminal}
              onCloseSelf={() => dispatch({ type: "close", id: active.id })}
            />
          ) : null}
        </div>
      </div>
    </>
  );
}
