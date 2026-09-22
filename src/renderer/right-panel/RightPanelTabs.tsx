import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type {
  PanelAction,
  RightPanelSurface,
  SessionPanelState,
} from "../../shared/right-panel.ts";
import {
  IconChevronLeft,
  IconChevronRight,
  IconFiles,
  IconGitCompare,
  IconListTodo,
  IconPanelRight,
  IconPlus,
  IconX,
} from "../icons";
import { useDismissable } from "./dismiss.ts";

export const PANEL_BODY_ID = "right-panel-body";

export function tabId(surfaceId: string): string {
  return `right-panel-tab-${surfaceId.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}

export function surfaceTitle(surface: RightPanelSurface): string {
  if (surface.kind === "changes") return "Changes";
  if (surface.kind === "files") return "Files";
  if (surface.kind === "plan") return "Plan";
  const parts = surface.path.split("/");
  return parts[parts.length - 1] || surface.path;
}

function surfaceIcon(surface: RightPanelSurface): ReactNode {
  if (surface.kind === "changes") return <IconGitCompare />;
  if (surface.kind === "files") return <IconFiles />;
  if (surface.kind === "plan") return <IconListTodo />;
  return <IconFiles />;
}

const ADD_ACTIONS: Array<{ kind: "changes" | "files" | "plan"; label: string }> = [
  { kind: "changes", label: "Changes" },
  { kind: "files", label: "Files" },
  { kind: "plan", label: "Plan" },
];

type Props = {
  state: SessionPanelState;
  dispatch: (action: PanelAction) => void;
  maximized: boolean;
  onMaximize: () => void;
};

export function RightPanelTabs({ state, dispatch, maximized, onMaximize }: Props) {
  const [addOpen, setAddOpen] = useState(false);
  const [menuId, setMenuId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const addRef = useRef<HTMLDivElement>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  const [overflow, setOverflow] = useState(false);
  const closeMenu = useCallback(() => setMenuId(null), []);
  const closeAdd = useCallback(() => setAddOpen(false), []);
  useDismissable(menuId !== null, menuRef, closeMenu);
  useDismissable(addOpen, addRef, closeAdd);

  useEffect(() => {
    const strip = stripRef.current;
    const update = () => {
      if (!strip) return;
      setOverflow(strip.scrollWidth > strip.clientWidth + 1);
    };
    update();
    window.addEventListener("resize", update);
    let observer: ResizeObserver | null = null;
    if (strip && typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(update);
      observer.observe(strip);
    }
    return () => {
      window.removeEventListener("resize", update);
      observer?.disconnect();
    };
  }, [state.surfaces]);

  function scrollStrip(direction: -1 | 1) {
    const strip = stripRef.current;
    if (!strip) return;
    const amount = direction * Math.max(80, Math.round(strip.clientWidth * 0.6));
    if (typeof strip.scrollBy === "function") strip.scrollBy({ left: amount });
    else strip.scrollLeft += amount;
  }

  return (
    <div className="right-panel-tabs">
      {overflow ? (
        <button
          type="button"
          className="icon-btn"
          aria-label="Scroll tabs left"
          onClick={() => scrollStrip(-1)}
        >
          <IconChevronLeft />
        </button>
      ) : null}
      <div
        className="right-panel-tab-strip"
        role="tablist"
        aria-label="Panel surfaces"
        ref={stripRef}
      >
        {state.surfaces.map((surface) => (
          <div key={surface.id} className="right-panel-tab-slot">
            <button
              id={tabId(surface.id)}
              type="button"
              role="tab"
              aria-selected={state.activeSurfaceId === surface.id}
              aria-controls={PANEL_BODY_ID}
              aria-label={surfaceTitle(surface)}
              className={
                state.activeSurfaceId === surface.id
                  ? "right-panel-tab active"
                  : "right-panel-tab"
              }
              onClick={() => dispatch({ type: "activate", id: surface.id })}
              onContextMenu={(event) => {
                event.preventDefault();
                setMenuId(surface.id);
              }}
            >
              {surfaceIcon(surface)}
              <span className="right-panel-tab-title">{surfaceTitle(surface)}</span>
            </button>
            <button
              type="button"
              className="right-panel-tab-close"
              aria-label={`Close ${surfaceTitle(surface)}`}
              onClick={(event) => {
                event.stopPropagation();
                dispatch({ type: "close", id: surface.id });
              }}
            >
              <IconX />
            </button>
            {menuId === surface.id ? (
              <div className="right-panel-menu" role="menu" ref={menuRef}>
                <button
                  type="button"
                  role="menuitem"
                  onClick={(event) => {
                    event.stopPropagation();
                    setMenuId(null);
                    dispatch({ type: "close", id: surface.id });
                  }}
                >
                  Close
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={(event) => {
                    event.stopPropagation();
                    setMenuId(null);
                    dispatch({ type: "closeOthers", id: surface.id });
                  }}
                >
                  Close others
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={(event) => {
                    event.stopPropagation();
                    setMenuId(null);
                    dispatch({ type: "closeAll" });
                  }}
                >
                  Close all
                </button>
              </div>
            ) : null}
          </div>
        ))}
        <div className="right-panel-add" ref={addRef}>
          <button
            type="button"
            className="icon-btn"
            aria-label="Add panel surface"
            onClick={() => setAddOpen((value) => !value)}
          >
            <IconPlus />
          </button>
          {addOpen ? (
            <div className="right-panel-menu" role="menu">
              {ADD_ACTIONS.map((action) => (
                <button
                  key={action.kind}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setAddOpen(false);
                    dispatch({ type: "open", kind: action.kind });
                  }}
                >
                  {action.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>
      {overflow ? (
        <button
          type="button"
          className="icon-btn"
          aria-label="Scroll tabs right"
          onClick={() => scrollStrip(1)}
        >
          <IconChevronRight />
        </button>
      ) : null}
      <button
        type="button"
        className="icon-btn"
        aria-label={maximized ? "Restore panel size" : "Maximize panel"}
        onClick={onMaximize}
      >
        <IconPanelRight />
      </button>
    </div>
  );
}
